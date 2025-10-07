import type { Coord, Grid, SimulationParams, CellContent, WindDirection, Insect, Bird, PopulationTrend, Flower, Cockroach } from '../types';
import { POPULATION_TREND_WINDOW, FLOWER_STAT_INDICES } from '../constants';
import { Quadtree, Rectangle } from './Quadtree';

export const windVectors: Record<WindDirection, {dx: number, dy: number}> = {
    'N': {dx: 0, dy: -1}, 'NE': {dx: 1, dy: -1}, 'E': {dx: 1, dy: 0}, 'SE': {dx: 1, dy: 1},
    'S': {dx: 0, dy: 1}, 'SW': {dx: -1, dy: 1}, 'W': {dx: -1, dy: 0}, 'NW': {dx: -1, dy: -1},
};
export const neighborVectors = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];

export const getActorsOnCell = (qtree: Quadtree<CellContent>, nextActorState: Map<string, CellContent>, x: number, y: number): CellContent[] => {
    const range = new Rectangle(x + 0.5, y + 0.5, 0.5, 0.5); // Center on cell
    // The qtree is from the start of the tick. We must filter by nextActorState to get the current view.
    return qtree.query(range)
        .map(p => p.data)
        .filter(actor => {
            if (!actor || !nextActorState.has(actor.id)) return false;
            // The query can be imprecise, so double-check coordinates.
            const currentActor = nextActorState.get(actor.id)!;
            return currentActor.x === x && currentActor.y === y;
        });
};


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

export const findCellForFlowerSpawn = (grid: Grid, params: SimulationParams, origin?: Coord, claimedCells?: Set<string>): Coord | null => {
    const isSuitable = (cell: CellContent[], x: number, y: number) => 
        (!claimedCells || !claimedCells.has(`${x},${y}`)) &&
        (cell.length === 0 || cell.every(c => c.type === 'egg' || c.type === 'nutrient'));

    if(origin) {
        const suitableNeighbors = neighborVectors
            .map(([dx, dy]) => ({ x: origin.x + dx, y: origin.y + dy }))
            .filter(p => p.x >= 0 && p.x < params.gridWidth && p.y >= 0 && p.y < params.gridHeight && isSuitable(grid[p.y][p.x], p.x, p.y))
            .sort(() => 0.5 - Math.random());
        if (suitableNeighbors.length > 0) return suitableNeighbors[0];
    }
    
    const suitableCells: Coord[] = [];
    for (let y = 0; y < params.gridHeight; y++) {
        for (let x = 0; x < params.gridWidth; x++) {
            if (isSuitable(grid[y][x], x, y)) {
                suitableCells.push({ x, y });
            }
        }
    }

    if (suitableCells.length === 0) return null;
    return suitableCells[Math.floor(Math.random() * suitableCells.length)];
};

export const findCellForStationaryActor = (grid: Grid, params: SimulationParams, type: 'nutrient' | 'egg' | 'bird' | 'eagle' | 'cockroach', origin?: Coord, claimedCells?: Set<string>): Coord | null => {
    const isSuitable = (cell: CellContent[], x: number, y: number) =>
        (!claimedCells || !claimedCells.has(`${x},${y}`)) &&
        !cell.some(c => c.type === type);

    if (origin) {
        const validNeighbors = neighborVectors
            .map(([dx, dy]) => ({ x: origin.x + dx, y: origin.y + dy }))
            .filter(p => 
                p.x >= 0 && p.x < params.gridWidth && 
                p.y >= 0 && p.y < params.gridHeight && 
                isSuitable(grid[p.y][p.x], p.x, p.y)
            )
            .sort(() => 0.5 - Math.random());
        if (validNeighbors.length > 0) return validNeighbors[0];
    }

    const validCells: Coord[] = [];
    for (let y = 0; y < params.gridHeight; y++) {
        for (let x = 0; x < params.gridWidth; x++) {
            if (isSuitable(grid[y][x], x, y)) {
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
    if (actor.type === 'insect' && 'pollen' in newActor && newActor.pollen) {
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

export const calculatePopulationTrend = (history: number[], growthThreshold: number, declineThreshold: number): PopulationTrend => {
    if (history.length < POPULATION_TREND_WINDOW) {
        return 'stable';
    }

    const ratesOfChange: number[] = [];
    for (let i = 1; i < history.length; i++) {
        const oldVal = history[i - 1];
        const newVal = history[i];
        if (oldVal > 0) {
            ratesOfChange.push((newVal - oldVal) / oldVal);
        } else if (newVal > 0) {
            ratesOfChange.push(1.0); // Handle growth from zero
        } else {
            ratesOfChange.push(0); // No change from zero
        }
    }

    let weightedSum = 0;
    let totalWeight = 0;
    for (let i = 0; i < ratesOfChange.length; i++) {
        const weight = i + 1; // Simple linear weighting
        weightedSum += ratesOfChange[i] * weight;
        totalWeight += weight;
    }

    const weightedAvg = totalWeight > 0 ? weightedSum / totalWeight : 0;
    
    if (weightedAvg > growthThreshold) return 'growing';
    if (weightedAvg < -declineThreshold) return 'declining';
    return 'stable';
};

export const buildQuadtrees = (actors: CellContent[], params: { gridWidth: number, gridHeight: number }): { qtree: Quadtree<CellContent>, flowerQtree: Quadtree<CellContent> } => {
    const { gridWidth, gridHeight } = params;
    const boundary = new Rectangle(gridWidth / 2, gridHeight / 2, gridWidth / 2, gridHeight / 2);
    const qtree = new Quadtree<CellContent>(boundary, 4);
    const flowerQtree = new Quadtree<CellContent>(boundary, 4);
    
    for (const actor of actors) {
        qtree.insert({ x: actor.x, y: actor.y, data: actor });
        if (actor.type === 'flower') {
            flowerQtree.insert({ x: actor.x, y: actor.y, data: actor });
        }
    }
    return { qtree, flowerQtree };
};

export const scoreFlower = (insect: Insect | Cockroach, flower: Flower): number => {
    const genome = insect.genome;
    let score = 0;
    score += (flower.health / flower.maxHealth) * genome[FLOWER_STAT_INDICES.HEALTH];
    score += (flower.stamina / flower.maxStamina) * genome[FLOWER_STAT_INDICES.STAMINA];
    score += flower.toxicityRate * genome[FLOWER_STAT_INDICES.TOXICITY]; // Negative toxicity is healing, so a negative weight here is good
    score += flower.nutrientEfficiency * genome[FLOWER_STAT_INDICES.NUTRIENT_EFFICIENCY];
    score += flower.effects.vitality * genome[FLOWER_STAT_INDICES.VITALITY];
    score += flower.effects.agility * genome[FLOWER_STAT_INDICES.AGILITY];
    score += flower.effects.strength * genome[FLOWER_STAT_INDICES.STRENGTH];
    score += flower.effects.intelligence * genome[FLOWER_STAT_INDICES.INTELLIGENCE];
    score += flower.effects.luck * genome[FLOWER_STAT_INDICES.LUCK];
    // Add a small distance penalty to prefer closer flowers among equally good options
    const dist = Math.hypot(insect.x - flower.x, insect.y - flower.y);
    score -= dist * 0.1;

    return score;
};