import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processSpiderWebTick } from './spiderWebBehavior';
import type { SpiderWeb, Insect, CellContent, SimulationParams, AppEvent } from '../../types';
import { INSECT_DATA, DEFAULT_SIM_PARAMS } from '../../constants';

describe('SpiderWebBehavior', () => {
    let web: SpiderWeb;
    let nextActorState: Map<string, CellContent>;
    let events: AppEvent[];
    const params: SimulationParams = { 
        ...DEFAULT_SIM_PARAMS, 
        spiderWebStrength: 20,
        spiderWebTrapChance: 1.0, // Guaranteed trap for testing
        spiderEscapeChanceModifier: 0.5,
    };
    
    beforeEach(() => {
        web = {
            id: 'web1', type: 'spiderweb', x: 5, y: 5, ownerId: 'spider1', 
            strength: params.spiderWebStrength, trappedActorId: null, lifespan: 100,
        };
        nextActorState = new Map();
        nextActorState.set(web.id, web);
        events = [];
    });
    
    const setupContext = (): any => ({
        params,
        nextActorState,
        events,
    });
    
    it('should decrement its lifespan', () => {
        processSpiderWebTick(web, setupContext());
        expect(web.lifespan).toBe(99);
    });

    it('should be removed when lifespan reaches zero', () => {
        const owner: Insect = { id: 'spider1', type: 'insect', emoji: '🕷️', webs: ['web1'] } as Insect;
        nextActorState.set(owner.id, owner);
        web.lifespan = 1;
        processSpiderWebTick(web, setupContext());
        expect(nextActorState.has(web.id)).toBe(false);
        expect(owner.webs).not.toContain('web1');
    });

    it('should trap a valid, non-flying insect on its cell', () => {
        const beetle: Insect = { 
            id: 'beetle1', type: 'insect', x: 5, y: 5, emoji: '🪲',
            isTrapped: false,
        } as Insect;
        nextActorState.set(beetle.id, beetle);
        
        processSpiderWebTick(web, setupContext());

        expect(web.trappedActorId).toBe(beetle.id);
        expect(beetle.isTrapped).toBe(true);
        expect(events.some(e => e.message.includes('got trapped'))).toBe(true);
    });
    
    it('should not trap a flying insect', () => {
        const butterfly: Insect = { 
            id: 'bfly1', type: 'insect', x: 5, y: 5, emoji: '🦋',
        } as Insect;
        nextActorState.set(butterfly.id, butterfly);
        
        processSpiderWebTick(web, setupContext());

        expect(web.trappedActorId).toBeNull();
    });

    it('should allow a trapped insect to escape if it is strong enough', () => {
        const beetleData = INSECT_DATA.get('🪲')!;
        const beetle: Insect = { 
            id: 'beetle1', type: 'insect', x: 5, y: 5, emoji: '🪲',
            stamina: beetleData.maxStamina, isTrapped: true
        } as Insect;
        web.trappedActorId = beetle.id;
        nextActorState.set(beetle.id, beetle);
        
        // Mock Math.random to guarantee escape
        // Escape chance = (1 / 20) * 0.5 = 0.025. We need random < 0.025.
        vi.spyOn(Math, 'random').mockReturnValue(0.01);

        processSpiderWebTick(web, setupContext());
        
        expect(web.trappedActorId).toBeNull();
        expect(beetle.isTrapped).toBe(false);
        expect(web.strength).toBe(params.spiderWebStrength - beetleData.attack);
        expect(events.some(e => e.message.includes('escaped'))).toBe(true);

        vi.spyOn(Math, 'random').mockRestore();
    });
    
    it('should reduce stamina of a trapped insect that fails to escape', () => {
        const beetleData = INSECT_DATA.get('🪲')!;
        const beetle: Insect = { 
            id: 'beetle1', type: 'insect', x: 5, y: 5, emoji: '🪲',
            stamina: beetleData.maxStamina, isTrapped: true
        } as Insect;
        web.trappedActorId = beetle.id;
        nextActorState.set(beetle.id, beetle);

        // Mock Math.random to guarantee escape failure
        vi.spyOn(Math, 'random').mockReturnValue(0.9);

        processSpiderWebTick(web, setupContext());

        expect(web.trappedActorId).toBe(beetle.id);
        expect(beetle.stamina).toBe(beetleData.maxStamina - 1);

        vi.spyOn(Math, 'random').mockRestore();
    });
});
