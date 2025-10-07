import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processEggTick } from './eggBehavior';
import type { Egg, CellContent, AppEvent, Bird, Insect } from '../../types';
import { DEFAULT_SIM_PARAMS, INSECT_DATA } from '../../constants';
import { ACTOR_NAMES } from '../../utils';

describe('eggBehavior', () => {
    let egg: Egg;
    let nextActorState: Map<string, CellContent>;
    let events: AppEvent[];
    let incrementInsectsBorn: () => void;
    const mockGenome = [1, 2, 3];
    const mockGetNextId = vi.fn();


    beforeEach(() => {
        egg = { id: 'egg1', type: 'egg', x: 1, y: 1, hatchTimer: 1, insectEmoji: '🦋', genome: mockGenome };
        nextActorState = new Map();
        nextActorState.set(egg.id, egg);
        events = [];
        incrementInsectsBorn = vi.fn();
        mockGetNextId.mockClear().mockReturnValue('new-insect-id');
    });

    const setupContext = (): any => ({
        nextActorState,
        events,
        incrementInsectsBorn,
        params: DEFAULT_SIM_PARAMS,
        getNextId: mockGetNextId,
    });

    it('should decrement the hatch timer', () => {
        egg.hatchTimer = 5;
        processEggTick(egg, setupContext());
        expect(egg.hatchTimer).toBe(4);
        expect(nextActorState.has(egg.id)).toBe(true);
    });
    
    it('should hatch into an insect with full stats and inherited genome when the timer reaches zero', () => {
        egg.hatchTimer = 1;
        processEggTick(egg, setupContext());

        expect(nextActorState.has(egg.id)).toBe(false);
        const newInsect = nextActorState.get('new-insect-id') as Insect | undefined;
        
        expect(newInsect).toBeDefined();
        expect(newInsect?.x).toBe(egg.x);
        expect(newInsect?.y).toBe(egg.y);
        expect(newInsect?.genome).toEqual(mockGenome);
        
        const baseStats = INSECT_DATA.get(egg.insectEmoji)!;
        expect(newInsect?.health).toBe(baseStats.maxHealth);
        expect(newInsect?.stamina).toBe(baseStats.maxStamina);

        expect(events.length).toBe(1);
        expect(events[0].message).toBe('🐣 An insect has hatched!');
        expect(incrementInsectsBorn).toHaveBeenCalledTimes(1);
        expect(mockGetNextId).toHaveBeenCalledWith(ACTOR_NAMES[egg.insectEmoji].toLowerCase(), egg.x, egg.y);
    });
    
    it('should not hatch if a bird is on the same cell', () => {
        egg.hatchTimer = 1;
        const bird: Bird = { id: 'bird1', type: 'bird', x: 1, y: 1, target: null, patrolTarget: null };
        nextActorState.set(bird.id, bird);

        processEggTick(egg, setupContext());

        expect(nextActorState.has(egg.id)).toBe(false); // Egg is still removed
        const newInsect = Array.from(nextActorState.values()).find(a => a.type === 'insect');
        expect(newInsect).toBeUndefined(); // But insect is not created
        expect(events.length).toBe(0); // No toast
        expect(incrementInsectsBorn).not.toHaveBeenCalled();
    });
});