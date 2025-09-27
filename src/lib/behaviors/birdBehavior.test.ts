import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processBirdTick } from './birdBehavior';
import type { Bird, Insect, Grid, CellContent, AppEvent, Flower, Egg } from '../../types';
import { Quadtree, Rectangle } from '../Quadtree';
import { DEFAULT_SIM_PARAMS, INSECT_DATA } from '../../constants';

describe('birdBehavior', () => {
    let bird: Bird;
    let nextActorState: Map<string, CellContent>;
    let events: AppEvent[];
    let incrementInsectsEaten: () => void;
    let incrementEggsEaten: () => void;
    let grid: Grid;
    let qtree: Quadtree<CellContent>;
    let flowerQtree: Quadtree<CellContent>;
    const mockInsectStats = INSECT_DATA.get('🦋')!;

    const createMockInsect = (id: string, x: number, y: number): Insect => ({
        id, type: 'insect', x, y, emoji: '🦋', pollen: null,
        health: mockInsectStats.maxHealth,
        maxHealth: mockInsectStats.maxHealth,
        stamina: mockInsectStats.maxStamina,
        maxStamina: mockInsectStats.maxStamina,
        genome: [],
    });

    beforeEach(() => {
        bird = { id: 'bird1', type: 'bird', x: 5, y: 5, target: null, patrolTarget: null };
        nextActorState = new Map();
        nextActorState.set(bird.id, bird);
        events = [];
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
        events,
        incrementInsectsEaten,
        incrementEggsEaten,
    });
    
    it('should find the closest unprotected insect as a target', () => {
        const closeInsect = createMockInsect('insect1', 7, 7);
        const farInsect = createMockInsect('insect2', 9, 9);
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
        const protectedInsect = createMockInsect('insect1', 6, 6);
        const unprotectedInsect = createMockInsect('insect2', 8, 8);
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
        const targetInsect = createMockInsect('insect-target', 8, 8);
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

    it('should prey on an insect and create a nutrient with lifespan based on insect maxHealth', () => {
        const targetInsect = createMockInsect('insect1', 6, 6);
        bird.x = 5; bird.y = 5;
        bird.target = { x: 6, y: 6 };
        
        grid[6][6].push(targetInsect);
        nextActorState.set(targetInsect.id, targetInsect);

        processBirdTick(bird, setupContext());

        expect(nextActorState.has(targetInsect.id)).toBe(false);
        expect(incrementInsectsEaten).toHaveBeenCalledTimes(1);
        expect(events.length).toBe(1);
        expect(events[0].message).toBe('🐦 An insect was eaten!');
        
        const nutrient = Array.from(nextActorState.values()).find(a => a.type === 'nutrient');
        expect(nutrient).toBeDefined();
        expect(nutrient?.x).toBe(6);
        expect(nutrient?.y).toBe(6);
        // Check nutrient lifespan calculation
        const expectedLifespan = 2 + Math.floor(targetInsect.maxHealth / 30);
        expect((nutrient as any).lifespan).toBe(expectedLifespan);
        expect(bird.target).toBeNull();
    });

    it('should prey on an egg and not create a nutrient', () => {
        const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(1.0); // Ensure random nutrient drop doesn't happen
        
        const targetEgg: Egg = { id: 'egg1', type: 'egg', x: 6, y: 6, hatchTimer: 10, insectEmoji: '🐛', genome: [] };
        bird.x = 5; bird.y = 5;
        bird.target = { x: 6, y: 6 };
        
        grid[6][6].push(targetEgg);
        nextActorState.set(targetEgg.id, targetEgg);

        processBirdTick(bird, setupContext());

        expect(nextActorState.has(targetEgg.id)).toBe(false);
        expect(incrementEggsEaten).toHaveBeenCalledTimes(1);
        expect(events.length).toBe(1);
        expect(events[0].message).toBe('🐦 An egg was eaten!');
        
        const nutrient = Array.from(nextActorState.values()).find(a => a.type === 'nutrient');
        expect(nutrient).toBeUndefined();
        expect(bird.target).toBeNull();

        randomSpy.mockRestore();
    });
});
