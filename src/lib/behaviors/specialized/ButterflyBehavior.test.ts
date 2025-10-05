import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { ButterflyBehavior } from './ButterflyBehavior';
import type { Insect, Flower, Grid, CellContent, AppEvent, FlowerSeed } from '../../../types';
import { Quadtree, Rectangle } from '../../Quadtree';
import { DEFAULT_SIM_PARAMS, INSECT_MOVE_COST, INSECT_STAMINA_REGEN_PER_TICK, INSECT_DATA, INSECT_DORMANCY_TEMP, INSECT_POLLINATION_CHANCE } from '../../../constants';
import { AsyncFlowerFactory } from '../../asyncFlowerFactory';

vi.mock('../../asyncFlowerFactory');

describe('ButterflyBehavior', () => {
    let behavior: ButterflyBehavior;
    let butterfly: Insect;
    let grid: Grid;
    let nextActorState: Map<string, CellContent>;
    let flowerQtree: Quadtree<CellContent>;
    let mockAsyncFlowerFactory: AsyncFlowerFactory;
    let requestNewFlower: Mock;
    let events: AppEvent[];
    let newActorQueue: CellContent[];
    const getNextId = vi.fn((type: string, x: number, y: number) => `mock-${type}-${x}-${y}`);
    
    const mockFlower: Flower = {
        id: 'flower1', type: 'flower', x: 8, y: 8,
        genome: 'g1', imageData: '', health: 100, stamina: 100,
        age: 51, isMature: true, maxHealth: 100, maxStamina: 100,
        maturationPeriod: 50, nutrientEfficiency: 1.0, sex: 'both',
        minTemperature: 10, maxTemperature: 30, toxicityRate: 0.0,
        effects: { vitality: 1, agility: 1, strength: 1, intelligence: 1, luck: 1 }
    };
    const mockSeed: FlowerSeed = { id: 'seed-1', type: 'flowerSeed', x: 0, y: 0, imageData: 'stem-image', health: 10, maxHealth: 10, age: 0 };

    beforeEach(() => {
        behavior = new ButterflyBehavior();
        const baseStats = INSECT_DATA.get('🦋')!;
        butterfly = { 
            id: 'insect1', type: 'insect', x: 5, y: 5, pollen: null, emoji: '🦋', 
            health: baseStats.maxHealth,
            maxHealth: baseStats.maxHealth,
            stamina: baseStats.maxStamina,
            maxStamina: baseStats.maxStamina,
            genome: Array(9).fill(1) // Simple genome that likes everything
        };
        grid = Array.from({ length: 15 }, () => Array.from({ length: 15 }, () => []));
        grid[5][5].push(butterfly);
        nextActorState = new Map();
        nextActorState.set(butterfly.id, butterfly);
        
        requestNewFlower = vi.fn().mockReturnValue(mockSeed);
        mockAsyncFlowerFactory = new (AsyncFlowerFactory as any)();
        mockAsyncFlowerFactory.requestNewFlower = requestNewFlower;

        const boundary = new Rectangle(7.5, 7.5, 7.5, 7.5);
        flowerQtree = new Quadtree(boundary, 4);
        newActorQueue = [];
        events = [];
        getNextId.mockClear();
    });
    
    const setupContext = (): any => ({ // Using any to simplify mock context setup
        grid,
        params: DEFAULT_SIM_PARAMS,
        nextActorState,
        asyncFlowerFactory: mockAsyncFlowerFactory,
        qtree: new Quadtree(new Rectangle(7.5, 7.5, 7.5, 7.5), 4),
        flowerQtree,
        events,
        incrementInsectsDiedOfOldAge: vi.fn(),
        currentTemperature: DEFAULT_SIM_PARAMS.temperature,
        newActorQueue,
        getNextId,
    });

    it('should not damage a flower it interacts with, but picks up pollen', () => {
        const flower = { ...mockFlower, x: 5, y: 5 };
        grid[5][5].push(flower);
        nextActorState.set(flower.id, flower);
        const initialFlowerHealth = flower.health;

        const context = setupContext();
        context.qtree.insert({ x: flower.x, y: flower.y, data: flower });
        context.flowerQtree.insert({ x: flower.x, y: flower.y, data: flower });

        behavior.update(butterfly, context);
        
        const flowerState = nextActorState.get(flower.id) as Flower;
        expect(flowerState.health).toBe(initialFlowerHealth); // No damage
        expect(butterfly.pollen).toEqual({ genome: flower.genome, sourceFlowerId: flower.id, score: expect.any(Number) });
    });

    it('should pollinate a different mature flower', () => {
        const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(INSECT_POLLINATION_CHANCE / 2);

        const targetFlower: Flower = { ...mockFlower, id: 'flower2', x: 5, y: 5, genome: 'g2', isMature: true };
        grid[5][5].push(targetFlower);
        nextActorState.set(targetFlower.id, targetFlower);
        
        butterfly.pollen = { genome: 'g1', sourceFlowerId: 'flower1', score: 10 };
        
        const context = setupContext();
        context.qtree.insert({ x: targetFlower.x, y: targetFlower.y, data: targetFlower });
        context.flowerQtree.insert({ x: targetFlower.x, y: targetFlower.y, data: targetFlower });

        behavior.update(butterfly, context);
        
        expect(requestNewFlower).toHaveBeenCalledTimes(1);
        expect(requestNewFlower).toHaveBeenCalledWith(context.nextActorState, expect.any(Number), expect.any(Number), 'g2', 'g1', expect.any(Function));
        expect(newActorQueue.length).toBe(1);

        randomSpy.mockRestore();
    });

    it('should become dormant and not move when it is cold', () => {
        const context = setupContext();
        context.currentTemperature = INSECT_DORMANCY_TEMP - 1;
    
        const initialStamina = butterfly.stamina;
        const initialX = butterfly.x;
        const initialY = butterfly.y;
        
        behavior.update(butterfly, context);
        
        expect(butterfly.x).toBe(initialX);
        expect(butterfly.y).toBe(initialY);
        expect(butterfly.stamina).toBe(initialStamina);
    });

    it('should wander after interacting with a flower', () => {
        const flower = { ...mockFlower, x: 5, y: 5 };
        grid[5][5].push(flower);
        nextActorState.set(flower.id, flower);
        
        const context = setupContext();
        context.qtree.insert({ x: flower.x, y: flower.y, data: flower });
        context.flowerQtree.insert({ x: flower.x, y: flower.y, data: flower });
        
        const initialX = butterfly.x;
        const initialY = butterfly.y;

        behavior.update(butterfly, context);
        
        const moved = butterfly.x !== initialX || butterfly.y !== initialY;
        expect(moved, 'Butterfly should have moved to a different cell').toBe(true);
    });

    it('should regenerate stamina when idle (no flower interaction)', () => {
        const initialStamina = butterfly.stamina;
        // Logic: move first (cost), then regenerate (capped). But in this behavior, movement happens before regen.
        // The default insect behavior moves first, then idles.
        // Here, it checks interaction (false), then moves (cost), then regenerates because hasInteracted is false.
        const expectedStamina = Math.min(butterfly.maxStamina, (initialStamina - INSECT_MOVE_COST) + INSECT_STAMINA_REGEN_PER_TICK);
        
        behavior.update(butterfly, setupContext());

        expect(butterfly.stamina).toBe(expectedStamina);
    });
});