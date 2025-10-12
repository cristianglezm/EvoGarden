import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { processFlowerTick, processFlowerSeedTick } from './flowerBehavior';
import type { Flower, Grid, CellContent, FlowerSeed } from '../../types';
import { DEFAULT_SIM_PARAMS, FLOWER_STAMINA_COST_PER_TICK, FLOWER_TICK_COST_MULTIPLIER, FLOWER_EXPANSION_CHANCE, PROXIMITY_POLLINATION_CHANCE, SEED_HEALTH } from '../../constants';
import { AsyncFlowerFactory } from '../asyncFlowerFactory';

vi.mock('../asyncFlowerFactory');

describe('flowerBehavior', () => {
    let flower: Flower;
    let grid: Grid;
    let mockAsyncFlowerFactory: AsyncFlowerFactory;
    let requestNewFlower: Mock;
    let newActorQueue: CellContent[];
    let claimedCellsThisTick: Set<string>;
    const getNextId = vi.fn((type: string, x: number, y: number) => `mock-${type}-${x}-${y}`);

    const mockFlower: Flower = {
        id: 'flower1', type: 'flower', x: 5, y: 5,
        genome: 'g1', imageData: '', health: 100, stamina: 100,
        age: 51, isMature: true, maxHealth: 100, maxStamina: 100,
        maturationPeriod: 50, nutrientEfficiency: 1.0, sex: 'both',
        minTemperature: 10, maxTemperature: 30, toxicityRate: 0.1,
        effects: { vitality: 1, agility: 1, strength: 1, intelligence: 1, luck: 1 }
    };

    const mockSeed: FlowerSeed = { id: 'seed-1', type: 'flowerSeed', x: 0, y: 0, imageData: 'stem-image', health: SEED_HEALTH, maxHealth: SEED_HEALTH, age: 0 };

    beforeEach(() => {
        flower = { ...mockFlower };
        grid = Array.from({ length: 15 }, () => Array.from({ length: 15 }, () => []));
        grid[5][5].push(flower);
        
        requestNewFlower = vi.fn().mockImplementation((_state, x, y, _parent1, _parent2, _id) => {
            return { ...mockSeed, id: `seed-${x}-${y}`, x, y };
        });
        mockAsyncFlowerFactory = new (AsyncFlowerFactory as any)();
        mockAsyncFlowerFactory.requestNewFlower = requestNewFlower;

        newActorQueue = [];
        claimedCellsThisTick = new Set<string>();
        getNextId.mockClear();
    });
    
    const setupContext = () => ({
        grid,
        params: DEFAULT_SIM_PARAMS,
        asyncFlowerFactory: mockAsyncFlowerFactory,
        currentTemperature: DEFAULT_SIM_PARAMS.temperature, // Default to a neutral temperature
        nextActorState: new Map<string, CellContent>(),
        claimedCellsThisTick,
        getNextId,
    });

    it('should age and consume stamina', () => {
        const initialAge = flower.age;
        const initialStamina = flower.stamina;
        processFlowerTick(flower, setupContext(), newActorQueue);
        expect(flower.age).toBe(initialAge + 1);
        expect(flower.stamina).toBe(initialStamina - (FLOWER_STAMINA_COST_PER_TICK * FLOWER_TICK_COST_MULTIPLIER));
    });

    it('should consume health if stamina is zero', () => {
        flower.stamina = 0;
        const initialHealth = flower.health;
        processFlowerTick(flower, setupContext(), newActorQueue);
        expect(flower.health).toBeLessThan(initialHealth);
    });

    it('should double stamina cost when temperature is outside optimal range', () => {
        const context = setupContext();
        context.currentTemperature = flower.maxTemperature + 5; // Outside range
        const initialStamina = flower.stamina;

        processFlowerTick(flower, context, newActorQueue);
        
        const expectedCost = FLOWER_STAMINA_COST_PER_TICK * FLOWER_TICK_COST_MULTIPLIER * 2;
        expect(flower.stamina).toBe(initialStamina - expectedCost);
    });

    it('should trigger expansion, queue a new FlowerSeed, and claim the cell', () => {
        vi.spyOn(Math, 'random').mockReturnValue(FLOWER_EXPANSION_CHANCE / 2);
        const context = setupContext();
        processFlowerTick(flower, context, newActorQueue);
        expect(requestNewFlower).toHaveBeenCalled();
        expect(requestNewFlower).toHaveBeenCalledWith(context.nextActorState, expect.any(Number), expect.any(Number), flower.genome, undefined, expect.any(Function));
        expect(newActorQueue.length).toBe(1);
        
        const createdSeed = newActorQueue[0] as FlowerSeed;
        expect(claimedCellsThisTick.has(`flower-${createdSeed.x}-${createdSeed.y}`)).toBe(true);
        vi.spyOn(Math, 'random').mockRestore();
    });

    it('should trigger proximity pollination, queue a new FlowerSeed, and claim the cell', () => {
        const neighborFlower: Flower = { ...mockFlower, id: 'flower2', x: 5, y: 6, genome: 'g2' };
        grid[6][5].push(neighborFlower);
        vi.spyOn(Math, 'random').mockReturnValue(PROXIMITY_POLLINATION_CHANCE / 2);
        
        const context = setupContext();
        processFlowerTick(flower, context, newActorQueue);

        expect(requestNewFlower).toHaveBeenCalled();
        try {
            expect(requestNewFlower).toHaveBeenCalledWith(context.nextActorState, expect.any(Number), expect.any(Number), 'g1', 'g2', expect.any(Function));
        } catch {
            expect(requestNewFlower).toHaveBeenCalledWith(context.nextActorState, expect.any(Number), expect.any(Number), 'g2', 'g1', expect.any(Function));
        }
        expect(newActorQueue.length).toBe(1);
        const createdSeed = newActorQueue[0] as FlowerSeed;
        expect(claimedCellsThisTick.has(`flower-${createdSeed.x}-${createdSeed.y}`)).toBe(true);

        vi.spyOn(Math, 'random').mockRestore();
    });

    it('should not attempt to expand into a cell that is already claimed', () => {
        // Fill the entire grid with blocker flowers
        for (let y = 0; y < grid.length; y++) {
            for (let x = 0; x < grid[y].length; x++) {
                if (x !== flower.x || y !== flower.y) {
                    grid[y][x].push({ id: `blocker-${x}-${y}`, type: 'flower' } as CellContent);
                }
            }
        }
        
        // Unblock one neighboring spot, making it the only valid cell on the grid.
        const emptySpot = { x: 4, y: 5 };
        grid[emptySpot.y][emptySpot.x] = [];

        // Claim that single available spot for the current tick.
        claimedCellsThisTick.add(`flower-${emptySpot.x}-${emptySpot.y}`);

        // Force an expansion attempt.
        vi.spyOn(Math, 'random').mockReturnValue(FLOWER_EXPANSION_CHANCE / 2); 

        processFlowerTick(flower, setupContext(), newActorQueue);

        // The expansion should fail because the only available cell was already claimed this tick.
        expect(requestNewFlower).not.toHaveBeenCalled();
        expect(newActorQueue.length).toBe(0);

        vi.spyOn(Math, 'random').mockRestore();
    });

    describe('processFlowerSeedTick', () => {
        let seed: FlowerSeed;
        let mockAsyncFlowerFactory: AsyncFlowerFactory;
        let cancelFlowerRequest: Mock;
        let nextActorState: Map<string, CellContent>;

        beforeEach(() => {
            seed = { id: 'seed-1', type: 'flowerSeed', x: 1, y: 1, imageData: 'stem', health: 5, maxHealth: 5, age: 0 };
            nextActorState = new Map();
            nextActorState.set(seed.id, seed);
            
            cancelFlowerRequest = vi.fn();
            mockAsyncFlowerFactory = new (AsyncFlowerFactory as any)();
            mockAsyncFlowerFactory.cancelFlowerRequest = cancelFlowerRequest;
        });

        const setupSeedContext = () => ({
            grid: [], // not needed for this test
            params: DEFAULT_SIM_PARAMS,
            asyncFlowerFactory: mockAsyncFlowerFactory,
            currentTemperature: DEFAULT_SIM_PARAMS.temperature,
            nextActorState,
            claimedCellsThisTick: new Set<string>(), // Not used by seed tick, but required by context type
            getNextId,
        });

        it('should age the seed', () => {
            const context = setupSeedContext();
            processFlowerSeedTick(seed, context);
            expect(seed.age).toBe(1);
            expect(nextActorState.has(seed.id)).toBe(true);
            expect(cancelFlowerRequest).not.toHaveBeenCalled();
        });

        it('should be removed and send a cancellation request when health reaches zero', () => {
            seed.health = 0;
            const context = setupSeedContext();
            processFlowerSeedTick(seed, context);
            expect(nextActorState.has(seed.id)).toBe(false);
            expect(cancelFlowerRequest).toHaveBeenCalledWith(seed.id);
        });
    });
});
