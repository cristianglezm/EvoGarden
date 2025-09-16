import { describe, it, expect, beforeEach } from 'vitest';
import { processHerbicideSmokeTick } from './herbicideSmokeBehavior';
import type { HerbicideSmoke, Flower, CellContent, Grid, SimulationParams } from '../../types';
import { DEFAULT_SIM_PARAMS } from '../../constants';

describe('herbicideSmokeBehavior', () => {
    let smoke: HerbicideSmoke;
    let flower: Flower;
    let nextActorState: Map<string, CellContent>;
    let grid: Grid;
    const params: SimulationParams = { ...DEFAULT_SIM_PARAMS, gridWidth: 5, gridHeight: 5, herbicideDamage: 25 };

    beforeEach(() => {
        smoke = {
            id: 'smoke1',
            type: 'herbicideSmoke',
            x: 2,
            y: 2,
            lifespan: params.herbicideSmokeLifespan,
            canBeExpanded: params.herbicideSmokeExpansionCount,
        };
        flower = {
            id: 'flower1',
            type: 'flower',
            x: 2,
            y: 2,
            health: 100,
        } as Flower; // Cast for simplicity
        grid = Array.from({ length: params.gridHeight }, () => Array.from({ length: params.gridWidth }, () => []));
        grid[2][2].push(smoke, flower);
        nextActorState = new Map();
        nextActorState.set(smoke.id, smoke);
        nextActorState.set(flower.id, flower);
    });

    const setupContext = () => ({
        grid,
        params,
        nextActorState,
    });

    it('should apply damage to flowers in the same cell', () => {
        processHerbicideSmokeTick(smoke, setupContext());
        const updatedFlower = nextActorState.get(flower.id) as Flower;
        expect(updatedFlower.health).toBe(100 - params.herbicideDamage);
    });

    it('should expand to all 8 neighbors on its first tick', () => {
        processHerbicideSmokeTick(smoke, setupContext());
        const newSmokes = Array.from(nextActorState.values()).filter(a => a.type === 'herbicideSmoke');
        expect(newSmokes.length).toBe(9); // Original + 8 neighbors
        expect(smoke.canBeExpanded >= 0).toBe(true);
    });

    it('should not expand on subsequent ticks', () => {
        smoke.canBeExpanded = 0;
        processHerbicideSmokeTick(smoke, setupContext());
        const newSmokes = Array.from(nextActorState.values()).filter(a => a.type === 'herbicideSmoke');
        expect(newSmokes.length).toBe(1); // Only the original
    });

    it('should decrement its lifespan', () => {
        processHerbicideSmokeTick(smoke, setupContext());
        expect(smoke.lifespan).toBe(params.herbicideSmokeLifespan - 1);
    });

    it('should be removed when lifespan reaches zero', () => {
        smoke.lifespan = 1;
        processHerbicideSmokeTick(smoke, setupContext());
        expect(smoke.lifespan).toBe(0);
        expect(nextActorState.has(smoke.id)).toBe(false);
    });
});
