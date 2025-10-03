import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HoneybeeBehavior } from './HoneybeeBehavior';
import type { Insect, Flower, Hive, CellContent, SimulationParams, TerritoryMark } from '../../../types';
import { Quadtree, Rectangle } from '../../Quadtree';
import { 
    INSECT_DATA, 
    DEFAULT_SIM_PARAMS, 
    INSECT_MOVE_COST,
    INSECT_GENOME_LENGTH
} from '../../../constants';
import { AsyncFlowerFactory } from '../../asyncFlowerFactory';

const BEE_DATA = INSECT_DATA.get('🐝')!;

vi.mock('../../asyncFlowerFactory');

describe('HoneybeeBehavior', () => {
    let behavior: HoneybeeBehavior;
    let bee: Insect;
    let nextActorState: Map<string, CellContent>;
    let qtree: Quadtree<CellContent>;
    let flowerQtree: Quadtree<CellContent>;
    let newActorQueue: CellContent[];
    const params: SimulationParams = { ...DEFAULT_SIM_PARAMS, gridWidth: 20, gridHeight: 20 };
    
    const createMockFlower = (id: string, x: number, y: number): Flower => ({
        id, type: 'flower', x, y, health: 100, maxHealth: 100,
        genome: 'g1', imageData: '', stamina: 100, maxStamina: 100,
        age: 51, isMature: true, maturationPeriod: 50, nutrientEfficiency: 1.0, sex: 'both',
        minTemperature: 10, maxTemperature: 30, toxicityRate: 0.0,
        effects: { vitality: 1, agility: 1, strength: 1, intelligence: 1, luck: 1 }
    });
    
    const createMockHive = (hiveId: string, x: number, y: number): Hive => ({
        id: `hive-actor-${hiveId}`, type: 'hive', x, y, hiveId,
        honey: 50, pollen: 0, spawnCooldown: 0,
        genome: Array(INSECT_GENOME_LENGTH).fill(0),
    });

    beforeEach(() => {
        behavior = new HoneybeeBehavior();
        bee = {
            id: 'bee1', type: 'insect', x: 10, y: 10, emoji: '🐝', pollen: null, 
            genome: Array(INSECT_GENOME_LENGTH).fill(1),
            health: BEE_DATA.maxHealth, maxHealth: BEE_DATA.maxHealth,
            stamina: BEE_DATA.maxStamina, maxStamina: BEE_DATA.maxStamina,
            hiveId: '1',
            behaviorState: 'seeking_food',
        };
        nextActorState = new Map();
        nextActorState.set(bee.id, bee);
        const boundary = new Rectangle(params.gridWidth / 2, params.gridHeight / 2, params.gridWidth / 2, params.gridHeight / 2);
        qtree = new Quadtree(boundary, 4);
        flowerQtree = new Quadtree(boundary, 4);
        newActorQueue = [];
    });
    
    const setupContext = (): any => ({
        params,
        qtree,
        flowerQtree,
        nextActorState,
        newActorQueue,
        events: [],
        grid: Array.from({ length: params.gridHeight }, () => Array.from({ length: params.gridWidth }, () => [])),
        asyncFlowerFactory: new (AsyncFlowerFactory as any)(),
        incrementInsectsDiedOfOldAge: vi.fn(),
        currentTemperature: params.temperature,
    });

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

        behavior.update(bee, setupContext());
        
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

    it('should deposit pollen at hive, evolve hive genome, and switch to seeking_food', () => {
        const hive = createMockHive('1', 10, 10);
        const initialHiveGenome = [...hive.genome];
        nextActorState.set(hive.id, hive);
        bee.behaviorState = 'returning_to_hive';
        const pollenScore = 50;
        bee.pollen = { genome: 'g1', sourceFlowerId: 'f1', score: pollenScore };

        behavior.update(bee, setupContext());

        const updatedHive = nextActorState.get(hive.id) as Hive;
        expect(updatedHive.pollen).toBe(pollenScore);
        expect(bee.pollen).toBeNull();
        expect(bee.behaviorState).toBe('seeking_food');
        
        // Check hive genome evolution
        const expectedGeneValue = (1 - 0.05) * 0 + 0.05 * 1; // (1-rate)*hive_gene + rate*bee_gene
        expect(updatedHive.genome).not.toEqual(initialHiveGenome);
        updatedHive.genome.forEach(gene => {
            expect(gene).toBeCloseTo(expectedGeneValue);
        });
    });

    it('should leave a territory mark on its cell', () => {
        const context = setupContext();
        behavior.update(bee, context);
        
        expect(context.newActorQueue.length).toBe(1);
        const mark = context.newActorQueue[0] as TerritoryMark;
        expect(mark.type).toBe('territoryMark');
        expect(mark.x).toBe(bee.x);
        expect(mark.y).toBe(bee.y);
        expect(mark.hiveId).toBe(bee.hiveId);
    });

    it('should switch to hunting when an UNDER_ATTACK signal is on its territory mark', () => {
        const mark: TerritoryMark = { id: 'mark1', type: 'territoryMark', x: 10, y: 10, hiveId: '1', lifespan: 10, signal: { type: 'UNDER_ATTACK', origin: {x: 1, y: 1}, ttl: 5 } };
        nextActorState.set(mark.id, mark);
        
        // Fix: Add an enemy bee for the hunt logic to find
        const enemyBee: Insect = { 
            id: 'enemyBee', type: 'insect', x: 11, y: 11, emoji: '🐝', pollen: null, 
            genome: [], health: 100, maxHealth: 100, stamina: 100, maxStamina: 100, 
            hiveId: '2' // Different hiveId makes it an enemy
        };
        nextActorState.set(enemyBee.id, enemyBee);
        qtree.insert({ x: enemyBee.x, y: enemyBee.y, data: enemyBee });
        
        behavior.update(bee, setupContext());

        expect(bee.behaviorState).toBe('hunting');
    });

    it('should enter hive and be removed from state when at hive and it is cold', () => {
        const context = setupContext();
        context.currentTemperature = params.beeDormancyTemp - 1; // Cold
        const hive = createMockHive('1', 10, 10);
        nextActorState.set(hive.id, hive);

        behavior.update(bee, context);
        
        expect(nextActorState.has(bee.id)).toBe(false); // Bee removed
        const updatedHive = nextActorState.get(hive.id) as Hive;
        expect(updatedHive.storedBees).toBe(1);
        expect(context.events.some((e: { message: string; }) => e.message.includes('entered its hive'))).toBe(true);
    });

    it('should move towards hive when not at hive and it is cold', () => {
        const context = setupContext();
        context.currentTemperature = params.beeDormancyTemp - 1; // Cold
        const hive = createMockHive('1', 5, 5); // Hive is away from bee
        nextActorState.set(hive.id, hive);
        
        behavior.update(bee, context);

        expect(nextActorState.has(bee.id)).toBe(true); // Bee still exists
        expect(bee.x).toBe(9); // Moved towards hive
        expect(bee.y).toBe(9);
        expect(bee.behaviorState).toBe('returning_to_hive');
        const updatedHive = nextActorState.get(hive.id) as Hive;
        expect(updatedHive.storedBees).toBeUndefined(); // Or 0, but not incremented
    });
});
