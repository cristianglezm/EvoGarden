import type { Cocoon, CellContent, Insect, AppEvent } from '../../types';
import { INSECT_DATA } from '../../constants';

interface CocoonContext {
    nextActorState: Map<string, CellContent>;
    events: AppEvent[];
}

export const processCocoonTick = (cocoon: Cocoon, context: CocoonContext) => {
    const { nextActorState, events } = context;
    
    cocoon.hatchTimer--;
    if (cocoon.hatchTimer <= 0) {
        nextActorState.delete(cocoon.id);
        
        const baseStats = INSECT_DATA.get('🦋');
        if (!baseStats) {
            console.error(`Could not find base stats for butterfly emoji: 🦋`);
            return;
        }

        const newButterflyId = `insect-${cocoon.x}-${cocoon.y}-${Date.now()}`;
        const newButterfly: Insect = {
            id: newButterflyId,
            type: 'insect',
            x: cocoon.x,
            y: cocoon.y,
            pollen: null,
            emoji: '🦋',
            genome: cocoon.butterflyGenome,
            health: baseStats.maxHealth,
            maxHealth: baseStats.maxHealth,
            stamina: baseStats.maxStamina,
            maxStamina: baseStats.maxStamina,
        };
        
        nextActorState.set(newButterflyId, newButterfly);
        events.push({ message: '🦋 A butterfly has emerged from its cocoon!', type: 'success', importance: 'low' });
    }
};
