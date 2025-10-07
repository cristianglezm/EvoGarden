import type { PheromoneTrail, CellContent, SimulationParams } from '../../types';

interface PheromoneTrailContext {
    nextActorState: Map<string, CellContent>;
    params: SimulationParams;
}

export const processPheromoneTrailTick = (trail: PheromoneTrail, context: PheromoneTrailContext) => {
    const { nextActorState, params } = context;
    
    trail.lifespan--;
    trail.strength -= params.pheromoneStrengthDecay;
    
    if (trail.lifespan <= 0 || trail.strength <= 0) {
        nextActorState.delete(trail.id);
    }
    
    if (trail.signal) {
        trail.signal.ttl--;
        if (trail.signal.ttl <= 0) {
            trail.signal = undefined;
        }
    }
};