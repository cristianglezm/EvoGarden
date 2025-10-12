import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SpiderBehavior } from './SpiderBehavior';
import type { Insect, Flower, CellContent, SimulationParams, SpiderWeb, Corpse } from '../../../types';
import { Quadtree, Rectangle } from '../../Quadtree';
import { 
    INSECT_DATA, 
    DEFAULT_SIM_PARAMS, 
    INSECT_HEALTH_DECAY_PER_TICK,
    FLOWER_STAT_INDICES,
} from '../../../constants';
import { AsyncFlowerFactory } from '../../asyncFlowerFactory';
import { SPIDER_HEAL_FROM_PREY } from '../../../constants';

const SPIDER_DATA = INSECT_DATA.get('🕷️')!;

vi.mock('../../asyncFlowerFactory');

describe('SpiderBehavior', () => {
    let behavior: SpiderBehavior;
    let spider: Insect;
    let nextActorState: Map<string, CellContent>;
    let qtree: Quadtree<CellContent>;
    let flowerQtree: Quadtree<CellContent>;
    let newActorQueue: CellContent[];
    const getNextId = vi.fn();
    const params: SimulationParams = { 
        ...DEFAULT_SIM_PARAMS, 
        gridWidth: 20, 
        gridHeight: 20,
        spiderMaxWebs: 3,
        spiderWebBuildCost: 25,
        spiderWebStamina: 100,
        spiderWebStaminaRegen: 0.5,
    };
    
    beforeEach(() => {
        behavior = new SpiderBehavior();
        spider = {
            id: 'spider1', type: 'insect', x: 10, y: 10, emoji: '🕷️', pollen: null, 
            genome: Array(Object.keys(FLOWER_STAT_INDICES).length).fill(1),
            health: SPIDER_DATA.maxHealth, maxHealth: SPIDER_DATA.maxHealth,
            stamina: SPIDER_DATA.maxStamina, maxStamina: SPIDER_DATA.maxStamina,
            webs: [],
            webStamina: params.spiderWebStamina,
            behaviorState: 'ambushing', // Use the new default/idle state
        };
        nextActorState = new Map();
        nextActorState.set(spider.id, spider);
        const boundary = new Rectangle(params.gridWidth / 2, params.gridHeight / 2, params.gridWidth / 2, params.gridHeight / 2);
        qtree = new Quadtree(boundary, 4);
        flowerQtree = new Quadtree(boundary, 4);
        newActorQueue = [];
        getNextId.mockClear().mockImplementation((type, x, y) => `${type}-${x}-${y}-${Math.random()}`);
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
        getNextId,
        claimedCellsThisTick: new Set<string>(),
    });

    it('should wander when ambushing with no webs and no good build spots', () => {
        const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0);
        const initialX = spider.x;
        const initialY = spider.y;
        
        spider.decisionCooldown = 0; // Force a decision
        
        behavior.update(spider, setupContext());
        
        const moved = spider.x !== initialX || spider.y !== initialY;
        expect(moved, "Spider should have moved from its initial position.").toBe(true);
        const dx = Math.abs(spider.x - initialX);
        const dy = Math.abs(spider.y - initialY);
        expect(dx).toBeLessThanOrEqual(1);
        expect(dy).toBeLessThanOrEqual(1);
        randomSpy.mockRestore();
    });

    it('should decide to build a web and execute it when on a good spot', () => {
        const flower: Flower = {
            id: 'f1', type: 'flower', x: 10, y: 10, health: 100, maxHealth: 100,
            genome: 'g1', imageData: '', stamina: 100, maxStamina: 100,
            age: 51, isMature: true, maturationPeriod: 50, nutrientEfficiency: 1.0, sex: 'both',
            minTemperature: 10, maxTemperature: 30, toxicityRate: 0.0,
            effects: { vitality: 1, agility: 1, strength: 1, intelligence: 1, luck: 1 }
        };
        spider.x = 10;
        spider.y = 10;
        spider.decisionCooldown = 0; // Force decision
        const context = setupContext();
        context.nextActorState.set(flower.id, flower);
        context.flowerQtree.insert({ x: flower.x, y: flower.y, data: flower });
        
        behavior.update(spider, context);

        expect(context.newActorQueue.length).toBe(1);
        const web = context.newActorQueue[0] as SpiderWeb;
        expect(web.type).toBe('spiderweb');
        expect(web.x).toBe(spider.x);
        expect(spider.webs).toContain(web.id);
        expect(spider.webStamina).toBe(params.spiderWebStamina - params.spiderWebBuildCost);
        expect(spider.behaviorState).toBe('ambushing'); // State after building
    });

    it('should switch to consuming when a trapped insect is detected', () => {
        const web: SpiderWeb = { id: 'web1', type: 'spiderweb', x: 5, y: 5, ownerId: spider.id, trappedActorId: 'prey1' } as SpiderWeb;
        spider.webs = [web.id];
        nextActorState.set(web.id, web);
        spider.behaviorState = 'ambushing';
        spider.decisionCooldown = 0; // Force decision
        
        behavior.update(spider, setupContext());

        expect(spider.behaviorState).toBe('consuming');
        expect(spider.targetId).toBe(web.id);
    });

    it('should move towards the web when consuming', () => {
        const web: SpiderWeb = { id: 'web1', type: 'spiderweb', x: 5, y: 5, ownerId: spider.id, trappedActorId: 'prey1' } as SpiderWeb;
        spider.webs = [web.id];
        nextActorState.set(web.id, web);
        spider.behaviorState = 'consuming';
        spider.targetId = web.id;
        spider.decisionCooldown = 1; // Prevent new decision, execute current state

        behavior.update(spider, setupContext());
        expect(spider.x).toBe(9);
        expect(spider.y).toBe(9);
    });

    it('should consume prey, create corpse, heal, and reset state', () => {
        const prey: Insect = { id: 'prey1', type: 'insect', x: 10, y: 10, emoji: '🐛' } as Insect;
        const web: SpiderWeb = { id: 'web1', type: 'spiderweb', x: 10, y: 10, ownerId: spider.id, trappedActorId: prey.id } as SpiderWeb;
        spider.webs = [web.id];
        spider.x = 10;
        spider.y = 10;
        spider.health = 50;
        spider.stamina = 50;
        nextActorState.set(web.id, web);
        nextActorState.set(prey.id, prey);
        spider.behaviorState = 'consuming';
        spider.targetId = web.id;
        const context = setupContext();
        
        // Set cooldown > 0 to ensure we only execute the current state
        spider.decisionCooldown = 1;

        behavior.update(spider, context);

        expect(nextActorState.has(prey.id)).toBe(false);
        const corpse = context.newActorQueue.find((a: CellContent) => a.type === 'corpse') as Corpse;
        expect(corpse).toBeDefined();
        expect(corpse.originalEmoji).toBe('🐛');

        expect(spider.health).toBeCloseTo(50 - INSECT_HEALTH_DECAY_PER_TICK + SPIDER_HEAL_FROM_PREY);
        expect(spider.stamina).toBe(Math.min(spider.maxStamina, 50 + SPIDER_HEAL_FROM_PREY));
        const updatedWeb = nextActorState.get(web.id) as SpiderWeb;
        expect(updatedWeb.trappedActorId).toBeNull();
        expect(spider.behaviorState).toBe('ambushing');
        expect(spider.targetId).toBeUndefined();
    });
});
