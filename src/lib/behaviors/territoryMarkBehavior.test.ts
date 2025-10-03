import { describe, it, expect, beforeEach } from 'vitest';
import { processTerritoryMarkTick } from './territoryMarkBehavior';
import type { TerritoryMark, CellContent } from '../../types';

describe('territoryMarkBehavior', () => {
    let mark: TerritoryMark;
    let nextActorState: Map<string, CellContent>;

    beforeEach(() => {
        mark = {
            id: 'mark1', type: 'territoryMark', x: 1, y: 1,
            hiveId: '1', lifespan: 10,
        };
        nextActorState = new Map();
        nextActorState.set(mark.id, mark);
    });

    const setupContext = () => ({ nextActorState });

    it('should decrement the lifespan each tick', () => {
        processTerritoryMarkTick(mark, setupContext());
        expect(mark.lifespan).toBe(9);
    });

    it('should be removed when lifespan reaches zero', () => {
        mark.lifespan = 1;
        processTerritoryMarkTick(mark, setupContext());
        expect(nextActorState.has(mark.id)).toBe(false);
    });

    it('should decrement the signal TTL if a signal exists', () => {
        mark.signal = { type: 'UNDER_ATTACK', origin: { x: 0, y: 0 }, ttl: 5 };
        processTerritoryMarkTick(mark, setupContext());
        expect(mark.signal?.ttl).toBe(4);
    });

    it('should remove the signal when its TTL reaches zero', () => {
        mark.signal = { type: 'UNDER_ATTACK', origin: { x: 0, y: 0 }, ttl: 1 };
        processTerritoryMarkTick(mark, setupContext());
        expect(mark.signal).toBeUndefined();
    });
});
