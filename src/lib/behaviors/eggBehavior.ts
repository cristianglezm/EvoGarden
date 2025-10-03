import type { Egg, CellContent, Insect, AppEvent, SimulationParams } from '../../types';
import { INSECT_DATA } from '../../constants';
import { ACTOR_NAMES } from '../../utils';

interface EggContext {
    nextActorState: Map<string, CellContent>;
    events: AppEvent[];
    incrementInsectsBorn: () => void;
    params: SimulationParams;
}

export const processEggTick = (egg: Egg, context: EggContext) => {
    const { nextActorState, events, incrementInsectsBorn } = context;
    
    egg.hatchTimer--;
    if (egg.hatchTimer <= 0) {
        nextActorState.delete(egg.id);
        
        const baseStats = INSECT_DATA.get(egg.insectEmoji);
        if (!baseStats) {
            console.error(`Could not find base stats for emoji: ${egg.insectEmoji}`);
            return;
        }

        const typeName = (ACTOR_NAMES[egg.insectEmoji] || 'insect').toLowerCase();
        const newInsectId = `insect-${typeName}-${egg.x}-${egg.y}-${Date.now()}`;
        const newInsect: Insect = {
            id: newInsectId,
            type: 'insect',
            x: egg.x,
            y: egg.y,
            pollen: null,
            emoji: egg.insectEmoji,
            genome: egg.genome,
            health: baseStats.maxHealth,
            maxHealth: baseStats.maxHealth,
            stamina: baseStats.maxStamina,
            maxStamina: baseStats.maxStamina,
        };

        // Check if cell is occupied by bird before hatching
        const isOccupiedByBird = Array.from(nextActorState.values()).some(a => a.x === egg.x && a.y === egg.y && a.type === 'bird');
        if (!isOccupiedByBird) {
             nextActorState.set(newInsectId, newInsect);
             events.push({ message: '🐣 An insect has hatched!', type: 'success', importance: 'low' });
             incrementInsectsBorn();
        }
    }
};