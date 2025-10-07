import { describe, it, expect, beforeEach, vi } from 'vitest';
import { processCorpseTick } from './corpseBehavior';
import type { Corpse, CellContent, Nutrient } from '../../types';
import { CORPSE_DECAY_TIME, NUTRIENT_FROM_OLD_AGE_LIFESPAN } from '../../constants';

describe('corpseBehavior', () => {
    let corpse: Corpse;
    let nextActorState: Map<string, CellContent>;
    const mockGetNextId = vi.fn();

    beforeEach(() => {
        corpse = { id: 'corpse1', type: 'corpse', x: 1, y: 1, originalEmoji: '🦋', decayTimer: CORPSE_DECAY_TIME };
        nextActorState = new Map();
        nextActorState.set(corpse.id, corpse);
        mockGetNextId.mockClear().mockReturnValue('new-nutrient-id');
    });

    const setupContext = () => ({ nextActorState, getNextId: mockGetNextId });

    it('should decrement the decay timer', () => {
        corpse.decayTimer = 5;
        processCorpseTick(corpse, setupContext());
        expect(corpse.decayTimer).toBe(4);
        expect(nextActorState.has(corpse.id)).toBe(true);
    });

    it('should be removed and replaced by a nutrient when decay timer reaches zero', () => {
        corpse.decayTimer = 1;
        processCorpseTick(corpse, setupContext());

        expect(nextActorState.has(corpse.id)).toBe(false);
        
        const nutrient = nextActorState.get('new-nutrient-id') as Nutrient | undefined;
        expect(nutrient).toBeDefined();
        expect(nutrient?.x).toBe(corpse.x);
        expect(nutrient?.y).toBe(corpse.y);
        expect(nutrient?.lifespan).toBe(NUTRIENT_FROM_OLD_AGE_LIFESPAN);
        expect(mockGetNextId).toHaveBeenCalledWith('nutrient', corpse.x, corpse.y);
    });

    it('should do nothing if decay timer is already zero or less', () => {
        corpse.decayTimer = 0;
        processCorpseTick(corpse, setupContext());
        expect(nextActorState.has(corpse.id)).toBe(false);
    });
});