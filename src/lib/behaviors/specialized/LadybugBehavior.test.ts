import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LadybugBehavior } from './LadybugBehavior';
import type { Insect, Flower, CellContent, SimulationParams, AppEvent } from '../../../types';
import { Quadtree, Rectangle } from '../../Quadtree';
import { 
    INSECT_DATA, 
    DEFAULT_SIM_PARAMS, 
    INSECT_STAMINA_REGEN_PER_TICK,
    INSECT_MOVE_COST,
    LADYBUG_HEAL_FROM_CATERPILLAR,
    INSECT_ATTACK_COST,
    INSECT_DORMANCY_TEMP,
    INSECT_HEALTH_DECAY_PER_TICK
} from '../../../constants';
import { AsyncFlowerFactory } from '../../asyncFlowerFactory';

const LADYBUG_DATA = INSECT_DATA.get('🐞')!;
const CATERPILLAR_DATA = INSECT_DATA.get('🐛')!;

vi.mock('../../asyncFlowerFactory');

describe('LadybugBehavior', () => {
    let behavior: LadybugBehavior;
    let ladybug: Insect;
    let nextActorState: Map<string, CellContent>;
    let qtree: Quadtree<CellContent>;
    let flowerQtree: Quadtree<CellContent>;
    let events: AppEvent[];
    const params: SimulationParams = { ...DEFAULT_SIM_PARAMS, gridWidth: 20, gridHeight: 20 };
    
    const createMockFlower = (id: string, x: number, y: number, health: number = 100): Flower => ({
        id, type: 'flower', x, y, health, maxHealth: 100,
        genome: 'g1', imageData: '', stamina: 100, maxStamina: 100,
        age: 51, isMature: true, maturationPeriod: 50, nutrientEfficiency: 1.0, sex: 'both',
        minTemperature: 10, maxTemperature: 30, toxicityRate: 0.0,
        effects: { vitality: 1, agility: 1, strength: 1, intelligence: 1, luck: 1 }
    });

     const createMockCaterpillar = (id: string, x: number, y: number): Insect => ({
        id, type: 'insect', x, y, emoji: '🐛', pollen: null, genome: [],
        health: CATERPILLAR_DATA.maxHealth, maxHealth: CATERPILLAR_DATA.maxHealth,
        stamina: CATERPILLAR_DATA.maxStamina, maxStamina: CATERPILLAR_DATA.maxStamina,
    });


    beforeEach(() => {
        behavior = new LadybugBehavior();
        ladybug = {
            id: 'ladybug1', type: 'insect', x: 10, y: 10, emoji: '🐞', pollen: null, genome: [],
            health: LADYBUG_DATA.maxHealth, maxHealth: LADYBUG_DATA.maxHealth,
            stamina: LADYBUG_DATA.maxStamina, maxStamina: LADYBUG_DATA.maxStamina,
        };
        nextActorState = new Map();
        nextActorState.set(ladybug.id, ladybug);
        const boundary = new Rectangle(params.gridWidth / 2, params.gridHeight / 2, params.gridWidth / 2, params.gridHeight / 2);
        qtree = new Quadtree(boundary, 4);
        flowerQtree = new Quadtree(boundary, 4);
        events = [];
    });
    
    const setupContext = (): any => ({
        params,
        qtree,
        flowerQtree,
        nextActorState,
        events,
        grid: [],
        asyncFlowerFactory: new (AsyncFlowerFactory as any)(),
        incrementInsectsDiedOfOldAge: vi.fn(),
        currentTemperature: params.temperature,
        newActorQueue: [],
    });

    it('should seek and move towards the nearest caterpillar', () => {
        const closeCaterpillar = createMockCaterpillar('c1', 12, 12);
        const farCaterpillar = createMockCaterpillar('c2', 15, 15);
        nextActorState.set(closeCaterpillar.id, closeCaterpillar);
        nextActorState.set(farCaterpillar.id, farCaterpillar);
        qtree.insert({ x: closeCaterpillar.x, y: closeCaterpillar.y, data: closeCaterpillar });
        qtree.insert({ x: farCaterpillar.x, y: farCaterpillar.y, data: farCaterpillar });
        
        behavior.update(ladybug, setupContext());

        // Ladybug at (10,10) should move towards (12,12). Speed is 2.
        // dx=2, dy=2. distance = sqrt(8) ~= 2.8.
        // moveX = 10 + (2/2.8)*2 ~= 11.4 -> 11
        // moveY = 10 + (2/2.8)*2 ~= 11.4 -> 11
        // Wait, speed is 2, so it should be able to cover 2 units.
        // (10,10) -> (11,11) -> (12,12). The move is not iterative.
        // dx=2, dy=2, dist=2.8. moveX = 10+(2/2.8)*2 = 11.41. moveY = 11.41. Rounded to (11,11)
        expect(ladybug.x).toBe(11);
        expect(ladybug.y).toBe(11);
        expect(ladybug.stamina).toBe(LADYBUG_DATA.maxStamina - INSECT_MOVE_COST);
        expect(ladybug.isHunting).toBe(true);
        expect(ladybug.targetId).toBe(closeCaterpillar.id);
    });

    it('should eat a caterpillar on the same cell, heal, and not move', () => {
        const caterpillar = createMockCaterpillar('c1', 10, 10);
        nextActorState.set(caterpillar.id, caterpillar);
        ladybug.health = 50;
        ladybug.stamina = 20;

        behavior.update(ladybug, setupContext());
        
        expect(nextActorState.has(caterpillar.id)).toBe(false);
        // Health: 50 (start) - 0.2 (decay) + 20 (heal) = 69.8
        expect(ladybug.health).toBeCloseTo(50 - INSECT_HEALTH_DECAY_PER_TICK + LADYBUG_HEAL_FROM_CATERPILLAR);
        // Stamina: 20 (start) + 20 (heal) - 4 (attack) + 4 (regen) = 40
        const expectedStamina = Math.min(ladybug.maxStamina, 20 + LADYBUG_HEAL_FROM_CATERPILLAR - INSECT_ATTACK_COST + INSECT_STAMINA_REGEN_PER_TICK);
        expect(ladybug.stamina).toBe(expectedStamina);
        expect(ladybug.x).toBe(10); // Should not move
        expect(ladybug.y).toBe(10);
        expect(events.some(e => e.message.includes('ate a caterpillar'))).toBe(true);
    });

    it('should patrol towards a random flower if no caterpillars are nearby', () => {
        const flower1 = createMockFlower('f1', 12, 12);
        nextActorState.set(flower1.id, flower1);
        flowerQtree.insert({ x: flower1.x, y: flower1.y, data: flower1 });

        behavior.update(ladybug, setupContext());

        expect(ladybug.isHunting).toBe(false);
        expect(ladybug.targetId).toBe(flower1.id);
        expect(ladybug.x).toBe(11);
        expect(ladybug.y).toBe(11);
    });

    it('should not damage a flower it lands on', () => {
        const flower = createMockFlower('f1', 10, 10);
        nextActorState.set(flower.id, flower);
        const initialFlowerHealth = flower.health;

        // Force ladybug to be on the flower cell, but with no caterpillar
        // so it doesn't try to eat. This means it will be idle and regenerate.
        const context = setupContext();
        
        // Mock wander to do nothing to isolate the test
        vi.spyOn(behavior as any, 'wander').mockReturnValue(true);

        behavior.update(ladybug, context);
        
        const finalFlower = nextActorState.get(flower.id) as Flower;
        expect(finalFlower.health).toBe(initialFlowerHealth);
    });
    
    it('should wander if no caterpillars or flowers are nearby', () => {
        const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0);
        const initialX = ladybug.x;
        const initialY = ladybug.y;

        behavior.update(ladybug, setupContext());

        expect(ladybug.x).not.toBe(initialX);
        expect(ladybug.y).not.toBe(initialY);
        randomSpy.mockRestore();
    });

    it('should become dormant when cold', () => {
        const context = setupContext();
        context.currentTemperature = INSECT_DORMANCY_TEMP - 1;
        const initialX = ladybug.x;
        const initialY = ladybug.y;
        
        behavior.update(ladybug, context);

        expect(ladybug.x).toBe(initialX);
        expect(ladybug.y).toBe(initialY);
    });
});
