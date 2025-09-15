import type { HerbicideSmoke, CellContent, Grid, SimulationParams, Flower } from '../../types';
import { neighborVectors } from '../simulationUtils';

export interface HerbicideSmokeContext {
    grid: Grid;
    params: SimulationParams;
    nextActorState: Map<string, CellContent>;
}

export const processHerbicideSmokeTick = (smoke: HerbicideSmoke, context: HerbicideSmokeContext) => {
    const { nextActorState, params } = context;
    const { gridWidth, gridHeight, herbicideDamage, herbicideSmokeLifespan } = params;

    // 1. Apply damage to flowers in the same cell
    const flowersInCell = Array.from(nextActorState.values())
        .filter(a => a.x === smoke.x && a.y === smoke.y && a.type === 'flower') as Flower[];
    
    for (const flower of flowersInCell) {
        flower.health = Math.max(0, flower.health - herbicideDamage);
    }

    // 2. Expand to neighbors if it hasn't already
    if (smoke.canBeExpanded > 0) {
        neighborVectors.forEach(([dx, dy]) => {
            const nx = smoke.x + dx;
            const ny = smoke.y + dy;

            if (nx >= 0 && nx < gridWidth && ny >= 0 && ny < gridHeight) {
                // Check if a smoke cloud already exists at the new position
                const alreadyExists = Array.from(nextActorState.values()).some(
                    (actor) => actor.x === nx && actor.y === ny && actor.type === 'herbicideSmoke'
                );

                if (!alreadyExists) {
                    const neighborSmokeId = `smoke-${nx}-${ny}-${Date.now()}`;
                    const newNeighborSmoke: HerbicideSmoke = {
                        id: neighborSmokeId,
                        type: 'herbicideSmoke',
                        x: nx,
                        y: ny,
                        lifespan: herbicideSmokeLifespan,
                        canBeExpanded: 0,
                    };
                    nextActorState.set(neighborSmokeId, newNeighborSmoke);
                }
            }
        });
        smoke.canBeExpanded--;
    }

    // 3. Decrement lifespan and remove if expired
    smoke.lifespan--;
    if (smoke.lifespan <= 0) {
        nextActorState.delete(smoke.id);
    }
};
