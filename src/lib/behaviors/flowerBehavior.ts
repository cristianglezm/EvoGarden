import type { Flower, SimulationParams, Grid, CellContent } from '../../types';
import { 
    FLOWER_TICK_COST_MULTIPLIER, 
    FLOWER_STAMINA_COST_PER_TICK, 
    FLOWER_HEALTH_COST_PER_TICK,
    PROXIMITY_POLLINATION_CHANCE,
    FLOWER_EXPANSION_CHANCE,
    WIND_POLLINATION_CHANCE
} from '../../constants';
import { findCellForFlowerSpawn, neighborVectors, windVectors } from '../simulationUtils';
import type { AsyncFlowerFactory } from '../asyncFlowerFactory';

export interface FlowerContext {
    params: SimulationParams;
    grid: Grid; // The original grid from the start of the tick
    asyncFlowerFactory: AsyncFlowerFactory;
    currentTemperature: number;
    nextActorState: Map<string, CellContent>;
}

export const processFlowerTick = (
    flower: Flower,
    context: FlowerContext,
    newActorQueue: CellContent[]
) => {
    const { params, grid, asyncFlowerFactory, currentTemperature, nextActorState } = context;
    const { gridWidth, gridHeight, windDirection, windStrength } = params;

    flower.age++;
    if (flower.age > flower.maturationPeriod) {
        flower.isMature = true;
    }

    let staminaCost = FLOWER_STAMINA_COST_PER_TICK * FLOWER_TICK_COST_MULTIPLIER;
    const healthCost = FLOWER_HEALTH_COST_PER_TICK * FLOWER_TICK_COST_MULTIPLIER;
    
    // Apply environmental stress
    if (currentTemperature < flower.minTemperature || currentTemperature > flower.maxTemperature) {
        staminaCost *= 2; // Double stamina cost if outside optimal temperature range
    }

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
        
        // 1. Asexual Expansion (one check per flower)
        if (Math.random() < FLOWER_EXPANSION_CHANCE) {
            const suitableNeighbors = neighborVectors
                .map(([dx, dy]) => ({ x: flower.x + dx, y: flower.y + dy }))
                .filter(p => {
                    if (p.x < 0 || p.x >= gridWidth || p.y < 0 || p.y >= gridHeight) return false;
                    const cell = grid[p.y][p.x];
                    return cell.length === 0 || cell.every(c => c.type === 'egg' || c.type === 'nutrient' || c.type === 'flowerSeed');
                })
                .sort(() => 0.5 - Math.random());

            if (suitableNeighbors.length > 0) {
                const spawnSpot = suitableNeighbors[0];
                const seed = asyncFlowerFactory.requestNewFlower(nextActorState, spawnSpot.x, spawnSpot.y, flower.genome);
                if (seed) {
                    newActorQueue.push(seed);
                    hasReproducedThisTick = true;
                }
            }
        }

        // 2. Proximity Pollination (one check per flower)
        if (!hasReproducedThisTick && Math.random() < PROXIMITY_POLLINATION_CHANCE) {
            const matureNeighbors = neighborVectors
                .map(([dx, dy]) => grid[flower.y + dy]?.[flower.x + dx]?.find(c => c.type === 'flower') as Flower | undefined)
                .filter((f): f is Flower => !!f && f.isMature)
                .sort(() => 0.5 - Math.random());

            if (matureNeighbors.length > 0) {
                const partner = matureNeighbors[0];
                const spawnSpot = findCellForFlowerSpawn(grid, params, { x: partner.x, y: partner.y });
                if (spawnSpot) {
                    const seed = asyncFlowerFactory.requestNewFlower(nextActorState, spawnSpot.x, spawnSpot.y, flower.genome, partner.genome);
                    if (seed) {
                        newActorQueue.push(seed);
                        hasReproducedThisTick = true;
                    }
                }
            }
        }

        // 3. Wind Pollination (one check per flower)
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
                         const seed = asyncFlowerFactory.requestNewFlower(nextActorState, spawnSpot.x, spawnSpot.y, flower.genome, targetFlower.genome);
                         if(seed) {
                            newActorQueue.push(seed);
                         }
                    }
                    break; // Stop after first potential pollination
                }
                // Stop if wind path is blocked
                if (grid[targetY][targetX]?.length > 0) break;
            }
        }
    }
};
