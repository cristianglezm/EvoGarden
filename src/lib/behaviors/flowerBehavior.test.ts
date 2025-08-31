import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { processFlowerTick } from './flowerBehavior';
import type { Flower, Grid, Coord } from '../../types';
import { DEFAULT_SIM_PARAMS, FLOWER_STAMINA_COST_PER_TICK, FLOWER_TICK_COST_MULTIPLIER, FLOWER_EXPANSION_CHANCE, PROXIMITY_POLLINATION_CHANCE } from '../../constants';

describe('flowerBehavior', () => {
    let flower: Flower;
    let grid: Grid;
    let createNewFlower: Mock;
    let newFlowerPromises: Promise<Flower | null>[];
    let newFlowerPositions: Coord[];

    const mockFlower: Flower = {
        id: 'flower1', type: 'flower', x: 5, y: 5,
        genome: 'g1', imageData: '', health: 100, stamina: 100,
        age: 51, isMature: true, maxHealth: 100, maxStamina: 100,
        maturationPeriod: 50, nutrientEfficiency: 1.0, sex: 'both',
        minTemperature: 10, maxTemperature: 30, toxicityRate: 0.1,
        effects: { vitality: 1, agility: 1, strength: 1, intelligence: 1, luck: 1 }
    };

    beforeEach(() => {
        flower = { ...mockFlower };
        grid = Array.from({ length: 15 }, () => Array.from({ length: 15 }, () => []));
        grid[5][5].push(flower);
        createNewFlower = vi.fn().mockResolvedValue(null);
        newFlowerPromises = [];
        newFlowerPositions = [];
    });
    
    const setupContext = () => ({
        grid,
        params: DEFAULT_SIM_PARAMS,
        createNewFlower,
    });

    it('should age and consume stamina', () => {
        const initialAge = flower.age;
        const initialStamina = flower.stamina;
        processFlowerTick(flower, setupContext(), newFlowerPromises, newFlowerPositions);
        expect(flower.age).toBe(initialAge + 1);
        expect(flower.stamina).toBe(initialStamina - (FLOWER_STAMINA_COST_PER_TICK * FLOWER_TICK_COST_MULTIPLIER));
    });

    it('should consume health if stamina is zero', () => {
        flower.stamina = 0;
        const initialHealth = flower.health;
        processFlowerTick(flower, setupContext(), newFlowerPromises, newFlowerPositions);
        expect(flower.health).toBeLessThan(initialHealth);
    });

    it('should trigger expansion to an empty neighboring cell', () => {
        vi.spyOn(Math, 'random').mockReturnValue(FLOWER_EXPANSION_CHANCE / 2); // Ensure expansion chance is met
        processFlowerTick(flower, setupContext(), newFlowerPromises, newFlowerPositions);
        expect(createNewFlower).toHaveBeenCalled();
        expect(createNewFlower).toHaveBeenCalledWith(expect.any(Number), expect.any(Number), flower.genome);
        vi.spyOn(Math, 'random').mockRestore();
    });

    it('should trigger proximity pollination with a mature neighbor', () => {
        const neighborFlower: Flower = { ...mockFlower, id: 'flower2', x: 5, y: 6, genome: 'g2' };
        grid[6][5].push(neighborFlower);
        vi.spyOn(Math, 'random').mockReturnValue(PROXIMITY_POLLINATION_CHANCE / 2); // Ensure pollination chance is met
        
        processFlowerTick(flower, setupContext(), newFlowerPromises, newFlowerPositions);

        expect(createNewFlower).toHaveBeenCalled();
        // It could call with either order of genomes, so we check for both
        try {
            expect(createNewFlower).toHaveBeenCalledWith(expect.any(Number), expect.any(Number), 'g1', 'g2');
        } catch {
            expect(createNewFlower).toHaveBeenCalledWith(expect.any(Number), expect.any(Number), 'g2', 'g1');
        }

        vi.spyOn(Math, 'random').mockRestore();
    });
});
