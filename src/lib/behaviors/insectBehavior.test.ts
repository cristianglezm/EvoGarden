import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { processInsectTick } from './insectBehavior';
import type { Insect, Flower, Grid, CellContent, AppEvent, FlowerSeed } from '../../types';
import { Quadtree, Rectangle } from '../Quadtree';
import { DEFAULT_SIM_PARAMS, INSECT_DAMAGE_TO_FLOWER, INSECT_POLLINATION_CHANCE, INSECT_LIFESPAN, SEED_HEALTH, INSECT_DORMANCY_TEMP, TOXIC_FLOWER_THRESHOLD, INSECT_DAMAGE_FROM_TOXIC_FLOWER, INSECT_HEAL_FROM_HEALING_FLOWER } from '../../constants';
import { AsyncFlowerFactory } from '../asyncFlowerFactory';

vi.mock('../asyncFlowerFactory');

const INSECT_WANDER_CHANCE = 0.2; // 20% chance to wander even if a target is found

describe('insectBehavior', () => {
    let insect: Insect;
    let grid: Grid;
    let nextActorState: Map<string, CellContent>;
    let mockAsyncFlowerFactory: AsyncFlowerFactory;
    let requestNewFlower: Mock;
    let flowerQtree: Quadtree<CellContent>;
    let newActorQueue: CellContent[];
    let events: AppEvent[];
    let incrementInsectsDiedOfOldAge: Mock;

    const mockFlower: Flower = {
        id: 'flower1', type: 'flower', x: 8, y: 8,
        genome: 'g1', imageData: '', health: 100, stamina: 100,
        age: 51, isMature: true, maxHealth: 100, maxStamina: 100,
        maturationPeriod: 50, nutrientEfficiency: 1.0, sex: 'both',
        minTemperature: 10, maxTemperature: 30, toxicityRate: 0.1,
        effects: { vitality: 1, agility: 1, strength: 1, intelligence: 1, luck: 1 }
    };
    
    const mockSeed: FlowerSeed = { id: 'seed-1', type: 'flowerSeed', x: 0, y: 0, imageData: 'stem-image', health: SEED_HEALTH, maxHealth: SEED_HEALTH, age: 0 };

    beforeEach(() => {
        insect = { id: 'insect1', type: 'insect', x: 5, y: 5, pollen: null, emoji: '🦋', lifespan: INSECT_LIFESPAN };
        grid = Array.from({ length: 15 }, () => Array.from({ length: 15 }, () => []));
        grid[5][5].push(insect);
        nextActorState = new Map();
        nextActorState.set(insect.id, insect);
        
        requestNewFlower = vi.fn().mockReturnValue(mockSeed);
        mockAsyncFlowerFactory = new (AsyncFlowerFactory as any)();
        mockAsyncFlowerFactory.requestNewFlower = requestNewFlower;

        flowerQtree = new Quadtree(new Rectangle(7.5, 7.5, 7.5, 7.5), 4);
        newActorQueue = [];
        events = [];
        incrementInsectsDiedOfOldAge = vi.fn();
    });
    
    const setupContext = () => ({
        grid,
        params: DEFAULT_SIM_PARAMS,
        nextActorState,
        asyncFlowerFactory: mockAsyncFlowerFactory,
        flowerQtree,
        events,
        incrementInsectsDiedOfOldAge,
        currentTemperature: DEFAULT_SIM_PARAMS.temperature,
    });

    it('should move towards the nearest flower in vision', () => {
        grid[8][8].push(mockFlower);
        flowerQtree.insert({ x: mockFlower.x, y: mockFlower.y, data: mockFlower });
        
        vi.spyOn(Math, 'random').mockReturnValue(INSECT_WANDER_CHANCE + 0.1);
        
        processInsectTick(insect, setupContext(), newActorQueue);
        
        expect(insect.x).toBe(6);
        expect(insect.y).toBe(6);
        vi.spyOn(Math, 'random').mockRestore();
    });

    it('should move randomly even with a target if wander chance is met', () => {
        const initialX = insect.x;
        const initialY = insect.y;
        grid[8][8].push(mockFlower);
        flowerQtree.insert({ x: mockFlower.x, y: mockFlower.y, data: mockFlower });

        vi.spyOn(Math, 'random').mockReturnValue(INSECT_WANDER_CHANCE - 0.1);

        processInsectTick(insect, setupContext(), newActorQueue);

        expect(insect.x !== initialX || insect.y !== initialY).toBe(true);
        expect(`${insect.x},${insect.y}`).not.toBe('6,6'); 
        vi.spyOn(Math, 'random').mockRestore();
    });

    it('should move randomly if no flower is in vision', () => {
        const initialX = insect.x;
        const initialY = insect.y;
        processInsectTick(insect, setupContext(), newActorQueue);
        expect(insect.x !== initialX || insect.y !== initialY).toBe(true);
    });

    it('should damage flower and pick up pollen when moving onto it', () => {
        const flower = { ...mockFlower, x: 6, y: 6 };
        grid[6][6].push(flower);
        nextActorState.set(flower.id, flower);
        flowerQtree.insert({ x: flower.x, y: flower.y, data: flower });
        
        vi.spyOn(Math, 'random').mockReturnValue(INSECT_WANDER_CHANCE + 0.1);
        processInsectTick(insect, setupContext(), newActorQueue);
        
        const flowerState = nextActorState.get(flower.id) as Flower;
        expect(insect.x).toBe(6);
        expect(insect.y).toBe(6);
        expect(flowerState.health).toBe(flower.maxHealth - INSECT_DAMAGE_TO_FLOWER);
        expect(insect.pollen).toEqual({ genome: flower.genome, sourceFlowerId: flower.id });
        vi.spyOn(Math, 'random').mockRestore();
    });

    it('should be healed by a healing flower', () => {
        const healingFlower: Flower = { ...mockFlower, id: 'h-flower', x: 6, y: 6, toxicityRate: -0.5 };
        grid[6][6].push(healingFlower);
        nextActorState.set(healingFlower.id, healingFlower);
        flowerQtree.insert({ x: healingFlower.x, y: healingFlower.y, data: healingFlower });
        vi.spyOn(Math, 'random').mockReturnValue(INSECT_WANDER_CHANCE + 0.1);

        const initialLifespan = insect.lifespan;
        processInsectTick(insect, setupContext(), newActorQueue);
        
        expect(insect.lifespan).toBe(initialLifespan -1 /* age */ + INSECT_HEAL_FROM_HEALING_FLOWER);
        vi.spyOn(Math, 'random').mockRestore();
    });
    
    it('should take damage from a toxic flower', () => {
        const toxicFlower: Flower = { ...mockFlower, id: 't-flower', x: 6, y: 6, toxicityRate: TOXIC_FLOWER_THRESHOLD + 0.1 };
        grid[6][6].push(toxicFlower);
        nextActorState.set(toxicFlower.id, toxicFlower);
        flowerQtree.insert({ x: toxicFlower.x, y: toxicFlower.y, data: toxicFlower });

        const initialLifespan = insect.lifespan;
        const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(INSECT_WANDER_CHANCE + 0.1);
        processInsectTick(insect, setupContext(), newActorQueue);
        randomSpy.mockRestore();

        expect(insect.lifespan).toBe(initialLifespan - 1 - INSECT_DAMAGE_FROM_TOXIC_FLOWER);
        const flowerState = nextActorState.get(toxicFlower.id) as Flower;
        expect(flowerState.health).toBe(toxicFlower.maxHealth - (INSECT_DAMAGE_TO_FLOWER / 2));
    });

    it('should pollinate a different mature flower and queue a FlowerSeed', () => {
        const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.3); // Ensures no wander and successful pollination check

        const targetFlower: Flower = { ...mockFlower, id: 'flower2', x: 6, y: 6, genome: 'g2', isMature: true };
        grid[6][6].push(targetFlower);
        nextActorState.set(targetFlower.id, targetFlower);
        flowerQtree.insert({ x: targetFlower.x, y: targetFlower.y, data: targetFlower });
        
        insect.pollen = { genome: 'g1', sourceFlowerId: 'flower1' };
        
        const context = setupContext();
        processInsectTick(insect, context, newActorQueue);
        
        expect(requestNewFlower).toHaveBeenCalledTimes(1);
        expect(requestNewFlower).toHaveBeenCalledWith(context.nextActorState, expect.any(Number), expect.any(Number), 'g2', 'g1');
        expect(newActorQueue.length).toBe(1);
        expect(newActorQueue[0]).toEqual(mockSeed);

        randomSpy.mockRestore();
    });

    it('should not pollinate the same flower', () => {
        vi.spyOn(Math, 'random').mockReturnValue(INSECT_POLLINATION_CHANCE / 2);

        const targetFlower: Flower = { ...mockFlower, id: 'flower1', x: 6, y: 6, genome: 'g1', isMature: true };
        grid[6][6].push(targetFlower);
        nextActorState.set(targetFlower.id, targetFlower);
        flowerQtree.insert({ x: targetFlower.x, y: targetFlower.y, data: targetFlower });
        
        insect.pollen = { genome: 'g1', sourceFlowerId: 'flower1' };
        
        processInsectTick(insect, setupContext(), newActorQueue);
        
        expect(requestNewFlower).not.toHaveBeenCalled();

        vi.spyOn(Math, 'random').mockRestore();
    });

    it('should not pollinate an immature flower', () => {
        vi.spyOn(Math, 'random').mockReturnValue(INSECT_POLLINATION_CHANCE / 2);
        
        const targetFlower: Flower = { ...mockFlower, id: 'flower2', x: 6, y: 6, genome: 'g2', isMature: false };
        grid[6][6].push(targetFlower);
        nextActorState.set(targetFlower.id, targetFlower);
        flowerQtree.insert({ x: targetFlower.x, y: targetFlower.y, data: targetFlower });

        insect.pollen = { genome: 'g1', sourceFlowerId: 'flower1' };

        processInsectTick(insect, setupContext(), newActorQueue);

        expect(requestNewFlower).not.toHaveBeenCalled();

        vi.spyOn(Math, 'random').mockRestore();
    });

    it('should die of old age, create a nutrient, and send a toast', () => {
        insect.lifespan = 1;
        
        processInsectTick(insect, setupContext(), newActorQueue);
        
        expect(nextActorState.has(insect.id)).toBe(false);
        
        const nutrient = Array.from(nextActorState.values()).find(a => a.type === 'nutrient');
        expect(nutrient).toBeDefined();
        expect(nutrient?.x).toBe(insect.x);
        expect(nutrient?.y).toBe(insect.y);
        
        expect(events.length).toBe(1);
        expect(events[0].message).toBe('💀 An insect died of old age.');
        
        expect(incrementInsectsDiedOfOldAge).toHaveBeenCalledTimes(1);
    });

    it('should be dormant and not move if temperature is below dormancy threshold', () => {
        const context = setupContext();
        context.currentTemperature = INSECT_DORMANCY_TEMP - 1; // Below threshold

        const initialX = insect.x;
        const initialY = insect.y;
        const initialLifespan = insect.lifespan;

        processInsectTick(insect, context, newActorQueue);
        
        expect(insect.x).toBe(initialX);
        expect(insect.y).toBe(initialY);
        expect(insect.lifespan).toBe(initialLifespan); // Lifespan should not decrease
        expect(newActorQueue.length).toBe(0);
        expect(events.length).toBe(0);
    });
});
