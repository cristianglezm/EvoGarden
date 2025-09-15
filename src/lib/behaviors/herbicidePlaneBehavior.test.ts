import { describe, it, expect, beforeEach } from 'vitest';
import { processHerbicidePlaneTick } from './herbicidePlaneBehavior';
import type { HerbicidePlane, CellContent, Grid, SimulationParams } from '../../types';
import { DEFAULT_SIM_PARAMS } from '../../constants';

describe('herbicidePlaneBehavior', () => {
    let plane: HerbicidePlane;
    let nextActorState: Map<string, CellContent>;
    let grid: Grid;
    const params: SimulationParams = { ...DEFAULT_SIM_PARAMS, gridWidth: 5, gridHeight: 5 };

    beforeEach(() => {
        // Horizontal sweep from top-left
        plane = {
            id: 'plane1', type: 'herbicidePlane', x: 0, y: 0,
            dx: 1, dy: 0, turnDx: 0, turnDy: 3, stride: 3,
        };
        grid = Array.from({ length: params.gridHeight }, () => Array.from({ length: params.gridWidth }, () => []));
        nextActorState = new Map();
        nextActorState.set(plane.id, plane);
    });

    const setupContext = () => ({
        grid,
        params,
        nextActorState,
    });

    it('should drop smoke and move one step along its primary path', () => {
        processHerbicidePlaneTick(plane, setupContext());
        const smoke = Array.from(nextActorState.values()).find(a => a.type === 'herbicideSmoke');
        expect(smoke).toBeDefined();
        expect(smoke?.x).toBe(0); // Smoke dropped at original position
        expect(smoke?.y).toBe(0);
        expect(plane.x).toBe(1); // Plane moved
        expect(plane.y).toBe(0);
    });

    it('should turn and reverse direction when hitting a boundary', () => {
        plane.x = 4; // At the right edge
        processHerbicidePlaneTick(plane, setupContext());

        // The next position (x=5) is out of bounds, so it should turn.
        // Original position was (4, 0). Turn is (turnDx=0, turnDy=3).
        // New position should be (4 + 0, 0 + 3) = (4, 3)
        expect(plane.x).toBe(4);
        expect(plane.y).toBe(3);

        // Primary direction should be reversed.
        expect(plane.dx).toBe(-1); // Was 1
        expect(Math.abs(plane.dy)).toBe(0);
    });

    it('should be removed after turning off the grid', () => {
        plane.x = 0;
        plane.y = 4; // At the bottom-left, after a few sweeps
        plane.dx = -1; // Moving left
        plane.turnDy = 3; // Turn will take it off-grid
        
        processHerbicidePlaneTick(plane, setupContext());

        // The next position (x=-1) is out of bounds, triggering a turn.
        // Original position was (0, 4). Turn is (turnDx=0, turnDy=3).
        // New position is (0, 7), which is off the grid (height is 5).
        expect(nextActorState.has(plane.id)).toBe(false);
    });
});
