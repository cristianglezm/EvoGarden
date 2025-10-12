import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { processHerbicideSmokeTick } from './herbicideSmokeBehavior';
import type { HerbicideSmoke, Flower, CellContent, Grid, SimulationParams, FlowerSeed } from '../../types';
import { DEFAULT_SIM_PARAMS } from '../../constants';
import { AsyncFlowerFactory } from '../asyncFlowerFactory';
import { Quadtree, Rectangle } from '../Quadtree';

vi.mock('../asyncFlowerFactory');

describe('herbicideSmokeBehavior', () => {
    let smoke: HerbicideSmoke;
    let flower: Flower;
    let nextActorState: Map<string, CellContent>;
    let grid: Grid;
    let qtree: Quadtree<CellContent>;
    const params: SimulationParams = { ...DEFAULT_SIM_PARAMS, gridWidth: 5, gridHeight: 5, herbicideDamage: 25 };
    let mockAsyncFlowerFactory: AsyncFlowerFactory;
    let cancelFlowerRequest: Mock;

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
        
        const boundary = new Rectangle(params.gridWidth / 2, params.gridHeight / 2, params.gridWidth / 2, params.gridHeight / 2);
        qtree = new Quadtree(boundary, 4);
        qtree.insert({ x: smoke.x, y: smoke.y, data: smoke });
        qtree.insert({ x: flower.x, y: flower.y, data: flower });
        
        cancelFlowerRequest = vi.fn();
        mockAsyncFlowerFactory = new (AsyncFlowerFactory as any)();
        mockAsyncFlowerFactory.cancelFlowerRequest = cancelFlowerRequest;
    });

    const setupContext = () => ({
        grid,
        params,
        nextActorState,
        asyncFlowerFactory: mockAsyncFlowerFactory,
        qtree,
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
    
    it('should destroy a flower seed and cancel its creation request', () => {
        const seed: FlowerSeed = {
            id: 'seed-1',
            type: 'flowerSeed',
            x: 2,
            y: 2,
            health: 10,
            maxHealth: 10,
            age: 0,
            imageData: 'stem'
        };
        nextActorState.set(seed.id, seed);
        grid[2][2].push(seed);
        qtree.insert({ x: seed.x, y: seed.y, data: seed });

        processHerbicideSmokeTick(smoke, setupContext());

        // The seed's health (10) is less than the damage (25), so it should be destroyed.
        expect(nextActorState.has(seed.id)).toBe(false);
        expect(cancelFlowerRequest).toHaveBeenCalledTimes(1);
        expect(cancelFlowerRequest).toHaveBeenCalledWith(seed.id);
    });
});
