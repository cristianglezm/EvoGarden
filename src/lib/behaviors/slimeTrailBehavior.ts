import type { SlimeTrail, CellContent } from '../../types';

interface SlimeTrailContext {
    nextActorState: Map<string, CellContent>;
}

export const processSlimeTrailTick = (slimeTrail: SlimeTrail, context: SlimeTrailContext) => {
    const { nextActorState } = context;
    
    slimeTrail.lifespan--;
    if (slimeTrail.lifespan <= 0) {
        nextActorState.delete(slimeTrail.id);
    }
};
