import type { TerritoryMark, CellContent } from '../../types';

interface TerritoryMarkContext {
    nextActorState: Map<string, CellContent>;
}

export const processTerritoryMarkTick = (mark: TerritoryMark, context: TerritoryMarkContext) => {
    const { nextActorState } = context;
    
    mark.lifespan--;
    if (mark.lifespan <= 0) {
        nextActorState.delete(mark.id);
    }
    
    // Signal TTL also decays each tick if it exists
    if (mark.signal) {
        mark.signal.ttl--;
        if (mark.signal.ttl <= 0) {
            mark.signal = undefined;
        }
    }
};