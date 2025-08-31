import { describe, it, expect, beforeEach } from 'vitest';
import { processNutrientTick } from './nutrientBehavior';
import type { Nutrient, CellContent } from '../../types';

describe('nutrientBehavior', () => {
    let nutrient: Nutrient;
    let nextActorState: Map<string, CellContent>;

    beforeEach(() => {
        nutrient = { id: 'nutrient1', type: 'nutrient', x: 1, y: 1, lifespan: 1 };
        nextActorState = new Map();
        nextActorState.set(nutrient.id, nutrient);
    });

    const setupContext = () => ({ nextActorState });

    it('should decrement the lifespan', () => {
        nutrient.lifespan = 10;
        processNutrientTick(nutrient, setupContext());
        expect(nutrient.lifespan).toBe(9);
        expect(nextActorState.has(nutrient.id)).toBe(true);
    });

    it('should be removed when lifespan reaches zero', () => {
        nutrient.lifespan = 1;
        processNutrientTick(nutrient, setupContext());
        expect(nextActorState.has(nutrient.id)).toBe(false);
    });
});
