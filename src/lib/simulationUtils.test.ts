import { describe, it, expect } from 'vitest';
import { findEmptyCell, findCellForFlowerSpawn, findCellForStationaryActor } from './simulationUtils';
import type { Grid, CellContent } from '../types';
import { DEFAULT_SIM_PARAMS } from '../constants';

describe('simulationUtils', () => {
    const params = { ...DEFAULT_SIM_PARAMS, gridWidth: 3, gridHeight: 3 };

    describe('findEmptyCell', () => {
        it('should find an empty neighbor', () => {
            const grid: Grid = [
                [[{id:'1'} as CellContent], [{id:'2'} as CellContent], []],
                [[{id:'3'} as CellContent], [{id:'4'} as CellContent], [{id:'5'} as CellContent]],
                [[{id:'6'} as CellContent], [{id:'7'} as CellContent], [{id:'8'} as CellContent]],
            ];
            const result = findEmptyCell(grid, params, { x: 1, y: 1 });
            expect(result).toEqual({ x: 2, y: 0 });
        });

        it('should return null for a full grid', () => {
            const grid: Grid = Array(3).fill(0).map(() => Array(3).fill(0).map(() => [{id:'f'} as CellContent]));
            const result = findEmptyCell(grid, params);
            expect(result).toBeNull();
        });
    });

    describe('findCellForFlowerSpawn', () => {
        it('should find a cell with only an egg', () => {
            const grid: Grid = [
                [[{id:'f1'} as CellContent], [{id:'f2'} as CellContent], [{id:'f3'} as CellContent]],
                [[{id:'f4'} as CellContent], [{id:'f5'} as CellContent], [{id:'egg1', type:'egg'} as CellContent]],
                [[{id:'f6'} as CellContent], [{id:'f7'} as CellContent], [{id:'f8'} as CellContent]],
            ];
            const result = findCellForFlowerSpawn(grid, params, { x: 1, y: 1 });
            expect(result).toEqual({ x: 2, y: 1 });
        });
    });

    describe('findCellForStationaryActor', () => {
        it('should not place an egg in a cell already containing an egg', () => {
             const grid: Grid = [
                [[], [], []],
                [[], [{id:'egg1', type:'egg'} as CellContent], []],
                [[], [], []],
            ];
            const result = findCellForStationaryActor(grid, params, 'egg', { x: 1, y: 1 });
            // It should find a non-egg neighbor
            expect(result).not.toEqual({ x: 1, y: 1 });
            expect(result).not.toBeNull();
        });
    });
});
