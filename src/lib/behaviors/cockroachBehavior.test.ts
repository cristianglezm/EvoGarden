import { describe, it, expect, beforeEach, vi } from 'vitest';
import { processCockroachTick } from './cockroachBehavior';
import type { Cockroach, Corpse, CellContent, Nutrient, SimulationParams, Flower } from '../../types';
import { Quadtree, Rectangle } from '../Quadtree';
import { 
    INSECT_DATA, 
    NUTRIENT_FROM_COCKROACH_LIFESPAN, 
    DEFAULT_SIM_PARAMS, 
    CORPSE_NUTRITION_VALUE,
    COCKROACH_HEALTH_DECAY_PER_TICK,
    COCKROACH_MIN_STAMINA_TO_MOVE,
    COCKROACH_STAMINA_REGEN_PER_TICK,
    COCKROACH_MOVE_STAMINA_COST,
    FLOWER_STAT_INDICES
} from '../../constants';

const COCKROACH_DATA = INSECT_DATA.get('🪳')!;

describe('cockroachBehavior', () => {
    let cockroach: Cockroach;
    let nextActorState: Map<string, CellContent>;
    let qtree: Quadtree<CellContent>;
    let flowerQtree: Quadtree<CellContent>;
    const params: SimulationParams = { ...DEFAULT_SIM_PARAMS, gridWidth: 10, gridHeight: 10 };

    beforeEach(() => {
        cockroach = {
            id: 'roach1', type: 'cockroach', x: 5, y: 5, emoji: '🪳', genome: [],
            health: COCKROACH_DATA.maxHealth, maxHealth: COCKROACH_DATA.maxHealth,
            stamina: COCKROACH_DATA.maxStamina, maxStamina: COCKROACH_DATA.maxStamina,
        };
        nextActorState = new Map();
        nextActorState.set(cockroach.id, cockroach);
        const boundary = new Rectangle(params.gridWidth / 2, params.gridHeight / 2, params.gridWidth / 2, params.gridHeight / 2);
        qtree = new Quadtree(boundary, 4);
        flowerQtree = new Quadtree(boundary, 4);
    });

    const setupContext = () => ({
        params,
        qtree,
        flowerQtree,
        nextActorState,
    });

    it('should search for and move towards the nearest corpse', () => {
        const corpse1: Corpse = { id: 'corpse1', type: 'corpse', x: 8, y: 8, originalEmoji: '🦋', decayTimer: 10 };
        const corpse2: Corpse = { id: 'corpse2', type: 'corpse', x: 0, y: 0, originalEmoji: '🐛', decayTimer: 10 };
        nextActorState.set(corpse1.id, corpse1);
        nextActorState.set(corpse2.id, corpse2);
        qtree.insert({ x: corpse1.x, y: corpse1.y, data: corpse1 });
        qtree.insert({ x: corpse2.x, y: corpse2.y, data: corpse2 });

        processCockroachTick(cockroach, setupContext());

        // Cockroach at (5,5) should move towards corpse1 at (8,8) as it is closer.
        // dx=1, dy=1. speed=1. new pos is (6,6).
        expect(cockroach.x).toBe(6);
        expect(cockroach.y).toBe(6);
    });

    it('should eat a corpse on the same cell, heal, and create a nutrient', () => {
        const corpse: Corpse = { id: 'corpse1', type: 'corpse', x: 5, y: 5, originalEmoji: '🦋', decayTimer: 10 };
        nextActorState.set(corpse.id, corpse);
        cockroach.health = 10;
        cockroach.stamina = 10;
        
        processCockroachTick(cockroach, setupContext());

        expect(nextActorState.has(corpse.id)).toBe(false);
        // Health check: 10 (initial) - 0.1 (decay) + 20 (nutrition) = 29.9
        expect(cockroach.health).toBeCloseTo(10 - COCKROACH_HEALTH_DECAY_PER_TICK + CORPSE_NUTRITION_VALUE);
        // Stamina check: 10 (initial) + 3 (regen) + 20 (nutrition) = 33
        const expectedStamina = Math.min(cockroach.maxStamina, 10 + COCKROACH_STAMINA_REGEN_PER_TICK + CORPSE_NUTRITION_VALUE);
        expect(cockroach.stamina).toBe(expectedStamina);
        
        const nutrient = Array.from(nextActorState.values()).find(a => a.type === 'nutrient') as Nutrient | undefined;
        expect(nutrient).toBeDefined();
        expect(nutrient?.lifespan).toBe(NUTRIENT_FROM_COCKROACH_LIFESPAN);
    });

    it('should regenerate stamina and move, even if it starts below the threshold', () => {
        // Mock Math.random to ensure a specific, diagonal move is chosen for wandering
        const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0); // This will pick the first move: [-1, -1]

        const initialX = cockroach.x;
        const initialY = cockroach.y;
        cockroach.stamina = COCKROACH_MIN_STAMINA_TO_MOVE - 1; // Starts with 1 stamina
        
        processCockroachTick(cockroach, setupContext());
        
        // The cockroach should move because it regenerates stamina before the movement check.
        expect(cockroach.x).not.toBe(initialX);
        expect(cockroach.y).not.toBe(initialY);

        // Stamina check: 1 (initial) + 3 (regen) - 1 (move cost) = 3
        const expectedStamina = (COCKROACH_MIN_STAMINA_TO_MOVE - 1) + COCKROACH_STAMINA_REGEN_PER_TICK - COCKROACH_MOVE_STAMINA_COST;
        expect(cockroach.stamina).toBe(expectedStamina);

        randomSpy.mockRestore(); // Clean up the mock
    });

    it('should regenerate stamina when idle', () => {
        const initialStamina = 10;
        cockroach.stamina = initialStamina;
        processCockroachTick(cockroach, setupContext());
        // Wanders randomly as there's no target, costing 1 stamina, but regenerating 3.
        const expectedStamina = initialStamina + COCKROACH_STAMINA_REGEN_PER_TICK - COCKROACH_MOVE_STAMINA_COST;
        expect(cockroach.stamina).toBe(expectedStamina);
    });

    it('should die and be removed when health reaches zero', () => {
        cockroach.health = COCKROACH_HEALTH_DECAY_PER_TICK; // It will be 0 after decay
        processCockroachTick(cockroach, setupContext());
        expect(nextActorState.has(cockroach.id)).toBe(false);
    });

    it('should search for and move towards the weakest flower if no corpses are nearby', () => {
        const baseFlower: Omit<Flower, 'id' | 'x' | 'y' | 'health'> = {
            type: 'flower', genome: 'g1', imageData: '', stamina: 100,
            age: 51, isMature: true, maxHealth: 100, maxStamina: 100,
            maturationPeriod: 50, nutrientEfficiency: 1.0, sex: 'both',
            minTemperature: 10, maxTemperature: 30, toxicityRate: 0.1,
            effects: { vitality: 1, agility: 1, strength: 1, intelligence: 1, luck: 1 }
        };

        const weakFlower: Flower = { ...baseFlower, id: 'flower1', x: 8, y: 8, health: 10 };
        const strongFlower: Flower = { ...baseFlower, id: 'flower2', x: 0, y: 0, health: 100 };
        
        // Cockroaches prefer weak flowers. Set genome to dislike high health.
        cockroach.genome = Array(Object.keys(FLOWER_STAT_INDICES).length).fill(0.1);
        cockroach.genome[FLOWER_STAT_INDICES.HEALTH] = -2.0;

        nextActorState.set(weakFlower.id, weakFlower);
        nextActorState.set(strongFlower.id, strongFlower);
        flowerQtree.insert({ x: weakFlower.x, y: weakFlower.y, data: weakFlower });
        flowerQtree.insert({ x: strongFlower.x, y: strongFlower.y, data: strongFlower });

        processCockroachTick(cockroach, setupContext());
        
        // Cockroach at (5,5) should move towards weakFlower at (8,8)
        expect(cockroach.x).toBe(6);
        expect(cockroach.y).toBe(6);
    });

    it('should attack a flower on the same cell', () => {
        const flower: Flower = { 
            id: 'flower1', type: 'flower', x: 5, y: 5, health: 100,
            genome: 'g1', imageData: '', stamina: 100,
            age: 51, isMature: true, maxHealth: 100, maxStamina: 100,
            maturationPeriod: 50, nutrientEfficiency: 1.0, sex: 'both',
            minTemperature: 10, maxTemperature: 30, toxicityRate: 0.1,
            effects: { vitality: 1, agility: 1, strength: 1, intelligence: 1, luck: 1 }
        };
        nextActorState.set(flower.id, flower);
        const initialFlowerHealth = flower.health;
        const initialStamina = cockroach.stamina;

        processCockroachTick(cockroach, setupContext());
        
        const updatedFlower = nextActorState.get(flower.id) as Flower;
        expect(updatedFlower.health).toBe(initialFlowerHealth - COCKROACH_DATA.attack);
        
        // Stamina check: 50 (initial) + 3 (regen) - 2 (attack cost) = 51, capped at 50, then -2 = 48
        const expectedStamina = Math.min(initialStamina + COCKROACH_STAMINA_REGEN_PER_TICK, cockroach.maxStamina) - COCKROACH_DATA.reproductionCost;
        expect(cockroach.stamina).toBe(expectedStamina);
    });
});
