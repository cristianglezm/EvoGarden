import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { processFlowerTick } from './flowerBehavior';
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

    const mockFlower: Flower = {
        id: 'flower1', type: 'flower', x: 5, y: 5,
        genome: 'g1', imageData: '', health: 100, stamina: 100,
        age: 51, isMature: true, maxHealth: 100, maxStamina: 100,
        maturationPeriod: 50, nutrientEfficiency: 1.0, sex: 'both',
        minTemperature: 10, maxTemperature: 30, toxicityRate: 0.1,
        effects: { vitality: 1, agility: 1, strength: 1, intelligence: 1, luck: 1 }
    };

    const mockSeed: FlowerSeed = { id: 'seed-1', type: 'flowerSeed', x: 4, y: 5, imageData: 'stem-image', health: SEED_HEALTH, maxHealth: SEED_HEALTH, age: 0 };

    beforeEach(() => {
        flower = { ...mockFlower };
        grid = Array.from({ length: 15 }, () => Array.from({ length: 15 }, () => []));
        grid[5][5].push(flower);
        
        requestNewFlower = vi.fn().mockReturnValue(mockSeed);
        mockAsyncFlowerFactory = new (AsyncFlowerFactory as any)();
        mockAsyncFlowerFactory.requestNewFlower = requestNewFlower;

        newActorQueue = [];
    });
    
    const setupContext = () => ({
        grid,
        params: DEFAULT_SIM_PARAMS,
        asyncFlowerFactory: mockAsyncFlowerFactory,
        currentTemperature: DEFAULT_SIM_PARAMS.temperature, // Default to a neutral temperature
        nextActorState: new Map<string, CellContent>(),
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

    it('should trigger expansion and queue a new FlowerSeed', () => {
        vi.spyOn(Math, 'random').mockReturnValue(FLOWER_EXPANSION_CHANCE / 2);
        const context = setupContext();
        processFlowerTick(flower, context, newActorQueue);
        expect(requestNewFlower).toHaveBeenCalled();
        expect(requestNewFlower).toHaveBeenCalledWith(context.nextActorState, expect.any(Number), expect.any(Number), flower.genome);
        expect(newActorQueue.length).toBe(1);
        expect(newActorQueue[0]).toEqual(mockSeed);
        vi.spyOn(Math, 'random').mockRestore();
    });

    it('should trigger proximity pollination and queue a new FlowerSeed', () => {
        const neighborFlower: Flower = { ...mockFlower, id: 'flower2', x: 5, y: 6, genome: 'g2' };
        grid[6][5].push(neighborFlower);
        vi.spyOn(Math, 'random').mockReturnValue(PROXIMITY_POLLINATION_CHANCE / 2);
        
        const context = setupContext();
        processFlowerTick(flower, context, newActorQueue);

        expect(requestNewFlower).toHaveBeenCalled();
        try {
            expect(requestNewFlower).toHaveBeenCalledWith(context.nextActorState, expect.any(Number), expect.any(Number), 'g1', 'g2');
        } catch {
            expect(requestNewFlower).toHaveBeenCalledWith(context.nextActorState, expect.any(Number), expect.any(Number), 'g2', 'g1');
        }
        expect(newActorQueue.length).toBe(1);
        expect(newActorQueue[0]).toEqual(mockSeed);

        vi.spyOn(Math, 'random').mockRestore();
    });
});
