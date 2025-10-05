import type { Corpse, CellContent, Nutrient } from '../../types';
import { NUTRIENT_FROM_OLD_AGE_LIFESPAN } from '../../constants';

interface CorpseContext {
    nextActorState: Map<string, CellContent>;
    getNextId: (type: string, x: number, y: number) => string;
}

export const processCorpseTick = (corpse: Corpse, context: CorpseContext) => {
    const { nextActorState, getNextId } = context;
    
    corpse.decayTimer--;
    if (corpse.decayTimer <= 0) {
        nextActorState.delete(corpse.id);
        // Create a nutrient in its place
        const nutrientId = getNextId('nutrient', corpse.x, corpse.y);
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