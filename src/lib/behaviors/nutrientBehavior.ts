import type { Nutrient, CellContent } from '../../types';

interface NutrientContext {
    nextActorState: Map<string, CellContent>;
}

export const processNutrientTick = (nutrient: Nutrient, context: NutrientContext) => {
    const { nextActorState } = context;
    
    nutrient.lifespan--;
    if (nutrient.lifespan <= 0) {
        nextActorState.delete(nutrient.id);
    }
};
