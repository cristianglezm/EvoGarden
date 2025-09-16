import type { Egg, CellContent, Insect, ToastMessage, SimulationParams } from '../../types';
import { INSECT_LIFESPAN } from '../../constants';

interface EggContext {
    nextActorState: Map<string, CellContent>;
    toasts: Omit<ToastMessage, 'id'>[];
    incrementInsectsBorn: () => void;
    params: SimulationParams;
}

export const processEggTick = (egg: Egg, context: EggContext) => {
    const { nextActorState, toasts, incrementInsectsBorn, params } = context;
    
    egg.hatchTimer--;
    if (egg.hatchTimer <= 0) {
        nextActorState.delete(egg.id);
        const newInsectId = `insect-${egg.x}-${egg.y}-${Date.now()}`;
        const newInsect: Insect = {
            id: newInsectId,
            type: 'insect',
            x: egg.x,
            y: egg.y,
            pollen: null,
            emoji: egg.insectEmoji,
            lifespan: INSECT_LIFESPAN,
        };
        // Check if cell is occupied by bird before hatching
        const isOccupiedByBird = Array.from(nextActorState.values()).some(a => a.x === egg.x && a.y === egg.y && a.type === 'bird');
        if (!isOccupiedByBird) {
             nextActorState.set(newInsectId, newInsect);
             if (params.toastsEnabled) {
                toasts.push({ message: '🐣 An insect has hatched!', type: 'success' });
             }
             incrementInsectsBorn();
        }
    }
};
