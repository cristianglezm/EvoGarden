import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { processInsectTick } from './insectBehavior';
import type { Insect, Flower, Grid, CellContent, AppEvent, FlowerSeed } from '../../types';
import { Quadtree, Rectangle } from '../Quadtree';
import { DEFAULT_SIM_PARAMS, INSECT_HEALTH_DECAY_PER_TICK, INSECT_MOVE_COST, INSECT_ATTACK_COST, INSECT_STAMINA_REGEN_PER_TICK, INSECT_DATA, INSECT_HEAL_FROM_HEALING_FLOWER, TOXIC_FLOWER_THRESHOLD, INSECT_DAMAGE_FROM_TOXIC_FLOWER, FLOWER_STAT_INDICES, NUTRIENT_FROM_OLD_AGE_LIFESPAN, INSECT_DORMANCY_TEMP, INSECT_POLLINATION_CHANCE } from '../../constants';
import { AsyncFlowerFactory } from '../asyncFlowerFactory';

vi.mock('../asyncFlowerFactory');

describe('insectBehavior', () => {
    let insect: Insect;
    let grid: Grid;
    let nextActorState: Map<string, CellContent>;
    let flowerQtree: Quadtree<CellContent>;
    let mockAsyncFlowerFactory: AsyncFlowerFactory;
    let requestNewFlower: Mock;
    let events: AppEvent[];
    let newActorQueue: CellContent[];
    let incrementInsectsDiedOfOldAge: Mock;
    
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
        const baseStats = INSECT_DATA.get('🦋')!;
        insect = { 
            id: 'insect1', type: 'insect', x: 5, y: 5, pollen: null, emoji: '🦋', 
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

        flowerQtree = new Quadtree(new Rectangle(7.5, 7.5, 7.5, 7.5), 4);
        newActorQueue = [];
        events = [];
        incrementInsectsDiedOfOldAge = vi.fn();
    });
    
    const setupContext = () => ({
        grid,
        params: DEFAULT_SIM_PARAMS,
        nextActorState,
        asyncFlowerFactory: mockAsyncFlowerFactory,
        flowerQtree,
        events,
        incrementInsectsDiedOfOldAge,
        currentTemperature: DEFAULT_SIM_PARAMS.temperature,
    });

    it('should lose health and not move or attack if stamina is too low', () => {
        const initialHealth = insect.health;
        const initialStamina = INSECT_MOVE_COST - 1;
        insect.stamina = initialStamina;
        const initialX = insect.x;
        const initialY = insect.y;
        
        processInsectTick(insect, setupContext(), newActorQueue);
        
        expect(insect.health).toBe(initialHealth - INSECT_HEALTH_DECAY_PER_TICK);
        expect(insect.stamina).toBe(initialStamina + INSECT_STAMINA_REGEN_PER_TICK);
        expect(insect.x).toBe(initialX);
        expect(insect.y).toBe(initialY);
    });

    it('should move towards the flower with the highest genetic score', () => {
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

        processInsectTick(insect, setupContext(), newActorQueue);

        // Should move towards the healthy flower at (8,8)
        // Starts at (5,5), speed is 2. Moves 2 units along the vector: (5,5) -> (6.41, 6.41), which rounds to (6,6)
        expect(insect.x).toBe(6);
        expect(insect.y).toBe(6);
    });

    it('should attack a flower, lose stamina, gain health, and pick up pollen', () => {
        const flower = { ...mockFlower, x: 5, y: 5 }; // Place flower on same cell
        grid[5][5].push(flower);
        nextActorState.set(flower.id, flower);

        const initialHealth = insect.health;
        const initialStamina = insect.stamina;

        processInsectTick(insect, setupContext(), newActorQueue);
        
        const flowerState = nextActorState.get(flower.id) as Flower;
        const baseStats = INSECT_DATA.get(insect.emoji)!;
        const isCold = DEFAULT_SIM_PARAMS.temperature < INSECT_DORMANCY_TEMP;
        const attackCost = INSECT_ATTACK_COST * (isCold ? 2 : 1);
        const moveCost = INSECT_MOVE_COST * (isCold ? 2 : 1);

        expect(insect.stamina).toBe(initialStamina - attackCost - moveCost);
        expect(flowerState.health).toBe(flower.maxHealth - baseStats.attack);
        expect(insect.health).toBe(Math.min(insect.maxHealth, initialHealth - INSECT_HEALTH_DECAY_PER_TICK + (baseStats.attack * 0.5)));
        expect(insect.pollen).toEqual({ genome: flower.genome, sourceFlowerId: flower.id });
    });

    it('should be healed by a healing flower', () => {
        const healingFlower: Flower = { ...mockFlower, id: 'h-flower', x: 5, y: 5, toxicityRate: -0.5 };
        grid[5][5].push(healingFlower);
        nextActorState.set(healingFlower.id, healingFlower);
        
        const initialHealth = insect.health;
        processInsectTick(insect, setupContext(), newActorQueue);
        
        expect(insect.health).toBe(Math.min(insect.maxHealth, initialHealth - INSECT_HEALTH_DECAY_PER_TICK + INSECT_HEAL_FROM_HEALING_FLOWER));
    });
    
    it('should take damage from a toxic flower', () => {
        const toxicFlower: Flower = { ...mockFlower, id: 't-flower', x: 5, y: 5, toxicityRate: TOXIC_FLOWER_THRESHOLD + 0.1 };
        grid[5][5].push(toxicFlower);
        nextActorState.set(toxicFlower.id, toxicFlower);

        const initialHealth = insect.health;
        processInsectTick(insect, setupContext(), newActorQueue);

        expect(insect.health).toBe(initialHealth - INSECT_HEALTH_DECAY_PER_TICK - INSECT_DAMAGE_FROM_TOXIC_FLOWER);
    });

    it('should pollinate a different mature flower', () => {
        const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.3); // Ensures successful pollination check

        const targetFlower: Flower = { ...mockFlower, id: 'flower2', x: 5, y: 5, genome: 'g2', isMature: true };
        grid[5][5].push(targetFlower);
        nextActorState.set(targetFlower.id, targetFlower);
        
        insect.pollen = { genome: 'g1', sourceFlowerId: 'flower1' };
        
        const context = setupContext();
        processInsectTick(insect, context, newActorQueue);
        
        expect(requestNewFlower).toHaveBeenCalledTimes(1);
        expect(requestNewFlower).toHaveBeenCalledWith(context.nextActorState, expect.any(Number), expect.any(Number), 'g2', 'g1');
        expect(newActorQueue.length).toBe(1);

        randomSpy.mockRestore();
    });

    it('should die when health reaches zero, creating a nutrient', () => {
        insect.health = INSECT_HEALTH_DECAY_PER_TICK; // It will be 0 after decay
        
        processInsectTick(insect, setupContext(), newActorQueue);
        
        expect(nextActorState.has(insect.id)).toBe(false);
        
        const nutrient = Array.from(nextActorState.values()).find(a => a.type === 'nutrient');
        expect(nutrient).toBeDefined();
        expect(nutrient?.x).toBe(insect.x);
        expect(nutrient?.y).toBe(insect.y);
        expect((nutrient as any).lifespan).toBe(NUTRIENT_FROM_OLD_AGE_LIFESPAN);
        
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
        flowerQtree.insert({ x: targetFlower.x, y: targetFlower.y, data: targetFlower });

        // Insect is carrying pollen from the flower it's currently on
        insect.pollen = { genome: 'g1', sourceFlowerId: 'flower1' };

        processInsectTick(insect, setupContext(), newActorQueue);

        expect(requestNewFlower).not.toHaveBeenCalled();

        vi.spyOn(Math, 'random').mockRestore();
    });

    it('should not pollinate an immature flower', () => {
        vi.spyOn(Math, 'random').mockReturnValue(INSECT_POLLINATION_CHANCE / 2);
        
        // Place immature flower on the same cell
        const targetFlower: Flower = { ...mockFlower, id: 'flower2', x: 5, y: 5, genome: 'g2', isMature: false };
        grid[5][5].push(targetFlower);
        nextActorState.set(targetFlower.id, targetFlower);
        flowerQtree.insert({ x: targetFlower.x, y: targetFlower.y, data: targetFlower });

        // Insect has pollen from another flower
        insect.pollen = { genome: 'g1', sourceFlowerId: 'flower1' };

        processInsectTick(insect, setupContext(), newActorQueue);

        expect(requestNewFlower).not.toHaveBeenCalled();

        vi.spyOn(Math, 'random').mockRestore();
    });
});
