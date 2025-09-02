import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { processInsectTick } from './insectBehavior';
import type { Insect, Flower, Grid, CellContent, Coord, ToastMessage } from '../../types';
import { Quadtree, Rectangle } from '../Quadtree';
import { DEFAULT_SIM_PARAMS, INSECT_DAMAGE_TO_FLOWER, INSECT_POLLINATION_CHANCE, INSECT_LIFESPAN } from '../../constants';

describe('insectBehavior', () => {
    let insect: Insect;
    let grid: Grid;
    let nextActorState: Map<string, CellContent>;
    let createNewFlower: Mock;
    let flowerQtree: Quadtree<CellContent>;
    let newFlowerPromises: Promise<Flower | null>[];
    let newFlowerPositions: Coord[];
    let toasts: Omit<ToastMessage, 'id'>[];
    let incrementInsectsDiedOfOldAge: Mock;

    const mockFlower: Flower = {
        id: 'flower1', type: 'flower', x: 8, y: 8,
        genome: 'g1', imageData: '', health: 100, stamina: 100,
        age: 51, isMature: true, maxHealth: 100, maxStamina: 100,
        maturationPeriod: 50, nutrientEfficiency: 1.0, sex: 'both',
        minTemperature: 10, maxTemperature: 30, toxicityRate: 0.1,
        effects: { vitality: 1, agility: 1, strength: 1, intelligence: 1, luck: 1 }
    };

    beforeEach(() => {
        insect = { id: 'insect1', type: 'insect', x: 5, y: 5, pollen: null, emoji: '🦋', lifespan: INSECT_LIFESPAN };
        grid = Array.from({ length: 15 }, () => Array.from({ length: 15 }, () => []));
        grid[5][5].push(insect);
        nextActorState = new Map();
        nextActorState.set(insect.id, insect);
        createNewFlower = vi.fn().mockResolvedValue(null);
        flowerQtree = new Quadtree(new Rectangle(7.5, 7.5, 7.5, 7.5), 4);
        newFlowerPromises = [];
        newFlowerPositions = [];
        toasts = [];
        incrementInsectsDiedOfOldAge = vi.fn();
    });
    
    const setupContext = () => ({
        grid,
        params: DEFAULT_SIM_PARAMS,
        nextActorState,
        createNewFlower,
        flowerQtree,
        toasts,
        incrementInsectsDiedOfOldAge,
    });

    it('should move towards the nearest flower in vision', () => {
        grid[8][8].push(mockFlower);
        flowerQtree.insert({ x: mockFlower.x, y: mockFlower.y, data: mockFlower });
        
        processInsectTick(insect, setupContext(), newFlowerPromises, newFlowerPositions);
        
        expect(insect.x).toBe(6);
        expect(insect.y).toBe(6);
    });

    it('should move randomly if no flower is in vision', () => {
        const initialX = insect.x;
        const initialY = insect.y;
        processInsectTick(insect, setupContext(), newFlowerPromises, newFlowerPositions);
        expect(insect.x !== initialX || insect.y !== initialY).toBe(true);
    });

    it('should damage flower and pick up pollen when moving onto it', () => {
        const flower = { ...mockFlower, x: 6, y: 6 };
        grid[6][6].push(flower);
        nextActorState.set(flower.id, flower);
        flowerQtree.insert({ x: flower.x, y: flower.y, data: flower });
        
        processInsectTick(insect, setupContext(), newFlowerPromises, newFlowerPositions);
        
        const flowerState = nextActorState.get(flower.id) as Flower;
        expect(insect.x).toBe(6);
        expect(insect.y).toBe(6);
        expect(flowerState.health).toBe(flower.maxHealth - INSECT_DAMAGE_TO_FLOWER);
        expect(insect.pollen).toEqual({ genome: flower.genome, sourceFlowerId: flower.id });
    });

    it('should pollinate a different mature flower', () => {
        // Mock random to ensure pollination happens
        vi.spyOn(Math, 'random').mockReturnValue(INSECT_POLLINATION_CHANCE / 2);

        const targetFlower: Flower = { ...mockFlower, id: 'flower2', x: 6, y: 6, genome: 'g2', isMature: true };
        grid[6][6].push(targetFlower);
        nextActorState.set(targetFlower.id, targetFlower);
        // Insect is at 5,5, it will move to 6,6
        flowerQtree.insert({ x: targetFlower.x, y: targetFlower.y, data: targetFlower });
        
        insect.pollen = { genome: 'g1', sourceFlowerId: 'flower1' }; // Has pollen from another flower
        
        processInsectTick(insect, setupContext(), newFlowerPromises, newFlowerPositions);
        
        expect(createNewFlower).toHaveBeenCalledTimes(1);
        expect(createNewFlower).toHaveBeenCalledWith(expect.any(Number), expect.any(Number), 'g2', 'g1');

        vi.spyOn(Math, 'random').mockRestore();
    });

    it('should not pollinate the same flower', () => {
        vi.spyOn(Math, 'random').mockReturnValue(INSECT_POLLINATION_CHANCE / 2);

        const targetFlower: Flower = { ...mockFlower, id: 'flower1', x: 6, y: 6, genome: 'g1', isMature: true };
        grid[6][6].push(targetFlower);
        nextActorState.set(targetFlower.id, targetFlower);
        flowerQtree.insert({ x: targetFlower.x, y: targetFlower.y, data: targetFlower });
        
        insect.pollen = { genome: 'g1', sourceFlowerId: 'flower1' }; // Has pollen from the SAME flower
        
        processInsectTick(insect, setupContext(), newFlowerPromises, newFlowerPositions);
        
        expect(createNewFlower).not.toHaveBeenCalled();

        vi.spyOn(Math, 'random').mockRestore();
    });

    it('should not pollinate an immature flower', () => {
        vi.spyOn(Math, 'random').mockReturnValue(INSECT_POLLINATION_CHANCE / 2);
        
        const targetFlower: Flower = { ...mockFlower, id: 'flower2', x: 6, y: 6, genome: 'g2', isMature: false }; // Immature
        grid[6][6].push(targetFlower);
        nextActorState.set(targetFlower.id, targetFlower);
        flowerQtree.insert({ x: targetFlower.x, y: targetFlower.y, data: targetFlower });

        insect.pollen = { genome: 'g1', sourceFlowerId: 'flower1' };

        processInsectTick(insect, setupContext(), newFlowerPromises, newFlowerPositions);

        expect(createNewFlower).not.toHaveBeenCalled();

        vi.spyOn(Math, 'random').mockRestore();
    });

    it('should die of old age, create a nutrient, and send a toast', () => {
        insect.lifespan = 1; // Set lifespan to 1 so it dies on the next tick
        
        processInsectTick(insect, setupContext(), newFlowerPromises, newFlowerPositions);
        
        // Verify insect is removed
        expect(nextActorState.has(insect.id)).toBe(false);
        
        // Verify nutrient is created
        const nutrient = Array.from(nextActorState.values()).find(a => a.type === 'nutrient');
        expect(nutrient).toBeDefined();
        expect(nutrient?.x).toBe(insect.x);
        expect(nutrient?.y).toBe(insect.y);
        
        // Verify toast is sent
        expect(toasts.length).toBe(1);
        expect(toasts[0].message).toBe('💀 An insect died of old age.');
        
        // Verify analytics counter is incremented
        expect(incrementInsectsDiedOfOldAge).toHaveBeenCalledTimes(1);
    });
});
