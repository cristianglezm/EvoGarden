import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CaterpillarBehavior } from './CaterpillarBehavior';
import type { Insect, Flower, Grid, CellContent, Cocoon, AppEvent } from '../../../types';
import { Quadtree, Rectangle } from '../../Quadtree';
import { DEFAULT_SIM_PARAMS, INSECT_DATA, CATERPILLAR_EAT_AMOUNT_FOR_COCOON, COCOON_HATCH_TIME, INSECT_HEALTH_DECAY_PER_TICK, INSECT_HEAL_FROM_HEALING_FLOWER, INSECT_DAMAGE_FROM_TOXIC_FLOWER } from '../../../constants';
import { AsyncFlowerFactory } from '../../asyncFlowerFactory';

vi.mock('../../asyncFlowerFactory');

describe('CaterpillarBehavior', () => {
    let behavior: CaterpillarBehavior;
    let caterpillar: Insect;
    let grid: Grid;
    let nextActorState: Map<string, CellContent>;
    let flowerQtree: Quadtree<CellContent>;
    let qtree: Quadtree<CellContent>;
    let events: AppEvent[];
    const getNextId = vi.fn();
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
        qtree = new Quadtree(boundary, 4);
        flowerQtree = new Quadtree(boundary, 4);
        events = [];
        getNextId.mockClear().mockImplementation((type, x, y) => `${type}-${x}-${y}-${Math.random()}`);
    });
    
    const setupContext = (): any => ({
        grid,
        params: DEFAULT_SIM_PARAMS,
        nextActorState,
        asyncFlowerFactory: new (AsyncFlowerFactory as any)(),
        qtree,
        flowerQtree,
        events,
        incrementInsectsDiedOfOldAge: vi.fn(),
        currentTemperature: DEFAULT_SIM_PARAMS.temperature,
        newActorQueue: [],
        getNextId,
    });

    it('should eat a flower on the same cell, decreasing its health and increasing healthEaten', () => {
        const flower = { ...mockFlower, x: 5, y: 5 };
        grid[5][5].push(flower);
        nextActorState.set(flower.id, flower);
        const initialFlowerHealth = flower.health;

        const context = setupContext();
        context.qtree.insert({ x: flower.x, y: flower.y, data: flower });
        context.flowerQtree.insert({ x: flower.x, y: flower.y, data: flower });

        behavior.update(caterpillar, context);
        
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
        const context = setupContext();
        context.qtree.insert({ x: flower.x, y: flower.y, data: flower });
        context.flowerQtree.insert({ x: flower.x, y: flower.y, data: flower });

        behavior.update(caterpillar, context);

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
        const context = setupContext();
        context.qtree.insert({ x: flower.x, y: flower.y, data: flower });
        context.flowerQtree.insert({ x: flower.x, y: flower.y, data: flower });

        behavior.update(caterpillar, context);

        expect(nextActorState.has(caterpillar.id)).toBe(true);
        const cocoon = Array.from(nextActorState.values()).find(a => a.type === 'cocoon');
        expect(cocoon).toBeUndefined();
    });

    it('should be healed by a healing flower', () => {
        const healingFlower: Flower = { ...mockFlower, id: 'h-flower', x: 5, y: 5, toxicityRate: -0.5 };
        grid[5][5].push(healingFlower);
        nextActorState.set(healingFlower.id, healingFlower);
        caterpillar.health = 50;
        const initialHealth = caterpillar.health;

        const context = setupContext();
        context.qtree.insert({ x: healingFlower.x, y: healingFlower.y, data: healingFlower });
        
        behavior.update(caterpillar, context);
        
        const expectedHeal = INSECT_HEAL_FROM_HEALING_FLOWER * Math.abs(healingFlower.toxicityRate);
        const expectedHealth = Math.min(caterpillar.maxHealth, initialHealth - INSECT_HEALTH_DECAY_PER_TICK + expectedHeal);
        expect(caterpillar.health).toBeCloseTo(expectedHealth);
    });

    it('should be damaged by a toxic flower', () => {
        const toxicFlower: Flower = { ...mockFlower, id: 't-flower', x: 5, y: 5, toxicityRate: 0.8 };
        grid[5][5].push(toxicFlower);
        nextActorState.set(toxicFlower.id, toxicFlower);
        caterpillar.health = 50;
        const initialHealth = caterpillar.health;

        const context = setupContext();
        context.qtree.insert({ x: toxicFlower.x, y: toxicFlower.y, data: toxicFlower });
        
        behavior.update(caterpillar, context);
        
        const expectedDamage = INSECT_DAMAGE_FROM_TOXIC_FLOWER * toxicFlower.toxicityRate;
        const expectedHealth = Math.max(0, initialHealth - INSECT_HEALTH_DECAY_PER_TICK - expectedDamage);
        expect(caterpillar.health).toBeCloseTo(expectedHealth);
    });

    it('should only decay health on a neutral flower', () => {
        const neutralFlower: Flower = { ...mockFlower, id: 'n-flower', x: 5, y: 5, toxicityRate: 0 };
        grid[5][5].push(neutralFlower);
        nextActorState.set(neutralFlower.id, neutralFlower);
        caterpillar.health = 50;
        const initialHealth = caterpillar.health;

        const context = setupContext();
        context.qtree.insert({ x: neutralFlower.x, y: neutralFlower.y, data: neutralFlower });
        
        behavior.update(caterpillar, context);
        
        const expectedHealth = initialHealth - INSECT_HEALTH_DECAY_PER_TICK;
        expect(caterpillar.health).toBeCloseTo(expectedHealth);
    });
});
