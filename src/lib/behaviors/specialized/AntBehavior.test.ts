import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AntBehavior } from './AntBehavior';
import type { Insect, Corpse, AntColony, PheromoneTrail, CellContent, SimulationParams, AppEvent } from '../../../types';
import { Quadtree, Rectangle } from '../../Quadtree';
import { 
    INSECT_DATA, 
    DEFAULT_SIM_PARAMS, 
    INSECT_MOVE_COST,
    FOOD_VALUE_CORPSE,
    ANT_CARRY_CAPACITY
} from '../../../constants';
import { AsyncFlowerFactory } from '../../asyncFlowerFactory';

const ANT_DATA = INSECT_DATA.get('🐜')!;

vi.mock('../../asyncFlowerFactory');

describe('AntBehavior', () => {
    let behavior: AntBehavior;
    let ant: Insect;
    let nextActorState: Map<string, CellContent>;
    let qtree: Quadtree<CellContent>;
    let newActorQueue: CellContent[];
    const getNextId = vi.fn();
    const params: SimulationParams = { ...DEFAULT_SIM_PARAMS, gridWidth: 20, gridHeight: 20 };
    
    const createMockCorpse = (id: string, x: number, y: number): Corpse => ({
        id, type: 'corpse', x, y, originalEmoji: '🦋', decayTimer: 10, foodValue: FOOD_VALUE_CORPSE,
    });
    
    const createMockColony = (colonyId: string, x: number, y: number): AntColony => ({
        id: `colony-actor-${colonyId}`, type: 'antColony', x, y, colonyId,
        foodReserves: 50, spawnCooldown: 0, genome: [],
    });

    beforeEach(() => {
        behavior = new AntBehavior();
        ant = {
            id: 'ant1', type: 'insect', x: 10, y: 10, emoji: '🐜', pollen: null, 
            genome: [],
            health: ANT_DATA.maxHealth, maxHealth: ANT_DATA.maxHealth,
            stamina: ANT_DATA.maxStamina, maxStamina: ANT_DATA.maxStamina,
            colonyId: '1',
            behaviorState: 'seeking_food',
        };
        nextActorState = new Map();
        nextActorState.set(ant.id, ant);
        const boundary = new Rectangle(params.gridWidth / 2, params.gridHeight / 2, params.gridWidth / 2, params.gridHeight / 2);
        qtree = new Quadtree(boundary, 4);
        newActorQueue = [];
        getNextId.mockClear().mockImplementation((type, x, y) => `${type}-${x}-${y}-${Math.random()}`);
    });
    
    const setupContext = (): any => ({
        params,
        qtree,
        nextActorState,
        newActorQueue,
        events: [] as AppEvent[],
        grid: Array.from({ length: params.gridHeight }, () => Array.from({ length: params.gridWidth }, () => [])),
        flowerQtree: new Quadtree(new Rectangle(10,10,10,10), 4),
        asyncFlowerFactory: new (AsyncFlowerFactory as any)(),
        incrementInsectsDiedOfOldAge: vi.fn(),
        currentTemperature: params.temperature,
        getNextId,
    });

    it('should seek and move towards the nearest corpse', () => {
        const corpse = createMockCorpse('c1', 13, 13);
        nextActorState.set(corpse.id, corpse);
        qtree.insert({ x: corpse.x, y: corpse.y, data: corpse });
        
        behavior.update(ant, setupContext());

        // Ant at (10,10) moves towards (13,13). Speed is 2.
        // dx=3, dy=3, dist=sqrt(18) ~= 4.24.
        // moveX = 10 + (3/4.24)*2 ~= 11.4 -> 11
        // moveY = 10 + (3/4.24)*2 ~= 11.4 -> 11
        expect(ant.x).toBe(11);
        expect(ant.y).toBe(11);
        expect(ant.stamina).toBe(ANT_DATA.maxStamina - INSECT_MOVE_COST);
    });

    it('should harvest from a corpse and switch to returning_to_colony state', () => {
        const corpse = createMockCorpse('c1', 10, 10);
        const initialFoodValue = corpse.foodValue;
        nextActorState.set(corpse.id, corpse);
        const context = setupContext();
        context.qtree.insert({ x: corpse.x, y: corpse.y, data: corpse });

        behavior.update(ant, context);
        
        expect(nextActorState.has(corpse.id)).toBe(true); // Corpse is NOT picked up, but harvested
        const updatedCorpse = nextActorState.get(corpse.id) as Corpse;
        const harvestedAmount = Math.min(ANT_CARRY_CAPACITY, initialFoodValue);
        expect(updatedCorpse.foodValue).toBe(initialFoodValue - harvestedAmount);
        expect(ant.carriedItem).toEqual({ type: 'corpse', value: harvestedAmount });
        expect(ant.behaviorState).toBe('returning_to_colony');
    });

    it('should move towards its colony when returning', () => {
        const colony = createMockColony('1', 5, 5);
        nextActorState.set(colony.id, colony);
        ant.behaviorState = 'returning_to_colony';
        ant.carriedItem = { type: 'corpse', value: FOOD_VALUE_CORPSE };

        behavior.update(ant, setupContext());

        // Ant at (10,10) moves towards (5,5). Speed is 2.
        // dx=-5, dy=-5, dist=sqrt(50) ~= 7.07
        // moveX = 10 + (-5/7.07)*2 ~= 8.58 -> 9
        // moveY = 10 + (-5/7.07)*2 ~= 8.58 -> 9
        expect(ant.x).toBe(9);
        expect(ant.y).toBe(9);
    });

    it('should deposit food at colony and switch to seeking_food', () => {
        const colony = createMockColony('1', 10, 10);
        nextActorState.set(colony.id, colony);
        ant.behaviorState = 'returning_to_colony';
        ant.carriedItem = { type: 'corpse', value: FOOD_VALUE_CORPSE };

        behavior.update(ant, setupContext());

        const updatedColony = nextActorState.get(colony.id) as AntColony;
        expect(updatedColony.foodReserves).toBe(50 + FOOD_VALUE_CORPSE);
        expect(ant.carriedItem).toBeUndefined();
        expect(ant.behaviorState).toBe('seeking_food');
    });
    
    it('should leave a pheromone trail when returning to colony with food', () => {
        const colony = createMockColony('1', 5, 5);
        nextActorState.set(colony.id, colony);
        ant.behaviorState = 'returning_to_colony';
        ant.carriedItem = { type: 'corpse', value: FOOD_VALUE_CORPSE };
        
        const context = setupContext();
        behavior.update(ant, context);

        // Ant moves from (10,10) to (9,9)
        expect(context.newActorQueue.length).toBe(1);
        const trail = context.newActorQueue[0] as PheromoneTrail;
        expect(trail.type).toBe('pheromoneTrail');
        // The trail should be at the *new* position of the ant after moving.
        expect(trail.x).toBe(9);
        expect(trail.y).toBe(9);
        expect(trail.strength).toBe(FOOD_VALUE_CORPSE);
    });

    it('should follow a stronger pheromone trail', () => {
        const strongTrail: PheromoneTrail = { id: 't1', type: 'pheromoneTrail', x: 11, y: 11, colonyId: '1', strength: 10, lifespan: 10 };
        const weakTrail: PheromoneTrail = { id: 't2', type: 'pheromoneTrail', x: 9, y: 9, colonyId: '1', strength: 5, lifespan: 10 };
        nextActorState.set(strongTrail.id, strongTrail);
        nextActorState.set(weakTrail.id, weakTrail);
        ant.behaviorState = 'seeking_food'; // When seeking, it should follow trails

        const context = setupContext();
        context.qtree.insert({ x: strongTrail.x, y: strongTrail.y, data: strongTrail });
        context.qtree.insert({ x: weakTrail.x, y: weakTrail.y, data: weakTrail });

        behavior.update(ant, context);
        
        expect(ant.x).toBe(11);
        expect(ant.y).toBe(11);
    });
});
