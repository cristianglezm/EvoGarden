import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processCocoonTick } from './cocoonBehavior';
import type { Cocoon, CellContent, AppEvent, Insect } from '../../types';
import { DEFAULT_SIM_PARAMS, INSECT_DATA } from '../../constants';
import { ACTOR_NAMES } from '../../utils';

describe('cocoonBehavior', () => {
    let cocoon: Cocoon;
    let nextActorState: Map<string, CellContent>;
    let events: AppEvent[];
    const mockGetNextId = vi.fn();

    beforeEach(() => {
        cocoon = { id: 'cocoon1', type: 'cocoon', x: 1, y: 1, hatchTimer: 1, butterflyGenome: [1,2,3] };
        nextActorState = new Map();
        nextActorState.set(cocoon.id, cocoon);
        events = [];
        mockGetNextId.mockClear().mockReturnValue('new-butterfly-id');
    });

    const setupContext = (): any => ({
        nextActorState,
        events,
        getNextId: mockGetNextId,
        params: DEFAULT_SIM_PARAMS,
    });

    it('should decrement the hatch timer', () => {
        cocoon.hatchTimer = 5;
        processCocoonTick(cocoon, setupContext());
        expect(cocoon.hatchTimer).toBe(4);
        expect(nextActorState.has(cocoon.id)).toBe(true);
    });

    it('should hatch into a butterfly when timer reaches zero', () => {
        cocoon.hatchTimer = 1;
        processCocoonTick(cocoon, setupContext());

        expect(nextActorState.has(cocoon.id)).toBe(false);
        const newButterfly = nextActorState.get('new-butterfly-id') as Insect | undefined;
        
        expect(newButterfly).toBeDefined();
        expect(newButterfly?.emoji).toBe('🦋');
        expect(newButterfly?.genome).toEqual([1,2,3]);
        
        const baseStats = INSECT_DATA.get('🦋')!;
        expect(newButterfly?.health).toBe(baseStats.maxHealth);
        expect(newButterfly?.stamina).toBe(baseStats.maxStamina);

        expect(events.length).toBe(1);
        expect(events[0].message).toContain('butterfly has emerged');
        expect(mockGetNextId).toHaveBeenCalledWith(ACTOR_NAMES['🦋'].toLowerCase(), cocoon.x, cocoon.y);
    });
});
