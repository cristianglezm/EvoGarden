import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processEggTick } from './eggBehavior';
import type { Egg, CellContent, ToastMessage, Bird } from '../../types';

describe('eggBehavior', () => {
    let egg: Egg;
    let nextActorState: Map<string, CellContent>;
    let toasts: Omit<ToastMessage, 'id'>[];
    let incrementInsectsBorn: () => void;


    beforeEach(() => {
        egg = { id: 'egg1', type: 'egg', x: 1, y: 1, hatchTimer: 1, insectEmoji: '🦋' };
        nextActorState = new Map();
        nextActorState.set(egg.id, egg);
        toasts = [];
        incrementInsectsBorn = vi.fn();
    });

    const setupContext = () => ({
        nextActorState,
        toasts,
        incrementInsectsBorn,
    });

    it('should decrement the hatch timer', () => {
        egg.hatchTimer = 5;
        processEggTick(egg, setupContext());
        expect(egg.hatchTimer).toBe(4);
        expect(nextActorState.has(egg.id)).toBe(true);
    });
    
    it('should hatch into an insect when the timer reaches zero', () => {
        egg.hatchTimer = 1;
        processEggTick(egg, setupContext());

        expect(nextActorState.has(egg.id)).toBe(false);
        const newInsect = Array.from(nextActorState.values()).find(a => a.type === 'insect');
        expect(newInsect).toBeDefined();
        expect(newInsect?.x).toBe(egg.x);
        expect(newInsect?.y).toBe(egg.y);
        expect(toasts.length).toBe(1);
        expect(toasts[0].message).toContain('An insect has hatched!');
        expect(incrementInsectsBorn).toHaveBeenCalledTimes(1);
    });
    
    it('should not hatch if a bird is on the same cell', () => {
        egg.hatchTimer = 1;
        const bird: Bird = { id: 'bird1', type: 'bird', x: 1, y: 1, target: null };
        nextActorState.set(bird.id, bird);

        processEggTick(egg, setupContext());

        expect(nextActorState.has(egg.id)).toBe(false); // Egg is still removed
        const newInsect = Array.from(nextActorState.values()).find(a => a.type === 'insect');
        expect(newInsect).toBeUndefined(); // But insect is not created
        expect(toasts.length).toBe(0); // No toast
        expect(incrementInsectsBorn).not.toHaveBeenCalled();
    });
});
