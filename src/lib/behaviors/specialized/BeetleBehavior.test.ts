import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BeetleBehavior } from './BeetleBehavior';
import type { Insect, Flower, CellContent, SimulationParams, AppEvent } from '../../../types';
import { Quadtree, Rectangle } from '../../Quadtree';
import { 
    INSECT_DATA, 
    DEFAULT_SIM_PARAMS, 
    INSECT_STAMINA_REGEN_PER_TICK,
    INSECT_MOVE_COST,
    BEETLE_HEAL_AMOUNT,
    BEETLE_COLLECT_STAMINA_COST,
    BEETLE_DEPOSIT_STAMINA_COST,
    FLOWER_STAT_INDICES
} from '../../../constants';
import { AsyncFlowerFactory } from '../../asyncFlowerFactory';

const BEETLE_DATA = INSECT_DATA.get('🪲')!;

vi.mock('../../asyncFlowerFactory');

describe('BeetleBehavior', () => {
    let behavior: BeetleBehavior;
    let beetle: Insect;
    let nextActorState: Map<string, CellContent>;
    let flowerQtree: Quadtree<CellContent>;
    let events: AppEvent[];
    const params: SimulationParams = { ...DEFAULT_SIM_PARAMS, gridWidth: 20, gridHeight: 20 };
    
    const createMockFlower = (id: string, x: number, y: number, health: number, maxHealth: number): Flower => ({
        id, type: 'flower', x, y, health, maxHealth,
        // Fill in other required properties with defaults
        genome: 'g1', imageData: '', stamina: 100, maxStamina: 100,
        age: 51, isMature: true, maturationPeriod: 50, nutrientEfficiency: 1.0, sex: 'both',
        minTemperature: 10, maxTemperature: 30, toxicityRate: 0.0,
        effects: { vitality: 1, agility: 1, strength: 1, intelligence: 1, luck: 1 }
    });

    beforeEach(() => {
        behavior = new BeetleBehavior();
        beetle = {
            id: 'beetle1', type: 'insect', x: 10, y: 10, emoji: '🪲', pollen: null, 
            genome: Array(Object.keys(FLOWER_STAT_INDICES).length).fill(1),
            health: BEETLE_DATA.maxHealth, maxHealth: BEETLE_DATA.maxHealth,
            stamina: BEETLE_DATA.maxStamina, maxStamina: BEETLE_DATA.maxStamina,
            isCarryingNutrient: false,
        };
        nextActorState = new Map();
        nextActorState.set(beetle.id, beetle);
        const boundary = new Rectangle(params.gridWidth / 2, params.gridHeight / 2, params.gridWidth / 2, params.gridHeight / 2);
        flowerQtree = new Quadtree(boundary, 4);
        events = [];
    });
    
    const setupContext = (): any => ({
        params,
        flowerQtree,
        nextActorState,
        events,
        grid: Array.from({ length: params.gridHeight }, () => Array.from({ length: params.gridWidth }, () => [])),
        qtree: new Quadtree(new Rectangle(10, 10, 10, 10), 4),
        asyncFlowerFactory: new (AsyncFlowerFactory as any)(),
        incrementInsectsDiedOfOldAge: vi.fn(),
        currentTemperature: params.temperature,
        newActorQueue: [],
    });

    it('should seek and move towards a healthy flower when not carrying nutrients', () => {
        const healthyFlower = createMockFlower('hf1', 12, 12, 90, 100); // 90% health
        nextActorState.set(healthyFlower.id, healthyFlower);
        flowerQtree.insert({ x: healthyFlower.x, y: healthyFlower.y, data: healthyFlower });
        
        behavior.update(beetle, setupContext());

        // Moves 1 step from (10,10) towards (12,12) -> should be (11,11)
        expect(beetle.x).toBe(11);
        expect(beetle.y).toBe(11);
        // Stamina: 50 (start) - 2 (move) = 48. No regen because it moved.
        expect(beetle.stamina).toBe(BEETLE_DATA.maxStamina - INSECT_MOVE_COST);
    });

    it('should collect nutrients upon reaching a healthy flower', () => {
        const healthyFlower = createMockFlower('hf1', 10, 10, 90, 100);
        nextActorState.set(healthyFlower.id, healthyFlower);
        flowerQtree.insert({ x: healthyFlower.x, y: healthyFlower.y, data: healthyFlower });
        
        behavior.update(beetle, setupContext());

        expect(beetle.isCarryingNutrient).toBe(true);
        expect(beetle.stamina).toBe(BEETLE_DATA.maxStamina - BEETLE_COLLECT_STAMINA_COST);
        expect(events.some(e => e.message.includes('collected nutrients'))).toBe(true);
    });

    it('should seek and move towards a weak flower when carrying nutrients', () => {
        beetle.isCarryingNutrient = true;
        const weakFlower = createMockFlower('wf1', 8, 8, 40, 100); // 40% health
        nextActorState.set(weakFlower.id, weakFlower);
        flowerQtree.insert({ x: weakFlower.x, y: weakFlower.y, data: weakFlower });
        
        behavior.update(beetle, setupContext());

        // Moves 1 step from (10,10) towards (8,8) -> should be (9,9)
        expect(beetle.x).toBe(9);
        expect(beetle.y).toBe(9);
        // Stamina: 50 (start) - 2 (move) = 48. No regen because it moved.
        expect(beetle.stamina).toBe(BEETLE_DATA.maxStamina - INSECT_MOVE_COST);
    });

    it('should deposit nutrients at a weak flower, healing it', () => {
        beetle.isCarryingNutrient = true;
        const weakFlower = createMockFlower('wf1', 10, 10, 40, 100);
        nextActorState.set(weakFlower.id, weakFlower);
        flowerQtree.insert({ x: weakFlower.x, y: weakFlower.y, data: weakFlower });
        const initialFlowerHealth = weakFlower.health;
        
        behavior.update(beetle, setupContext());

        const updatedFlower = nextActorState.get('wf1') as Flower;
        expect(updatedFlower.health).toBe(initialFlowerHealth + BEETLE_HEAL_AMOUNT);
        expect(beetle.isCarryingNutrient).toBe(false);
        expect(beetle.stamina).toBe(BEETLE_DATA.maxStamina - BEETLE_DEPOSIT_STAMINA_COST);
        expect(events.some(e => e.message.includes('healed a flower'))).toBe(true);
    });

    it('should wander if it has no nutrients and no healthy flowers are nearby', () => {
        const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0);
        const weakFlower = createMockFlower('wf1', 8, 8, 40, 100);
        nextActorState.set(weakFlower.id, weakFlower);
        flowerQtree.insert({ x: weakFlower.x, y: weakFlower.y, data: weakFlower });
        
        const initialX = beetle.x;
        const initialY = beetle.y;

        behavior.update(beetle, setupContext());

        expect(beetle.x).not.toBe(initialX);
        expect(beetle.y).not.toBe(initialY);
        randomSpy.mockRestore();
    });

    it('should wander if it has nutrients but no weak flowers are nearby', () => {
        const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0);
        beetle.isCarryingNutrient = true;
        const healthyFlower = createMockFlower('hf1', 12, 12, 90, 100);
        nextActorState.set(healthyFlower.id, healthyFlower);
        flowerQtree.insert({ x: healthyFlower.x, y: healthyFlower.y, data: healthyFlower });
        
        const initialX = beetle.x;
        const initialY = beetle.y;

        behavior.update(beetle, setupContext());

        expect(beetle.x).not.toBe(initialX);
        expect(beetle.y).not.toBe(initialY);
        randomSpy.mockRestore();
    });

    it('should not move if stamina is too low, but should regenerate', () => {
        beetle.stamina = INSECT_MOVE_COST - 1; // Not enough to move
        const initialX = beetle.x;
        const initialY = beetle.y;

        behavior.update(beetle, setupContext());

        expect(beetle.x).toBe(initialX);
        expect(beetle.y).toBe(initialY);
        // Should not move, so it's idle and should regenerate stamina
        expect(beetle.stamina).toBe((INSECT_MOVE_COST - 1) + INSECT_STAMINA_REGEN_PER_TICK);
    });

    it('should wander and spend stamina when it has no target', () => {
        const initialStamina = 10;
        beetle.stamina = initialStamina;
        behavior.update(beetle, setupContext());
        // It wanders because there is no target, which costs stamina. No regen because it moved.
        const expectedStamina = initialStamina - INSECT_MOVE_COST;
        expect(beetle.stamina).toBe(expectedStamina);
    });
});
