import type { Coord, Grid, SimulationParams, CellContent, WindDirection, Insect, Bird } from '../types';

export const windVectors: Record<WindDirection, {dx: number, dy: number}> = {
    'N': {dx: 0, dy: -1}, 'NE': {dx: 1, dy: -1}, 'E': {dx: 1, dy: 0}, 'SE': {dx: 1, dy: 1},
    'S': {dx: 0, dy: 1}, 'SW': {dx: -1, dy: 1}, 'W': {dx: -1, dy: 0}, 'NW': {dx: -1, dy: -1},
};
export const neighborVectors = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];

export const findEmptyCell = (grid: Grid, params: SimulationParams, origin?: Coord): Coord | null => {
    if(origin) {
        const emptyNeighbors = neighborVectors
            .map(([dx, dy]) => ({ x: origin.x + dx, y: origin.y + dy }))
            .filter(p => p.x >= 0 && p.x < params.gridWidth && p.y >= 0 && p.y < params.gridHeight && grid[p.y][p.x].length === 0)
            .sort(() => 0.5 - Math.random());
        if (emptyNeighbors.length > 0) return emptyNeighbors[0];
    }
    
    // Fallback to find any empty cell on the grid
    const emptyCells: Coord[] = [];
    for (let y = 0; y < params.gridHeight; y++) {
        for (let x = 0; x < params.gridWidth; x++) {
            if (grid[y][x].length === 0) {
                emptyCells.push({ x, y });
            }
        }
    }
    if (emptyCells.length === 0) return null;
    return emptyCells[Math.floor(Math.random() * emptyCells.length)];
};

export const findCellForFlowerSpawn = (grid: Grid, params: SimulationParams, origin?: Coord): Coord | null => {
    const isSuitable = (cell: CellContent[]) => cell.length === 0 || cell.every(c => c.type === 'egg' || c.type === 'nutrient');

    if(origin) {
        const suitableNeighbors = neighborVectors
            .map(([dx, dy]) => ({ x: origin.x + dx, y: origin.y + dy }))
            .filter(p => p.x >= 0 && p.x < params.gridWidth && p.y >= 0 && p.y < params.gridHeight && isSuitable(grid[p.y][p.x]))
            .sort(() => 0.5 - Math.random());
        if (suitableNeighbors.length > 0) return suitableNeighbors[0];
    }
    
    const suitableCells: Coord[] = [];
    for (let y = 0; y < params.gridHeight; y++) {
        for (let x = 0; x < params.gridWidth; x++) {
            if (isSuitable(grid[y][x])) {
                suitableCells.push({ x, y });
            }
        }
    }

    if (suitableCells.length === 0) return null;
    return suitableCells[Math.floor(Math.random() * suitableCells.length)];
};

export const findCellForStationaryActor = (grid: Grid, params: SimulationParams, type: 'nutrient' | 'egg' | 'bird' | 'eagle', origin?: Coord): Coord | null => {
    if (origin) {
        const validNeighbors = neighborVectors
            .map(([dx, dy]) => ({ x: origin.x + dx, y: origin.y + dy }))
            .filter(p => 
                p.x >= 0 && p.x < params.gridWidth && 
                p.y >= 0 && p.y < params.gridHeight && 
                !grid[p.y][p.x].some(c => c.type === type)
            )
            .sort(() => 0.5 - Math.random());
        if (validNeighbors.length > 0) return validNeighbors[0];
    }

    const validCells: Coord[] = [];
    for (let y = 0; y < params.gridHeight; y++) {
        for (let x = 0; x < params.gridWidth; x++) {
            if (!grid[y][x].some(c => c.type === type)) {
                validCells.push({ x, y });
            }
        }
    }
    if (validCells.length === 0) return null;
    return validCells[Math.floor(Math.random() * validCells.length)];
};

/**
 * Creates a performance-optimized clone of an actor object.
 * This is much faster than `JSON.parse(JSON.stringify(actor))` because it avoids
 * serialization and only deep-copies nested objects that are known to be mutable.
 */
export const cloneActor = <T extends CellContent>(actor: T): T => {
    // Start with a shallow copy, which is very fast.
    const newActor = { ...actor };

    // If the actor is an insect and has pollen, deep-copy the pollen object.
    if ('pollen' in newActor && newActor.pollen) {
        newActor.pollen = { ...(newActor.pollen as NonNullable<Insect['pollen']>) };
    }
    
    // If the actor is a bird/eagle and has a target, deep-copy the target object.
    if ('target' in newActor && newActor.target) {
        newActor.target = { ...(newActor.target as NonNullable<Bird['target']>) };
    }

    // If the actor is a bird and has a patrol target, deep-copy it.
    if ('patrolTarget' in newActor && newActor.patrolTarget) {
        newActor.patrolTarget = { ...(newActor.patrolTarget as NonNullable<Bird['patrolTarget']>) };
    }

    return newActor;
};
