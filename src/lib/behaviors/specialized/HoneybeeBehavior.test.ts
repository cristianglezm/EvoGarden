import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { HoneybeeBehavior } from './HoneybeeBehavior';
import type { Insect, Flower, Hive, CellContent, SimulationParams, TerritoryMark, FlowerSeed } from '../../../types';
import { Quadtree, Rectangle } from '../../Quadtree';
import {
    INSECT_DATA,
    DEFAULT_SIM_PARAMS,
    INSECT_MOVE_COST,
    INSECT_GENOME_LENGTH,
    INSECT_POLLINATION_CHANCE
} from '../../../constants';
import { AsyncFlowerFactory } from '../../asyncFlowerFactory';
import * as simulationUtils from '../../simulationUtils';

const BEE_DATA = INSECT_DATA.get('🐝')!;

vi.mock('../../asyncFlowerFactory');

describe('HoneybeeBehavior', () => {
    let behavior: HoneybeeBehavior;
    let bee: Insect;
    let nextActorState: Map<string, CellContent>;
    let qtree: Quadtree<CellContent>;
    let flowerQtree: Quadtree<CellContent>;
    let newActorQueue: CellContent[];
    let mockAsyncFlowerFactory: AsyncFlowerFactory;
    let requestNewFlower: Mock;

    const getNextId = vi.fn();
    const params: SimulationParams = { ...DEFAULT_SIM_PARAMS, gridWidth: 20, gridHeight: 20 };

    const createMockBee = (id: string, x: number, y: number, hiveId: string, state: Insect['behaviorState'] = 'seeking_food'): Insect => ({
        id, type: 'insect', x, y, emoji: '🐝', pollen: null,
        genome: Array(INSECT_GENOME_LENGTH).fill(1),
        health: BEE_DATA.maxHealth, maxHealth: BEE_DATA.maxHealth,
        stamina: BEE_DATA.maxStamina, maxStamina: BEE_DATA.maxStamina,
        hiveId,
        behaviorState: state,
    });

    const createMockFlower = (id: string, x: number, y: number, isMature = true): Flower => ({
        id, type: 'flower', x, y, health: 100, maxHealth: 100,
        genome: `g-${id}`, imageData: '', stamina: 100, maxStamina: 100,
        age: 51, isMature, maturationPeriod: 50, nutrientEfficiency: 1.0, sex: 'both',
        minTemperature: 10, maxTemperature: 30, toxicityRate: 0.0,
        effects: { vitality: 1, agility: 1, strength: 1, intelligence: 1, luck: 1 }
    });

    const createMockHive = (hiveId: string, x: number, y: number): Hive => ({
        id: `hive-actor-${hiveId}`, type: 'hive', x, y, hiveId,
        honey: 50, pollen: 0, spawnCooldown: 0,
        genome: Array(INSECT_GENOME_LENGTH).fill(0),
    });

    const createMockMark = (id: string, x: number, y: number, hiveId: string): TerritoryMark => ({
        id, type: 'territoryMark', x, y, hiveId, lifespan: 100,
    });

    const mockSeed: FlowerSeed = { id: 'seed-1', type: 'flowerSeed', x: 1, y: 1, imageData: 'stem-image', health: 10, maxHealth: 10, age: 0 };

    beforeEach(() => {
        vi.restoreAllMocks();
        behavior = new HoneybeeBehavior();
        bee = createMockBee('bee1', 10, 10, '1');

        nextActorState = new Map();
        nextActorState.set(bee.id, bee);

        const boundary = new Rectangle(params.gridWidth / 2, params.gridHeight / 2, params.gridWidth / 2, params.gridHeight / 2);
        qtree = new Quadtree(boundary, 4);
        qtree.insert({ x: bee.x, y: bee.y, data: bee });
        flowerQtree = new Quadtree(boundary, 4);

        newActorQueue = [];

        requestNewFlower = vi.fn().mockReturnValue(mockSeed);
        mockAsyncFlowerFactory = new (AsyncFlowerFactory as any)();
        mockAsyncFlowerFactory.requestNewFlower = requestNewFlower;

        getNextId.mockClear().mockImplementation((type: string, x: number, y: number) => {
            if (['territoryMark', 'flower', 'flowerSeed'].includes(type)) {
                return `${type}-${x}-${y}`;
            }
            return `${type}-${x}-${y}-${Math.random()}`;
        });
    });

    const setupContext = (): any => ({
        params,
        qtree,
        flowerQtree,
        nextActorState,
        newActorQueue,
        events: [],
        grid: Array.from({ length: params.gridHeight }, () => Array.from({ length: params.gridWidth }, () => [])),
        asyncFlowerFactory: mockAsyncFlowerFactory,
        incrementInsectsDiedOfOldAge: vi.fn(),
        currentTemperature: params.temperature,
        getNextId,
        claimedCellsThisTick: new Set<string>(),
    });

    describe('Core Behavior', () => {
        it('should seek and move towards the best flower when seeking food', () => {
            const bestFlower = createMockFlower('f1', 12, 12);
            nextActorState.set(bestFlower.id, bestFlower);
            flowerQtree.insert({ x: bestFlower.x, y: bestFlower.y, data: bestFlower });

            behavior.update(bee, setupContext());

            expect(bee.x).toBe(11);
            expect(bee.y).toBe(11);
            expect(bee.stamina).toBe(BEE_DATA.maxStamina - INSECT_MOVE_COST);
        });

        it('should collect pollen and switch to returning_to_hive state', () => {
            const flower = createMockFlower('f1', 10, 10);
            nextActorState.set(flower.id, flower);
            const context = setupContext();
            vi.spyOn(simulationUtils, 'getActorsOnCell').mockReturnValue([flower]);

            behavior.update(bee, context);

            expect(bee.pollen).not.toBeNull();
            expect(bee.pollen?.sourceFlowerId).toBe(flower.id);
            expect(bee.behaviorState).toBe('returning_to_hive');
        });

        it('should move towards its hive when returning', () => {
            const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(params.beePollinationWanderChance + 0.1);
            const hive = createMockHive('1', 5, 5);
            nextActorState.set(hive.id, hive);
            bee.behaviorState = 'returning_to_hive';
            bee.pollen = { genome: 'g1', sourceFlowerId: 'f1', score: 10 };

            behavior.update(bee, setupContext());

            expect(bee.x).toBe(9);
            expect(bee.y).toBe(9);

            randomSpy.mockRestore();
        });

        it('should deposit pollen, restore health/stamina, and switch to seeking_food', () => {
            const hive = createMockHive('1', 10, 10);
            const initialHiveGenome = [...hive.genome];
            nextActorState.set(hive.id, hive);
            bee.behaviorState = 'returning_to_hive';
            const pollenScore = 50;
            bee.pollen = { genome: 'g1', sourceFlowerId: 'f1', score: pollenScore };
            bee.health = 20; // Set low health
            bee.stamina = 10; // Set low stamina

            behavior.update(bee, setupContext());

            const updatedHive = nextActorState.get(hive.id) as Hive;
            expect(updatedHive.pollen).toBe(pollenScore);
            expect(bee.pollen).toBeNull();
            expect(bee.behaviorState).toBe('seeking_food');
            expect(updatedHive.genome).not.toEqual(initialHiveGenome);
            expect(bee.health).toBe(bee.maxHealth); // Check health restored
            expect(bee.stamina).toBe(bee.maxStamina - INSECT_MOVE_COST); // Check stamina restored
        });

        it('should handle dormancy when cold', () => {
            const context = setupContext();
            context.currentTemperature = params.beeDormancyTemp - 1; // Cold
            const hive = createMockHive('1', 10, 10);
            nextActorState.set(hive.id, hive);

            behavior.update(bee, context);

            expect(nextActorState.has(bee.id)).toBe(false);
            const updatedHive = nextActorState.get(hive.id) as Hive;
            expect(updatedHive.storedBees).toBe(1);
            expect(context.events.some((e: { message: string; }) => e.message.includes('entered its hive'))).toBe(true);
        });
    });

    describe('Combat Mechanics', () => {

        it('should create an UNDER_ATTACK signal when overwriting a rival territory mark', () => {
            // Bee from hive '1' will move from 10,10 to 11,11
            const rivalMarkId = getNextId('territoryMark', 11, 11);
            const rivalMark = createMockMark(rivalMarkId, 11, 11, '2'); // Mark from hive '2'
            
            const context = setupContext();
            context.nextActorState.set(rivalMark.id, { ...rivalMark });
            context.qtree.insert({ x: rivalMark.x, y: rivalMark.y, data: rivalMark });

            // Make the bee move to the rival mark's cell
            const flower = createMockFlower('f1', 12, 12);
            context.nextActorState.set(flower.id, flower);
            context.flowerQtree.insert({ x: flower.x, y: flower.y, data: flower });

            behavior.update(bee, context); // Bee moves from (10,10) to (11,11)
        
            const updatedMark = context.nextActorState.get(rivalMarkId) as TerritoryMark;
            expect(updatedMark).toBeDefined();

            // The mark should now be claimed by the bee's hive.
            expect(updatedMark.hiveId).toBe('1'); 
            
            // Because the hiveId was correctly overwritten, a signal should now be present.
            expect(updatedMark.signal).toBeDefined();
            expect(updatedMark.signal?.type).toBe('UNDER_ATTACK');
        });

        it('should become aggressive when encountering a rival bee while seeking food', () => {
            const enemyBee = createMockBee('enemy', 10, 10, '2');
            const context = setupContext();
            context.nextActorState.set(enemyBee.id, enemyBee);
            vi.spyOn(simulationUtils, 'getActorsOnCell').mockReturnValue([bee, enemyBee]);

            behavior.update(bee, context);

            expect(bee.behaviorState).toBe('hunting');
            const mark = Array.from(context.nextActorState.values()).find((a: any) => a.type === 'territoryMark') as TerritoryMark;
            expect(mark).toBeDefined();
            expect(mark.signal).toBeDefined();
            expect(mark.signal?.type).toBe('UNDER_ATTACK');
        });

        it('should react to an UNDER_ATTACK signal but not consume it', () => {
            const markId = getNextId('territoryMark', 10, 10);
            const friendlyMark: TerritoryMark = { id: markId, type: 'territoryMark', x: 10, y: 10, hiveId: '1', lifespan: 50, signal: { type: 'UNDER_ATTACK', origin: {x: 1, y: 1}, ttl: 5 }};
            const context = setupContext();
            context.nextActorState.set(friendlyMark.id, friendlyMark);
            vi.spyOn(simulationUtils, 'getActorsOnCell').mockReturnValue([bee, friendlyMark]);
    
            behavior.update(bee, context);
    
            expect(bee.behaviorState).toBe('hunting');
            const updatedMark = context.nextActorState.get(friendlyMark.id) as TerritoryMark;
            expect(updatedMark.signal).toBeDefined(); // Signal should persist
            expect(updatedMark.signal?.type).toBe('UNDER_ATTACK');
        });
    });

    describe('Pollination', () => {
        it('should correctly create a new FlowerSeed', () => {
            vi.spyOn(Math, 'random').mockReturnValue(INSECT_POLLINATION_CHANCE / 2); // Ensure pollination
            vi.spyOn(simulationUtils, 'findCellForFlowerSpawn').mockReturnValue({ x: 1, y: 1 }); // Control spawn location
            
            const flower = createMockFlower('f2', 10, 10);
            const hive = createMockHive('1', 5, 5); // Add hive to prevent wandering
            bee.behaviorState = 'returning_to_hive'; // Bee must be returning to pollinate
            bee.pollen = { genome: 'g-other', sourceFlowerId: 'f1', score: 10 };
            
            const context = setupContext();
            context.nextActorState.set(flower.id, flower);
            context.nextActorState.set(hive.id, hive);
            vi.spyOn(simulationUtils, 'getActorsOnCell').mockReturnValue([bee, flower]);
    
            behavior.update(bee, context);
    
            expect(requestNewFlower).toHaveBeenCalledTimes(1);
                       
            expect(context.newActorQueue.length).toBe(1);
            const createdSeed = context.newActorQueue[0] as FlowerSeed;
            expect(createdSeed).toBeDefined();
            expect(createdSeed.type).toBe('flowerSeed');
            expect(createdSeed.id).toBe(mockSeed.id);

            vi.spyOn(Math, 'random').mockRestore();
            vi.spyOn(simulationUtils, 'findCellForFlowerSpawn').mockRestore();
        });
    });
});
