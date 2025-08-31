import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processBirdTick } from './birdBehavior';
import type { Bird, Insect, Grid, CellContent, ToastMessage, Flower } from '../../types';
import { Quadtree, Rectangle } from '../Quadtree';
import { DEFAULT_SIM_PARAMS } from '../../constants';

describe('birdBehavior', () => {
    let bird: Bird;
    let nextActorState: Map<string, CellContent>;
    let toasts: Omit<ToastMessage, 'id'>[];
    let incrementInsectsEaten: () => void;
    let incrementEggsEaten: () => void;
    let grid: Grid;
    let qtree: Quadtree<CellContent>;

    beforeEach(() => {
        bird = { id: 'bird1', type: 'bird', x: 5, y: 5, target: null };
        nextActorState = new Map();
        nextActorState.set(bird.id, bird);
        toasts = [];
        incrementInsectsEaten = vi.fn();
        incrementEggsEaten = vi.fn();
        grid = Array.from({ length: 15 }, () => Array.from({ length: 15 }, () => []));
        qtree = new Quadtree(new Rectangle(7.5, 7.5, 7.5, 7.5), 4);
    });

    const setupContext = () => ({
        grid,
        params: DEFAULT_SIM_PARAMS,
        qtree,
        nextActorState,
        toasts,
        incrementInsectsEaten,
        incrementEggsEaten,
    });
    
    it('should find the closest unprotected insect as a target', () => {
        const closeInsect: Insect = { id: 'insect1', type: 'insect', x: 7, y: 7, emoji: '🦋', pollen: null, lifespan: 100 };
        const farInsect: Insect = { id: 'insect2', type: 'insect', x: 10, y: 10, emoji: '🦋', pollen: null, lifespan: 100 };
        grid[7][7].push(closeInsect);
        grid[10][10].push(farInsect);
        nextActorState.set(closeInsect.id, closeInsect);
        nextActorState.set(farInsect.id, farInsect);
        qtree.insert({ x: 7, y: 7, data: closeInsect });
        qtree.insert({ x: 10, y: 10, data: farInsect });
        
        processBirdTick(bird, setupContext());

        expect(bird.target).toEqual({ x: 7, y: 7 });
    });

    it('should ignore insects that are protected by a flower', () => {
        const protectedInsect: Insect = { id: 'insect1', type: 'insect', x: 6, y: 6, emoji: '🦋', pollen: null, lifespan: 100 };
        const unprotectedInsect: Insect = { id: 'insect2', type: 'insect', x: 8, y: 8, emoji: '🦋', pollen: null, lifespan: 100 };
        const flower = { id: 'flower1', type: 'flower', x: 6, y: 6 } as Flower;
        
        grid[6][6].push(protectedInsect, flower);
        grid[8][8].push(unprotectedInsect);
        nextActorState.set(protectedInsect.id, protectedInsect);
        nextActorState.set(unprotectedInsect.id, unprotectedInsect);
        qtree.insert({ x: 6, y: 6, data: protectedInsect });
        qtree.insert({ x: 8, y: 8, data: unprotectedInsect });

        processBirdTick(bird, setupContext());

        expect(bird.target).toEqual({ x: 8, y: 8 });
    });

    it('should move one step towards its target', () => {
        // Setup the target insect in the grid and state so the bird can "see" it
        const targetInsect: Insect = { id: 'insect-target', type: 'insect', x: 8, y: 8, emoji: '🦋', pollen: null, lifespan: 100 };
        grid[8][8].push(targetInsect);
        nextActorState.set(targetInsect.id, targetInsect);

        bird.target = { x: 8, y: 8 };
        processBirdTick(bird, setupContext());
        
        expect(bird.x).toBe(6);
        expect(bird.y).toBe(6);
    });

    it('should prey on an insect and create a nutrient', () => {
        const targetInsect: Insect = { id: 'insect1', type: 'insect', x: 6, y: 6, emoji: '🦋', pollen: null, lifespan: 100 };
        bird.x = 5; bird.y = 5;
        bird.target = { x: 6, y: 6 };
        
        grid[6][6].push(targetInsect);
        nextActorState.set(targetInsect.id, targetInsect);

        processBirdTick(bird, setupContext());

        expect(nextActorState.has(targetInsect.id)).toBe(false);
        expect(incrementInsectsEaten).toHaveBeenCalledTimes(1);
        expect(toasts.length).toBe(1);
        expect(toasts[0].message).toContain('A bird ate an insect!');
        
        const nutrient = Array.from(nextActorState.values()).find(a => a.type === 'nutrient');
        expect(nutrient).toBeDefined();
        expect(nutrient?.x).toBe(6);
        expect(nutrient?.y).toBe(6);
        expect(bird.target).toBeNull();
    });
});
