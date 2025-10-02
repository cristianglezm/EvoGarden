import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ScorpionBehavior } from './ScorpionBehavior';
import type { Insect, CellContent, SimulationParams, AppEvent, Corpse } from '../../../types';
import { Quadtree, Rectangle } from '../../Quadtree';
import { 
    INSECT_DATA, 
    DEFAULT_SIM_PARAMS, 
    SCORPION_HEAL_FROM_PREY,
    INSECT_ATTACK_COST,
    INSECT_HEALTH_DECAY_PER_TICK,
    INSECT_STAMINA_REGEN_PER_TICK
} from '../../../constants';
import { AsyncFlowerFactory } from '../../asyncFlowerFactory';

const SCORPION_DATA = INSECT_DATA.get('🦂')!;

vi.mock('../../asyncFlowerFactory');

describe('ScorpionBehavior', () => {
    let behavior: ScorpionBehavior;
    let scorpion: Insect;
    let nextActorState: Map<string, CellContent>;
    let qtree: Quadtree<CellContent>;
    let events: AppEvent[];
    const params: SimulationParams = { ...DEFAULT_SIM_PARAMS, gridWidth: 20, gridHeight: 20 };
    
    const createMockPrey = (id: string, x: number, y: number, emoji: '🪲' | '🐌' | '🪳' | '🐞'): Insect => {
        const data = INSECT_DATA.get(emoji)!;
        return {
            id, type: 'insect', x, y, emoji, pollen: null, genome: [],
            health: data.maxHealth, maxHealth: data.maxHealth,
            stamina: data.maxStamina, maxStamina: data.maxStamina,
        };
    };

    beforeEach(() => {
        behavior = new ScorpionBehavior();
        scorpion = {
            id: 'scorpion1', type: 'insect', x: 10, y: 10, emoji: '🦂', pollen: null, 
            genome: [],
            health: SCORPION_DATA.maxHealth, maxHealth: SCORPION_DATA.maxHealth,
            stamina: SCORPION_DATA.maxStamina, maxStamina: SCORPION_DATA.maxStamina,
        };
        nextActorState = new Map();
        nextActorState.set(scorpion.id, scorpion);
        const boundary = new Rectangle(params.gridWidth / 2, params.gridHeight / 2, params.gridWidth / 2, params.gridHeight / 2);
        qtree = new Quadtree(boundary, 4);
        events = [];
    });
    
    const setupContext = (): any => ({
        params,
        qtree,
        nextActorState,
        events,
        grid: Array.from({ length: params.gridHeight }, () => Array.from({ length: params.gridWidth }, () => [])),
        flowerQtree: new Quadtree(new Rectangle(10,10,10,10), 4),
        asyncFlowerFactory: new (AsyncFlowerFactory as any)(),
        incrementInsectsDiedOfOldAge: vi.fn(),
        currentTemperature: params.temperature,
        newActorQueue: [],
    });

    it('should prioritize and move towards a Beetle over a Ladybug', () => {
        const beetle = createMockPrey('beetle1', 12, 12, '🪲');
        const ladybug = createMockPrey('ladybug1', 8, 8, '🐞'); // Closer but lower priority
        nextActorState.set(beetle.id, beetle);
        nextActorState.set(ladybug.id, ladybug);
        qtree.insert({ x: beetle.x, y: beetle.y, data: beetle });
        qtree.insert({ x: ladybug.x, y: ladybug.y, data: ladybug });
        
        behavior.update(scorpion, setupContext());

        expect(scorpion.targetId).toBe(beetle.id);
        // Scorpion at (10,10) moves towards beetle at (12,12). Speed is 1. Should be (11,11).
        expect(scorpion.x).toBe(11);
        expect(scorpion.y).toBe(11);
    });

    it('should damage prey on the same cell and stay locked on target', () => {
        const beetle = createMockPrey('beetle1', 10, 10, '🪲');
        nextActorState.set(beetle.id, beetle);
        scorpion.targetId = beetle.id;
        const initialBeetleHealth = beetle.health;
        const initialScorpionStamina = scorpion.stamina;

        behavior.update(scorpion, setupContext());

        expect(nextActorState.has(beetle.id)).toBe(true);
        const updatedBeetle = nextActorState.get(beetle.id) as Insect;
        expect(updatedBeetle.health).toBe(initialBeetleHealth - SCORPION_DATA.attack);

        const expectedStamina = initialScorpionStamina - INSECT_ATTACK_COST + INSECT_STAMINA_REGEN_PER_TICK;
        expect(scorpion.stamina).toBe(expectedStamina);
        
        expect(scorpion.targetId).toBe(beetle.id);
        expect(events.some(e => e.message.includes('attacked a 🪲'))).toBe(true);
    });
    
    it('should kill prey, create a corpse, heal, and reset target', () => {
        const beetle = createMockPrey('beetle1', 10, 10, '🪲');
        beetle.health = SCORPION_DATA.attack;
        nextActorState.set(beetle.id, beetle);
        
        scorpion.health = 50;
        scorpion.stamina = 20;
        scorpion.targetId = beetle.id;

        const context = setupContext();
        behavior.update(scorpion, context);

        expect(nextActorState.has(beetle.id)).toBe(false);

        expect(context.newActorQueue.length).toBe(1);
        const corpse = context.newActorQueue[0] as Corpse;
        expect(corpse.type).toBe('corpse');
        expect(corpse.x).toBe(beetle.x);
        expect(corpse.originalEmoji).toBe(beetle.emoji);

        expect(scorpion.health).toBeCloseTo(50 - INSECT_HEALTH_DECAY_PER_TICK + SCORPION_HEAL_FROM_PREY);
        
        const expectedStamina = Math.min(scorpion.maxStamina, 20 - INSECT_ATTACK_COST + SCORPION_HEAL_FROM_PREY + INSECT_STAMINA_REGEN_PER_TICK);
        expect(scorpion.stamina).toBe(expectedStamina);
        
        expect(scorpion.targetId).toBeUndefined();
        expect(events.some(e => e.message.includes('killed a 🪲'))).toBe(true);
    });

    it('should wander if no valid prey is nearby', () => {
        const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0);
        const initialX = scorpion.x;
        const initialY = scorpion.y;

        behavior.update(scorpion, setupContext());

        expect(scorpion.x).not.toBe(initialX);
        expect(scorpion.y).not.toBe(initialY);
        randomSpy.mockRestore();
    });
});
