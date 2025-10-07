import { describe, it, expect, beforeEach } from 'vitest';
import { processPheromoneTrailTick } from './pheromoneTrailBehavior';
import type { PheromoneTrail, CellContent, SimulationParams } from '../../types';
import { DEFAULT_SIM_PARAMS } from '../../constants';

describe('pheromoneTrailBehavior', () => {
    let trail: PheromoneTrail;
    let nextActorState: Map<string, CellContent>;
    const params: SimulationParams = { ...DEFAULT_SIM_PARAMS, pheromoneStrengthDecay: 0.1 };

    beforeEach(() => {
        trail = {
            id: 'trail1', type: 'pheromoneTrail', x: 1, y: 1,
            colonyId: '1', lifespan: 10, strength: 1.0,
        };
        nextActorState = new Map();
        nextActorState.set(trail.id, trail);
    });

    const setupContext = () => ({ nextActorState, params });

    it('should decrement lifespan and strength', () => {
        processPheromoneTrailTick(trail, setupContext());
        expect(trail.lifespan).toBe(9);
        expect(trail.strength).toBeCloseTo(0.9);
    });

    it('should be removed when lifespan reaches zero', () => {
        trail.lifespan = 1;
        processPheromoneTrailTick(trail, setupContext());
        expect(nextActorState.has(trail.id)).toBe(false);
    });

    it('should be removed when strength reaches zero', () => {
        trail.strength = 0.1;
        processPheromoneTrailTick(trail, setupContext());
        expect(nextActorState.has(trail.id)).toBe(false);
    });

    it('should decrement signal TTL', () => {
        trail.signal = { type: 'UNDER_ATTACK', origin: { x: 0, y: 0 }, ttl: 5 };
        processPheromoneTrailTick(trail, setupContext());
        expect(trail.signal?.ttl).toBe(4);
    });

    it('should remove signal when its TTL reaches zero', () => {
        trail.signal = { type: 'UNDER_ATTACK', origin: { x: 0, y: 0 }, ttl: 1 };
        processPheromoneTrailTick(trail, setupContext());
        expect(trail.signal).toBeUndefined();
    });
});
