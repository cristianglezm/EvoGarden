import { describe, it, expect } from 'vitest';
import { findEmptyCell, findCellForFlowerSpawn, findCellForStationaryActor, hasPlantAt } from './simulationUtils';
import type { Grid, CellContent } from '../types';
import { DEFAULT_SIM_PARAMS } from '../constants';

describe('simulationUtils', () => {
    const params = { ...DEFAULT_SIM_PARAMS, gridWidth: 3, gridHeight: 3 };

    describe('findEmptyCell', () => {
        it('should find an empty neighbor', () => {
            const grid: Grid = [
                [[{ id: '1' } as CellContent], [{ id: '2' } as CellContent], []],
                [[{ id: '3' } as CellContent], [{ id: '4' } as CellContent], [{ id: '5' } as CellContent]],
                [[{ id: '6' } as CellContent], [{ id: '7' } as CellContent], [{ id: '8' } as CellContent]],
            ];
            const result = findEmptyCell(grid, params, { x: 1, y: 1 });
            expect(result).toEqual({ x: 2, y: 0 });
        });

        it('should return null for a full grid', () => {
            const grid: Grid = Array(3)
                .fill(0)
                .map(() =>
                    Array(3)
                        .fill(0)
                        .map(() => [{ id: 'f' } as CellContent])
                );
            const result = findEmptyCell(grid, params);
            expect(result).toBeNull();
        });
    });

    describe('findCellForFlowerSpawn', () => {
        it('should find a cell with only an egg', () => {
            const grid: Grid = [
                [[{ id: 'f1', type: 'flower' } as CellContent], [{ id: 'f2', type: 'flower' } as CellContent], [{ id: 'f3', type: 'flower' } as CellContent]],
                [[{ id: 'f4', type: 'flower' } as CellContent], [{ id: 'f5', type: 'flower' } as CellContent], [{ id: 'egg1', type: 'egg' } as CellContent]],
                [[{ id: 'f6', type: 'flower' } as CellContent], [{ id: 'f7', type: 'flower' } as CellContent], [{ id: 'f8', type: 'flower' } as CellContent]],
            ];
            const result = findCellForFlowerSpawn(grid, params, { x: 1, y: 1 });
            expect(result).toEqual({ x: 2, y: 1 });
        });
    });

    describe('findCellForStationaryActor', () => {
        it('should not place an egg in a cell already containing an egg', () => {
            const grid: Grid = [
                [[], [], []],
                [[], [{ id: 'egg1', type: 'egg' } as CellContent], []],
                [[], [], []],
            ];
            const result = findCellForStationaryActor(grid, params, 'egg', { x: 1, y: 1 });
            // It should find a non-egg neighbor
            expect(result).not.toEqual({ x: 1, y: 1 });
            expect(result).not.toBeNull();
        });
    });
});

describe('hasPlantAt', () => {
    const at = (type: string, x = 3, y = 4) => ({ type, x, y });

    it('is false for an empty cell', () => {
        expect(hasPlantAt([], 3, 4)).toBe(false);
    });

    it.each(['flower', 'flowerSeed'])('is true for a %s: a seed is a plant that is not seen yet', type => {
        expect(hasPlantAt([at(type)], 3, 4)).toBe(true);
    });

    it.each([
        'insect',
        'cockroach',
        'bird',
        'eagle',
        'nutrient',
        'egg',
        'cocoon',
        'corpse',
        'slimeTrail',
        'territoryMark',
        'pheromoneTrail',
        'spiderweb',
        'hive',
        'antColony',
        'herbicidePlane',
        'herbicideSmoke',
    ])('is false for a %s: only another plant is in the way', type => {
        expect(hasPlantAt([at(type)], 3, 4)).toBe(false);
    });

    it('looks at the cell asked for, in both coordinates', () => {
        const actors = [at('flower', 3, 5), at('flower', 4, 4), at('flowerSeed', 5, 3)];
        expect(hasPlantAt(actors, 3, 4)).toBe(false);
        expect(hasPlantAt(actors, 4, 4)).toBe(true);
        expect(hasPlantAt(actors, 3, 5)).toBe(true);
    });

    it('finds the plant among other actors of the cell', () => {
        expect(hasPlantAt([at('insect'), at('nutrient'), at('flowerSeed')], 3, 4)).toBe(true);
    });

    it('takes a map of actors as well as a list', () => {
        const actors = new Map([
            ['a', at('insect')],
            ['b', at('flower')],
        ]);
        expect(hasPlantAt(actors.values(), 3, 4)).toBe(true);
    });
});
