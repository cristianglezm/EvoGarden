import type { Corpse, CellContent, Nutrient } from '../../types';
import { NUTRIENT_FROM_OLD_AGE_LIFESPAN } from '../../constants';

interface CorpseContext {
    nextActorState: Map<string, CellContent>;
}

export const processCorpseTick = (corpse: Corpse, context: CorpseContext) => {
    const { nextActorState } = context;
    
    corpse.decayTimer--;
    if (corpse.decayTimer <= 0) {
        nextActorState.delete(corpse.id);
        // Create a nutrient in its place
        const nutrientId = `nutrient-${corpse.x}-${corpse.y}-${Date.now()}`;
        const nutrient: Nutrient = { 
            id: nutrientId, 
            type: 'nutrient', 
            x: corpse.x, 
            y: corpse.y, 
            lifespan: NUTRIENT_FROM_OLD_AGE_LIFESPAN 
        };
        nextActorState.set(nutrientId, nutrient);
    }
};
