import type { SpiderWeb, Insect, SimulationParams, CellContent, AppEvent } from '../../types';
import { INSECT_DATA } from '../../constants';

interface SpiderWebContext {
    nextActorState: Map<string, CellContent>;
    events: AppEvent[];
    params: SimulationParams;
}

const FLYING_INSECTS = ['🦋', '🐞', '🐝'];

export const processSpiderWebTick = (web: SpiderWeb, context: SpiderWebContext) => {
    const { nextActorState, events, params } = context;

    web.lifespan--;
    if (web.lifespan <= 0) {
        nextActorState.delete(web.id);
        const owner = nextActorState.get(web.ownerId) as Insect | undefined;
        if (owner && owner.webs) {
            owner.webs = owner.webs.filter(id => id !== web.id);
        }
        return;
    }

    if (web.trappedActorId) {
        const trappedInsect = nextActorState.get(web.trappedActorId) as Insect | undefined;
        if (!trappedInsect) {
            web.trappedActorId = null; // Prey is gone
            return;
        }

        // Escape attempt
        const insectStats = INSECT_DATA.get(trappedInsect.emoji);
        if (insectStats) {
            const escapeChance = (insectStats.attack / web.strength) * params.spiderEscapeChanceModifier;
            if (Math.random() < escapeChance) {
                // Escape successful
                web.strength -= insectStats.attack;
                trappedInsect.isTrapped = false;
                web.trappedActorId = null;
                events.push({ message: `🕸️ A ${trappedInsect.emoji} escaped from a web!`, type: 'info', importance: 'low' });

                if (web.strength <= 0) {
                    nextActorState.delete(web.id);
                     const owner = nextActorState.get(web.ownerId) as Insect | undefined;
                    if (owner && owner.webs) {
                        owner.webs = owner.webs.filter(id => id !== web.id);
                    }
                }
            } else {
                // Failed escape, lose stamina
                trappedInsect.stamina = Math.max(0, trappedInsect.stamina - 1);
            }
        }
    } else {
        // Try to trap a new insect
        const actorsOnCell = Array.from(nextActorState.values()).filter(a => a.x === web.x && a.y === web.y);
        const potentialPrey = actorsOnCell.find(a => 
            (a.type === 'insect' && !FLYING_INSECTS.includes((a as Insect).emoji) && a.id !== web.ownerId) || 
            a.type === 'cockroach'
        ) as Insect | undefined;

        if (potentialPrey && !potentialPrey.isTrapped && Math.random() < params.spiderWebTrapChance) {
            potentialPrey.isTrapped = true;
            web.trappedActorId = potentialPrey.id;
            events.push({ message: `🕸️ A ${potentialPrey.emoji} got trapped in a web!`, type: 'info', importance: 'low' });
        }
    }
};