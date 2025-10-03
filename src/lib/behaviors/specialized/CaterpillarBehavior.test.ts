import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CaterpillarBehavior } from './CaterpillarBehavior';
import type { Insect, Flower, Grid, CellContent, Cocoon, AppEvent } from '../../../types';
import { Quadtree, Rectangle } from '../../Quadtree';
import { DEFAULT_SIM_PARAMS, INSECT_DATA, CATERPILLAR_EAT_AMOUNT_FOR_COCOON, COCOON_HATCH_TIME } from '../../../constants';
import { AsyncFlowerFactory } from '../../asyncFlowerFactory';

vi.mock('../../asyncFlowerFactory');

describe('CaterpillarBehavior', () => {
    let behavior: CaterpillarBehavior;
    let caterpillar: Insect;
    let grid: Grid;
    let nextActorState: Map<string, CellContent>;
    let flowerQtree: Quadtree<CellContent>;
    let events: AppEvent[];
    const CATERPILLAR_DATA = INSECT_DATA.get('🐛')!;

    const mockFlower: Flower = {
        id: 'flower1', type: 'flower', x: 5, y: 5,
        genome: 'g1', imageData: '', health: 100, stamina: 100,
        age: 51, isMature: true, maxHealth: 100, maxStamina: 100,
        maturationPeriod: 50, nutrientEfficiency: 1.0, sex: 'both',
        minTemperature: 10, maxTemperature: 30, toxicityRate: 0.0,
        effects: { vitality: 1, agility: 1, strength: 1, intelligence: 1, luck: 1 }
    };

    beforeEach(() => {
        behavior = new CaterpillarBehavior();
        caterpillar = { 
            id: 'caterpillar1', type: 'insect', x: 5, y: 5, pollen: null, emoji: '🐛', 
            health: CATERPILLAR_DATA.maxHealth,
            maxHealth: CATERPILLAR_DATA.maxHealth,
            stamina: CATERPILLAR_DATA.maxStamina,
            maxStamina: CATERPILLAR_DATA.maxStamina,
            genome: Array(9).fill(0.1),
            healthEaten: 0,
        };
        grid = Array.from({ length: 15 }, () => Array.from({ length: 15 }, () => []));
        grid[5][5].push(caterpillar);
        nextActorState = new Map();
        nextActorState.set(caterpillar.id, caterpillar);
        
        const boundary = new Rectangle(7.5, 7.5, 7.5, 7.5);
        flowerQtree = new Quadtree(boundary, 4);
        events = [];
    });
    
    const setupContext = (): any => ({
        grid,
        params: DEFAULT_SIM_PARAMS,
        nextActorState,
        asyncFlowerFactory: new (AsyncFlowerFactory as any)(),
        qtree: new Quadtree(new Rectangle(7.5, 7.5, 7.5, 7.5), 4),
        flowerQtree,
        events,
        incrementInsectsDiedOfOldAge: vi.fn(),
        currentTemperature: DEFAULT_SIM_PARAMS.temperature,
        newActorQueue: [],
    });

    it('should eat a flower on the same cell, decreasing its health and increasing healthEaten', () => {
        const flower = { ...mockFlower, x: 5, y: 5 };
        grid[5][5].push(flower);
        nextActorState.set(flower.id, flower);
        const initialFlowerHealth = flower.health;

        behavior.update(caterpillar, setupContext());
        
        const flowerState = nextActorState.get(flower.id) as Flower;
        expect(flowerState.health).toBe(initialFlowerHealth - CATERPILLAR_DATA.attack);
        expect(caterpillar.healthEaten).toBe(CATERPILLAR_DATA.attack);
    });

    it('should move towards the closest flower', () => {
        const closeFlower = { ...mockFlower, id: 'close', x: 6, y: 6 };
        const farFlower = { ...mockFlower, id: 'far', x: 10, y: 10 };
        nextActorState.set(closeFlower.id, closeFlower);
        nextActorState.set(farFlower.id, farFlower);
        flowerQtree.insert({ x: closeFlower.x, y: closeFlower.y, data: closeFlower });
        flowerQtree.insert({ x: farFlower.x, y: farFlower.y, data: farFlower });

        behavior.update(caterpillar, setupContext());

        // Moves 1 step from (5,5) towards (6,6) -> should move to (6,6)
        expect(caterpillar.x).toBe(6);
        expect(caterpillar.y).toBe(6);
    });
    
    it('should metamorphose into a cocoon when healthEaten reaches the threshold', () => {
        caterpillar.healthEaten = CATERPILLAR_EAT_AMOUNT_FOR_COCOON - CATERPILLAR_DATA.attack; // One bite away
        const flower = { ...mockFlower, x: 5, y: 5 };
        grid[5][5].push(flower);
        nextActorState.set(flower.id, flower);

        behavior.update(caterpillar, setupContext());

        expect(nextActorState.has(caterpillar.id)).toBe(false); // Caterpillar is gone
        
        const cocoon = Array.from(nextActorState.values()).find(a => a.type === 'cocoon') as Cocoon | undefined;
        expect(cocoon).toBeDefined();
        expect(cocoon?.x).toBe(caterpillar.x);
        expect(cocoon?.y).toBe(caterpillar.y);
        expect(cocoon?.hatchTimer).toBe(COCOON_HATCH_TIME);
        expect(cocoon?.butterflyGenome).toEqual(caterpillar.genome);
        expect(events.length).toBe(1);
        expect(events[0].message).toContain('formed a cocoon');
    });

    it('should not metamorphose if healthEaten is below the threshold', () => {
        caterpillar.healthEaten = 0;
        const flower = { ...mockFlower, x: 5, y: 5 };
        grid[5][5].push(flower);
        nextActorState.set(flower.id, flower);

        behavior.update(caterpillar, setupContext());

        expect(nextActorState.has(caterpillar.id)).toBe(true);
        const cocoon = Array.from(nextActorState.values()).find(a => a.type === 'cocoon');
        expect(cocoon).toBeUndefined();
    });
});
