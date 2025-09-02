import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processBirdTick } from './birdBehavior';
import type { Bird, Insect, Grid, CellContent, ToastMessage, Flower, Egg } from '../../types';
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
    let flowerQtree: Quadtree<CellContent>;

    beforeEach(() => {
        bird = { id: 'bird1', type: 'bird', x: 5, y: 5, target: null, patrolTarget: null };
        nextActorState = new Map();
        nextActorState.set(bird.id, bird);
        toasts = [];
        incrementInsectsEaten = vi.fn();
        incrementEggsEaten = vi.fn();
        grid = Array.from({ length: DEFAULT_SIM_PARAMS.gridHeight }, () => Array.from({ length: DEFAULT_SIM_PARAMS.gridWidth }, () => []));
        qtree = new Quadtree(new Rectangle(DEFAULT_SIM_PARAMS.gridWidth / 2, DEFAULT_SIM_PARAMS.gridHeight / 2, DEFAULT_SIM_PARAMS.gridWidth / 2, DEFAULT_SIM_PARAMS.gridHeight / 2), 4);
        flowerQtree = new Quadtree(new Rectangle(DEFAULT_SIM_PARAMS.gridWidth / 2, DEFAULT_SIM_PARAMS.gridHeight / 2, DEFAULT_SIM_PARAMS.gridWidth / 2, DEFAULT_SIM_PARAMS.gridHeight / 2), 4);
    });

    const setupContext = () => ({
        grid,
        params: DEFAULT_SIM_PARAMS,
        qtree,
        flowerQtree,
        nextActorState,
        toasts,
        incrementInsectsEaten,
        incrementEggsEaten,
    });
    
    it('should find the closest unprotected insect as a target', () => {
        const closeInsect: Insect = { id: 'insect1', type: 'insect', x: 7, y: 7, emoji: '🦋', pollen: null, lifespan: 100 };
        const farInsect: Insect = { id: 'insect2', type: 'insect', x: 9, y: 9, emoji: '🦋', pollen: null, lifespan: 100 };
        grid[7][7].push(closeInsect);
        grid[9][9].push(farInsect);
        nextActorState.set(closeInsect.id, closeInsect);
        nextActorState.set(farInsect.id, farInsect);
        qtree.insert({ x: 7, y: 7, data: closeInsect });
        qtree.insert({ x: 9, y: 9, data: farInsect });
        
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

    it('should find a patrol target if no prey is nearby', () => {
        const flower = { id: 'flower1', type: 'flower', x: 10, y: 8 } as Flower;
        flowerQtree.insert({ x: flower.x, y: flower.y, data: flower });
        
        processBirdTick(bird, setupContext());

        expect(bird.target).toBeNull();
        expect(bird.patrolTarget).toEqual({ x: 10, y: 8 });
    });

    it('should move one step towards its prey target', () => {
        // Setup the target insect in the grid and state so the bird can "see" it
        const targetInsect: Insect = { id: 'insect-target', type: 'insect', x: 8, y: 8, emoji: '🦋', pollen: null, lifespan: 100 };
        grid[8][8].push(targetInsect);
        nextActorState.set(targetInsect.id, targetInsect);

        bird.target = { x: 8, y: 8 };
        processBirdTick(bird, setupContext());
        
        expect(bird.x).toBe(6);
        expect(bird.y).toBe(6);
    });
    
    it('should move one step towards its patrol target if no prey', () => {
        bird.patrolTarget = { x: 8, y: 8 };
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
        expect(toasts[0].message).toBe('🐦 An insect was eaten!');
        
        const nutrient = Array.from(nextActorState.values()).find(a => a.type === 'nutrient');
        expect(nutrient).toBeDefined();
        expect(nutrient?.x).toBe(6);
        expect(nutrient?.y).toBe(6);
        expect(bird.target).toBeNull();
    });

    it('should prey on an egg and not create a nutrient', () => {
        const targetEgg: Egg = { id: 'egg1', type: 'egg', x: 6, y: 6, hatchTimer: 10, insectEmoji: '🐛' };
        bird.x = 5; bird.y = 5;
        bird.target = { x: 6, y: 6 };
        
        grid[6][6].push(targetEgg);
        nextActorState.set(targetEgg.id, targetEgg);

        processBirdTick(bird, setupContext());

        expect(nextActorState.has(targetEgg.id)).toBe(false);
        expect(incrementEggsEaten).toHaveBeenCalledTimes(1);
        expect(toasts.length).toBe(1);
        expect(toasts[0].message).toBe('🐦 An egg was eaten!');
        
        const nutrient = Array.from(nextActorState.values()).find(a => a.type === 'nutrient');
        expect(nutrient).toBeUndefined();
        expect(bird.target).toBeNull();
    });
});
