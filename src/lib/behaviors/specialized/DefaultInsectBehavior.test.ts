import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { DefaultInsectBehavior } from './DefaultInsectBehavior';
import type { Insect, Flower, Grid, CellContent, AppEvent, FlowerSeed } from '../../../types';
import { Quadtree, Rectangle } from '../../Quadtree';
import { DEFAULT_SIM_PARAMS, INSECT_HEALTH_DECAY_PER_TICK, INSECT_MOVE_COST, INSECT_STAMINA_REGEN_PER_TICK, INSECT_DATA, INSECT_HEAL_FROM_HEALING_FLOWER, TOXIC_FLOWER_THRESHOLD, INSECT_DAMAGE_FROM_TOXIC_FLOWER, FLOWER_STAT_INDICES, CORPSE_DECAY_TIME, INSECT_DORMANCY_TEMP, INSECT_POLLINATION_CHANCE, INSECT_WANDER_CHANCE, INSECT_STAMINA_GAIN_FROM_EATING } from '../../../constants';
import { AsyncFlowerFactory } from '../../asyncFlowerFactory';

vi.mock('../../asyncFlowerFactory');

describe('DefaultInsectBehavior', () => {
    let behavior: DefaultInsectBehavior;
    let insect: Insect;
    let grid: Grid;
    let nextActorState: Map<string, CellContent>;
    let qtree: Quadtree<CellContent>;
    let flowerQtree: Quadtree<CellContent>;
    let mockAsyncFlowerFactory: AsyncFlowerFactory;
    let requestNewFlower: Mock;
    let events: AppEvent[];
    let newActorQueue: CellContent[];
    let incrementInsectsDiedOfOldAge: Mock;
    const getNextId = vi.fn();
    
    const mockFlower: Flower = {
        id: 'flower1', type: 'flower', x: 8, y: 8,
        genome: 'g1', imageData: '', health: 100, stamina: 100,
        age: 51, isMature: true, maxHealth: 100, maxStamina: 100,
        maturationPeriod: 50, nutrientEfficiency: 1.0, sex: 'both',
        minTemperature: 10, maxTemperature: 30, toxicityRate: 0.1,
        effects: { vitality: 1, agility: 1, strength: 1, intelligence: 1, luck: 1 }
    };
    const mockSeed: FlowerSeed = { id: 'seed-1', type: 'flowerSeed', x: 0, y: 0, imageData: 'stem-image', health: 10, maxHealth: 10, age: 0 };

    beforeEach(() => {
        behavior = new DefaultInsectBehavior();
        const baseStats = INSECT_DATA.get('🐞')!; // Changed from 🦋 to 🐞
        insect = { 
            id: 'insect1', type: 'insect', x: 5, y: 5, pollen: null, emoji: '🐞', // Changed from 🦋 to 🐞
            health: baseStats.maxHealth,
            maxHealth: baseStats.maxHealth,
            stamina: baseStats.maxStamina,
            maxStamina: baseStats.maxStamina,
            genome: Array(Object.keys(FLOWER_STAT_INDICES).length).fill(1) // Simple genome that likes everything
        };
        grid = Array.from({ length: 15 }, () => Array.from({ length: 15 }, () => []));
        grid[5][5].push(insect);
        nextActorState = new Map();
        nextActorState.set(insect.id, insect);
        
        requestNewFlower = vi.fn().mockReturnValue(mockSeed);
        mockAsyncFlowerFactory = new (AsyncFlowerFactory as any)();
        mockAsyncFlowerFactory.requestNewFlower = requestNewFlower;

        const boundary = new Rectangle(7.5, 7.5, 7.5, 7.5);
        qtree = new Quadtree(boundary, 4);
        flowerQtree = new Quadtree(boundary, 4);
        newActorQueue = [];
        events = [];
        incrementInsectsDiedOfOldAge = vi.fn();
        getNextId.mockClear().mockImplementation((type, x, y) => `${type}-${x}-${y}-${Math.random()}`);
    });
    
    const setupContext = () => ({
        grid,
        params: DEFAULT_SIM_PARAMS,
        nextActorState,
        asyncFlowerFactory: mockAsyncFlowerFactory,
        qtree,
        flowerQtree,
        events,
        incrementInsectsDiedOfOldAge,
        currentTemperature: DEFAULT_SIM_PARAMS.temperature,
        newActorQueue,
        getNextId,
        claimedCellsThisTick: new Set<string>(),
    });

    it('should lose health and not move or attack if stamina is too low', () => {
        const initialHealth = insect.health;
        const initialStamina = INSECT_MOVE_COST - 1;
        insect.stamina = initialStamina;
        const initialX = insect.x;
        const initialY = insect.y;
        
        behavior.update(insect, setupContext());
        
        expect(insect.health).toBe(initialHealth - INSECT_HEALTH_DECAY_PER_TICK);
        expect(insect.stamina).toBe(initialStamina + INSECT_STAMINA_REGEN_PER_TICK);
        expect(insect.x).toBe(initialX);
        expect(insect.y).toBe(initialY);
    });

    it('should become dormant and not move when it is cold', () => {
        const context = setupContext();
        context.currentTemperature = INSECT_DORMANCY_TEMP - 1; // Make it cold
    
        const initialStamina = insect.stamina;
        const initialX = insect.x;
        const initialY = insect.y;
        
        behavior.update(insect, context);
        
        // Insect should not move
        expect(insect.x).toBe(initialX);
        expect(insect.y).toBe(initialY);
    
        // No action was taken, so stamina should not change. The implementation returns early, so no regen happens either.
        expect(insect.stamina).toBe(initialStamina); 
    });

    it('should move towards the flower with the highest genetic score', () => {
        // Mock Math.random to ensure the insect doesn't wander and instead targets the flower
        const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(INSECT_WANDER_CHANCE + 0.1); 

        // Genome prefers health (index 0) and dislikes toxicity (index 2)
        insect.genome = Array(Object.keys(FLOWER_STAT_INDICES).length).fill(0);
        insect.genome[FLOWER_STAT_INDICES.HEALTH] = 1.0;
        insect.genome[FLOWER_STAT_INDICES.TOXICITY] = -1.0;

        const healthyFlower: Flower = { ...mockFlower, id: 'healthy', x: 8, y: 8, health: 100, toxicityRate: 0.1 };
        const toxicFlower: Flower = { ...mockFlower, id: 'toxic', x: 3, y: 3, health: 50, toxicityRate: 0.8 };
        
        grid[8][8].push(healthyFlower);
        grid[3][3].push(toxicFlower);
        nextActorState.set(healthyFlower.id, healthyFlower);
        nextActorState.set(toxicFlower.id, toxicFlower);
        flowerQtree.insert({ x: healthyFlower.x, y: healthyFlower.y, data: healthyFlower });
        flowerQtree.insert({ x: toxicFlower.x, y: toxicFlower.y, data: toxicFlower });

        behavior.update(insect, setupContext());

        // Should move towards the healthy flower at (8,8)
        // Starts at (5,5), speed is 2 (for ladybug). Moves towards (8,8)
        expect(insect.x).toBe(6);
        expect(insect.y).toBe(6);

        randomSpy.mockRestore(); // Clean up the mock
    });

    it('should attack a flower, gain stamina, lose health, and pick up pollen', () => {
        const flower = { ...mockFlower, x: 5, y: 5 }; // Place flower on same cell
        grid[5][5].push(flower);
        nextActorState.set(flower.id, flower);

        const initialHealth = insect.health;
        const initialStamina = insect.stamina;

        const context = setupContext();
        context.qtree.insert({ x: flower.x, y: flower.y, data: flower });
        context.flowerQtree.insert({ x: flower.x, y: flower.y, data: flower });

        behavior.update(insect, context);
        
        const flowerState = nextActorState.get(flower.id) as Flower;
        const baseStats = INSECT_DATA.get(insect.emoji)!;

        // Stamina logic: insects GAIN stamina from eating, then spend some to wander away.
        const expectedStamina = Math.min(insect.maxStamina, initialStamina + INSECT_STAMINA_GAIN_FROM_EATING) - INSECT_MOVE_COST;
        expect(insect.stamina).toBe(expectedStamina);
        
        // Flower health is reduced by the insect's attack power.
        expect(flowerState.health).toBe(flower.maxHealth - baseStats.attack);
        
        // Insect health logic: it decays per tick, and takes damage based on flower toxicity.
        const damageFromFlower = INSECT_DAMAGE_FROM_TOXIC_FLOWER * flower.toxicityRate;
        const expectedHealth = initialHealth - INSECT_HEALTH_DECAY_PER_TICK - damageFromFlower;
        expect(insect.health).toBeCloseTo(expectedHealth);
        
        // Pollen check remains the same.
        expect(insect.pollen).toEqual({ genome: flower.genome, sourceFlowerId: flower.id, score: expect.any(Number) });
    });

    it('should be healed by a healing flower', () => {
        const healingFlower: Flower = { ...mockFlower, id: 'h-flower', x: 5, y: 5, toxicityRate: -0.5 };
        grid[5][5].push(healingFlower);
        nextActorState.set(healingFlower.id, healingFlower);
        
        const initialHealth = insect.health;

        const context = setupContext();
        context.qtree.insert({ x: healingFlower.x, y: healingFlower.y, data: healingFlower });
        context.flowerQtree.insert({ x: healingFlower.x, y: healingFlower.y, data: healingFlower });
        
        behavior.update(insect, context);
        
        expect(insect.health).toBe(Math.min(insect.maxHealth, initialHealth - INSECT_HEALTH_DECAY_PER_TICK + (INSECT_HEAL_FROM_HEALING_FLOWER * Math.abs(healingFlower.toxicityRate))));
    });
    
    it('should take damage from a toxic flower', () => {
        const toxicFlower: Flower = { ...mockFlower, id: 't-flower', x: 5, y: 5, toxicityRate: TOXIC_FLOWER_THRESHOLD + 0.1 };
        grid[5][5].push(toxicFlower);
        nextActorState.set(toxicFlower.id, toxicFlower);

        const initialHealth = insect.health;
        
        const context = setupContext();
        context.qtree.insert({ x: toxicFlower.x, y: toxicFlower.y, data: toxicFlower });
        context.flowerQtree.insert({ x: toxicFlower.x, y: toxicFlower.y, data: toxicFlower });

        behavior.update(insect, context);

        const damageFromFlower = INSECT_DAMAGE_FROM_TOXIC_FLOWER * toxicFlower.toxicityRate;
        const expectedHealth = initialHealth - INSECT_HEALTH_DECAY_PER_TICK - damageFromFlower;
        
        expect(insect.health).toBeCloseTo(expectedHealth);
    });

    it('should pollinate a different mature flower', () => {
        const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(INSECT_POLLINATION_CHANCE / 2);

        const targetFlower: Flower = { ...mockFlower, id: 'flower2', x: 5, y: 5, genome: 'g2', isMature: true };
        grid[5][5].push(targetFlower);
        nextActorState.set(targetFlower.id, targetFlower);
        
        insect.pollen = { genome: 'g1', sourceFlowerId: 'flower1', score: 10 };
        
        const context = setupContext();
        context.qtree.insert({ x: targetFlower.x, y: targetFlower.y, data: targetFlower });
        context.flowerQtree.insert({ x: targetFlower.x, y: targetFlower.y, data: targetFlower });

        behavior.update(insect, context);
        
        expect(requestNewFlower).toHaveBeenCalledTimes(1);
        expect(requestNewFlower).toHaveBeenCalledWith(context.nextActorState, expect.any(Number), expect.any(Number), 'g2', 'g1', expect.any(Function));
        expect(newActorQueue.length).toBe(1);

        randomSpy.mockRestore();
    });

    it('should die when health reaches zero, creating a corpse', () => {
        insect.health = INSECT_HEALTH_DECAY_PER_TICK; // It will be 0 after decay
        
        behavior.update(insect, setupContext());
        
        expect(nextActorState.has(insect.id)).toBe(false);
        
        const corpse = Array.from(nextActorState.values()).find(a => a.type === 'corpse');
        expect(corpse).toBeDefined();
        expect(corpse?.x).toBe(insect.x);
        expect(corpse?.y).toBe(insect.y);
        expect((corpse as any).decayTimer).toBe(CORPSE_DECAY_TIME);
        expect((corpse as any).originalEmoji).toBe(insect.emoji);
        
        expect(events.length).toBe(1);
        expect(events[0].message).toContain('died.');
        
        expect(incrementInsectsDiedOfOldAge).toHaveBeenCalledTimes(1);
    });

    it('should not pollinate the same flower', () => {
        vi.spyOn(Math, 'random').mockReturnValue(INSECT_POLLINATION_CHANCE / 2);

        // Place flower on the same cell as the insect
        const targetFlower: Flower = { ...mockFlower, id: 'flower1', x: 5, y: 5, genome: 'g1', isMature: true };
        grid[5][5].push(targetFlower);
        nextActorState.set(targetFlower.id, targetFlower);

        const context = setupContext();
        context.qtree.insert({ x: targetFlower.x, y: targetFlower.y, data: targetFlower });
        context.flowerQtree.insert({ x: targetFlower.x, y: targetFlower.y, data: targetFlower });

        // Insect is carrying pollen from the flower it's currently on
        insect.pollen = { genome: 'g1', sourceFlowerId: 'flower1', score: 10 };

        behavior.update(insect, context);

        expect(requestNewFlower).not.toHaveBeenCalled();

        vi.spyOn(Math, 'random').mockRestore();
    });

    it('should not pollinate an immature flower', () => {
        vi.spyOn(Math, 'random').mockReturnValue(INSECT_POLLINATION_CHANCE / 2);
        
        // Place immature flower on the same cell
        const targetFlower: Flower = { ...mockFlower, id: 'flower2', x: 5, y: 5, genome: 'g2', isMature: false };
        grid[5][5].push(targetFlower);
        nextActorState.set(targetFlower.id, targetFlower);

        const context = setupContext();
        context.qtree.insert({ x: targetFlower.x, y: targetFlower.y, data: targetFlower });
        context.flowerQtree.insert({ x: targetFlower.x, y: targetFlower.y, data: targetFlower });

        // Insect has pollen from another flower
        insect.pollen = { genome: 'g1', sourceFlowerId: 'flower1', score: 10 };

        behavior.update(insect, context);

        expect(requestNewFlower).not.toHaveBeenCalled();

        vi.spyOn(Math, 'random').mockRestore();
    });
});
