import type { HerbicidePlane, HerbicideSmoke, CellContent, Grid, SimulationParams } from '../../types';

export interface HerbicidePlaneContext {
    grid: Grid;
    params: SimulationParams;
    nextActorState: Map<string, CellContent>;
    getNextId: (type: string, x: number, y: number) => string;
}

export const processHerbicidePlaneTick = (plane: HerbicidePlane, context: HerbicidePlaneContext) => {
    const { nextActorState, params, getNextId } = context;
    const { gridWidth, gridHeight, herbicideSmokeLifespan } = params;
    const { x, y, dx, dy, turnDx, turnDy } = plane;

    // 1. Drop smoke at current location
    const smokeId = getNextId('smoke', x, y);
    const newSmoke: HerbicideSmoke = {
        id: smokeId,
        type: 'herbicideSmoke',
        x,
        y,
        lifespan: herbicideSmokeLifespan,
        canBeExpanded: params.herbicideSmokeExpansionCount,
    };
    // Add smoke only if the cell doesn't have one already to avoid stacking
    if (!Array.from(nextActorState.values()).some(a => a.x === x && a.y === y && a.type === 'herbicideSmoke')) {
        nextActorState.set(smokeId, newSmoke);
    }
    
    // 2. Calculate next position
    let newX = x + dx;
    let newY = y + dy;

    // 3. Check for boundary collision to trigger a turn
    if (newX < 0 || newX >= gridWidth || newY < 0 || newY >= gridHeight) {
        // We've hit a wall, time to turn.
        newX = x + turnDx;
        newY = y + turnDy;

        // Reverse primary direction for the next sweep.
        plane.dx = -dx;
        plane.dy = -dy;
    }
    
    // 4. Update plane position
    plane.x = newX;
    plane.y = newY;

    // 5. Check if plane has moved off the grid completely after a turn
    if (plane.x < 0 || plane.x >= gridWidth || plane.y < 0 || plane.y >= gridHeight) {
        nextActorState.delete(plane.id);
    }
};