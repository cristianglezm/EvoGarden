import type { Flower, SimulationParams, Grid, FlowerSeed, CellContent } from '../../types';
import { 
    FLOWER_TICK_COST_MULTIPLIER, 
    FLOWER_STAMINA_COST_PER_TICK, 
    FLOWER_HEALTH_COST_PER_TICK,
    PROXIMITY_POLLINATION_CHANCE,
    FLOWER_EXPANSION_CHANCE,
    WIND_POLLINATION_CHANCE
} from '../../constants';
import { findCellForFlowerSpawn, neighborVectors, windVectors } from '../simulationUtils';

export interface FlowerContext {
    params: SimulationParams;
    grid: Grid; // The original grid from the start of the tick
    requestNewFlower: (x: number, y: number, genome?: string, parentGenome2?: string) => FlowerSeed | null;
}

export const processFlowerTick = (
    flower: Flower,
    context: FlowerContext,
    newActorQueue: CellContent[]
) => {
    const { params, grid, requestNewFlower } = context;
    const { gridWidth, gridHeight, windDirection, windStrength } = params;

    flower.age++;
    if (flower.age > flower.maturationPeriod) {
        flower.isMature = true;
    }

    const staminaCost = FLOWER_STAMINA_COST_PER_TICK * FLOWER_TICK_COST_MULTIPLIER;
    const healthCost = FLOWER_HEALTH_COST_PER_TICK * FLOWER_TICK_COST_MULTIPLIER;

    if (flower.stamina > 0) {
        flower.stamina -= staminaCost;
    } else {
        flower.health -= healthCost;
    }

    if (flower.health <= 0) {
        // The engine will handle deletion by checking nextActorState map
        return; 
    }
    
    // Reproduction and expansion
    if (flower.isMature) {
        let hasReproducedThisTick = false;
        
        // 1. Proximity & Expansion
        const neighbors = neighborVectors
            .map(([dx, dy]) => ({ x: flower.x + dx, y: flower.y + dy }))
            .filter(p => p.x >= 0 && p.x < gridWidth && p.y >= 0 && p.y < gridHeight)
            .sort(() => 0.5 - Math.random()); // Shuffle to give all neighbors a fair chance

        for (const n of neighbors) {
            if (hasReproducedThisTick) break;

            const neighborCell = grid[n.y][n.x];
            const neighborFlower = neighborCell.find(c => c.type === 'flower') as Flower | undefined;
            const isSuitableForSpawn = neighborCell.length === 0 || neighborCell.every(c => c.type === 'egg' || c.type === 'nutrient' || c.type === 'flowerSeed');

            if (isSuitableForSpawn && Math.random() < FLOWER_EXPANSION_CHANCE) {
                const seed = requestNewFlower(n.x, n.y, flower.genome);
                if (seed) {
                    newActorQueue.push(seed);
                    hasReproducedThisTick = true;
                }
            } else if (neighborFlower?.isMature && Math.random() < PROXIMITY_POLLINATION_CHANCE) {
                const spawnSpot = findCellForFlowerSpawn(grid, params, n);
                if (spawnSpot) {
                    const seed = requestNewFlower(spawnSpot.x, spawnSpot.y, flower.genome, neighborFlower.genome);
                    if (seed) {
                        newActorQueue.push(seed);
                        hasReproducedThisTick = true;
                    }
                }
            }
        }

        // 2. Wind Pollination
        if (!hasReproducedThisTick && Math.random() < WIND_POLLINATION_CHANCE) {
            const { dx, dy } = windVectors[windDirection];
            for (let i = 1; i <= windStrength; i++) {
                const targetX = flower.x + i * dx;
                const targetY = flower.y + i * dy;
                if (targetX < 0 || targetX >= gridWidth || targetY < 0 || targetY >= gridHeight) break;
                
                const targetFlower = grid[targetY][targetX]?.find(c => c.type === 'flower') as Flower | undefined;
                if (targetFlower?.isMature) {
                    const spawnSpot = findCellForFlowerSpawn(grid, params, {x: targetX, y: targetY});
                    if (spawnSpot) {
                         const seed = requestNewFlower(spawnSpot.x, spawnSpot.y, flower.genome, targetFlower.genome);
                         if(seed) {
                            newActorQueue.push(seed);
                            // hasReproducedThisTick = true; // Not strictly needed as it's the last check
                         }
                    }
                    break;
                }
                if (grid[targetY][targetX]?.length > 0) break;
            }
        }
    }
};
