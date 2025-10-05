import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SnailBehavior } from './SnailBehavior';
import type { Insect, Flower, CellContent, SimulationParams, AppEvent, SlimeTrail, Grid } from '../../../types';
import { Quadtree, Rectangle } from '../../Quadtree';
import { 
    INSECT_DATA, 
    DEFAULT_SIM_PARAMS, 
    SNAIL_MOVE_COOLDOWN,
    SLIME_TRAIL_LIFESPAN,
    FLOWER_STAT_INDICES,
    INSECT_WANDER_CHANCE,
} from '../../../constants';
import { AsyncFlowerFactory } from '../../asyncFlowerFactory';

const SNAIL_DATA = INSECT_DATA.get('🐌')!;

vi.mock('../../asyncFlowerFactory');

describe('SnailBehavior', () => {
    let behavior: SnailBehavior;
    let snail: Insect;
    let nextActorState: Map<string, CellContent>;
    let flowerQtree: Quadtree<CellContent>;
    let events: AppEvent[];
    let newActorQueue: CellContent[];
    let grid: Grid;
    const params: SimulationParams = { ...DEFAULT_SIM_PARAMS, gridWidth: 20, gridHeight: 20 };
    
    const createMockFlower = (id: string, x: number, y: number, health: number = 100): Flower => ({
        id, type: 'flower', x, y, health, maxHealth: 100,
        genome: 'g1', imageData: '', stamina: 100, maxStamina: 100,
        age: 51, isMature: true, maturationPeriod: 50, nutrientEfficiency: 1.0, sex: 'both',
        minTemperature: 10, maxTemperature: 30, toxicityRate: 0.0,
        effects: { vitality: 1, agility: 1, strength: 1, intelligence: 1, luck: 1 }
    });

    beforeEach(() => {
        behavior = new SnailBehavior();
        snail = {
            id: 'snail1', type: 'insect', x: 10, y: 10, emoji: '🐌', pollen: null, 
            genome: Array(Object.keys(FLOWER_STAT_INDICES).length).fill(1),
            health: SNAIL_DATA.maxHealth, maxHealth: SNAIL_DATA.maxHealth,
            stamina: SNAIL_DATA.maxStamina, maxStamina: SNAIL_DATA.maxStamina,
            moveCooldown: 0,
        };
        grid = Array.from({ length: params.gridHeight }, () => Array.from({ length: params.gridWidth }, () => []));
        grid[snail.y][snail.x].push(snail);
        nextActorState = new Map();
        nextActorState.set(snail.id, snail);
        const boundary = new Rectangle(params.gridWidth / 2, params.gridHeight / 2, params.gridWidth / 2, params.gridHeight / 2);
        flowerQtree = new Quadtree(boundary, 4);
        events = [];
        newActorQueue = [];
    });
    
    const setupContext = (): any => ({
        params,
        flowerQtree,
        nextActorState,
        events,
        newActorQueue,
        grid,
        qtree: new Quadtree(new Rectangle(10, 10, 10, 10), 4),
        asyncFlowerFactory: new (AsyncFlowerFactory as any)(),
        incrementInsectsDiedOfOldAge: vi.fn(),
        currentTemperature: params.temperature,
    });

    it('should not move if its moveCooldown is greater than 0', () => {
        snail.moveCooldown = 1;
        const initialX = snail.x;
        const initialY = snail.y;
        
        behavior.update(snail, setupContext());

        expect(snail.x).toBe(initialX);
        expect(snail.y).toBe(initialY);
        expect(snail.moveCooldown).toBe(0);
        expect(newActorQueue.length).toBe(0); // No slime trail
    });

    it('should move, reset its cooldown, and leave a slime trail when cooldown is 0', () => {
        const flower = createMockFlower('f1', 12, 12);
        nextActorState.set(flower.id, flower);
        flowerQtree.insert({ x: flower.x, y: flower.y, data: flower });
        const initialX = snail.x;
        const initialY = snail.y;

        behavior.update(snail, setupContext());

        // Moves 1 step (speed is 1) towards (12,12) -> (11,11)
        expect(snail.x).toBe(11);
        expect(snail.y).toBe(11);
        expect(snail.moveCooldown).toBe(SNAIL_MOVE_COOLDOWN);
        
        expect(newActorQueue.length).toBe(1);
        const slimeTrail = newActorQueue[0] as SlimeTrail;
        expect(slimeTrail.type).toBe('slimeTrail');
        expect(slimeTrail.x).toBe(initialX);
        expect(slimeTrail.y).toBe(initialY);
        expect(slimeTrail.lifespan).toBe(SLIME_TRAIL_LIFESPAN);
    });

    it('should eat a flower on the same cell', () => {
        const flower = createMockFlower('f1', 10, 10);
        nextActorState.set(flower.id, flower);
        const initialFlowerHealth = flower.health;
        
        behavior.update(snail, setupContext());

        const updatedFlower = nextActorState.get('f1') as Flower;
        expect(updatedFlower.health).toBe(initialFlowerHealth - SNAIL_DATA.attack);
    });
    
    it('should not be slowed down by slime trails', () => {
        // This logic is tested in the base class, but we can verify the snail's immunity here.
        const context = setupContext();
        const slimeTrail: SlimeTrail = { id: 's1', type: 'slimeTrail', x: 10, y: 10, lifespan: 10 };
        context.grid[10][10] = [slimeTrail, snail];
        
        const flower = createMockFlower('f1', 12, 12);
        nextActorState.set(flower.id, flower);
        flowerQtree.insert({ x: flower.x, y: flower.y, data: flower });

        // The moveTowards method in the base class should see the snail emoji and not apply the slow factor.
        // It moves from (10,10) towards (12,12). Speed is 1. Should move to (11,11).
        // If it were slowed, speed would be 0.5, and it might not move a full cell.
        
        // Mock random to ensure the snail targets the flower instead of wandering
        const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(INSECT_WANDER_CHANCE + 0.1);

        behavior.update(snail, context);

        expect(snail.x).toBe(11);
        expect(snail.y).toBe(11);
        
        randomSpy.mockRestore();
    });

    it('should wander, reset cooldown, and leave slime if no flower is found', () => {
        const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0); // Make wander deterministic
        const initialX = snail.x;
        const initialY = snail.y;

        // No flowers in the qtree
        behavior.update(snail, setupContext());

        const moved = snail.x !== initialX || snail.y !== initialY;
        expect(moved, "Snail should have moved from its initial position.").toBe(true);
        
        // Check it's a valid neighbor
        const dx = Math.abs(snail.x - initialX);
        const dy = Math.abs(snail.y - initialY);
        expect(dx).toBeLessThanOrEqual(1);
        expect(dy).toBeLessThanOrEqual(1);

        // Cooldown should be reset
        expect(snail.moveCooldown).toBe(SNAIL_MOVE_COOLDOWN);
        
        // Slime trail should be created at the old position
        expect(newActorQueue.length).toBe(1);
        const slimeTrail = newActorQueue[0] as SlimeTrail;
        expect(slimeTrail.type).toBe('slimeTrail');
        expect(slimeTrail.x).toBe(initialX);
        expect(slimeTrail.y).toBe(initialY);

        randomSpy.mockRestore();
    });
});
