import type { Flower, SimulationParams, Grid, Coord } from '../../types';
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
    createNewFlower: (x: number, y: number, genome?: string, parentGenome2?: string) => Promise<Flower | null>;
}

export const processFlowerTick = (
    flower: Flower,
    context: FlowerContext,
    newFlowerPromises: Promise<Flower | null>[],
    newFlowerPositions: Coord[]
) => {
    const { params, grid, createNewFlower } = context;
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
        // 1. Proximity & Expansion
        neighborVectors
            .map(([dx, dy]) => ({ x: flower.x + dx, y: flower.y + dy }))
            .filter(p => p.x >= 0 && p.x < gridWidth && p.y >= 0 && p.y < gridHeight)
            .forEach(n => {
                const neighborCell = grid[n.y][n.x];
                const neighborFlower = neighborCell.find(c => c.type === 'flower') as Flower | undefined;
                const isSuitableForSpawn = neighborCell.length === 0 || neighborCell.every(c => c.type === 'egg' || c.type === 'nutrient');

                if (isSuitableForSpawn && Math.random() < FLOWER_EXPANSION_CHANCE) {
                    newFlowerPromises.push(createNewFlower(n.x, n.y, flower.genome));
                    newFlowerPositions.push(n);
                } else if (neighborFlower?.isMature && Math.random() < PROXIMITY_POLLINATION_CHANCE) {
                    const spawnSpot = findCellForFlowerSpawn(grid, params, n);
                    if (spawnSpot) {
                        newFlowerPromises.push(createNewFlower(spawnSpot.x, spawnSpot.y, flower.genome, neighborFlower.genome));
                        newFlowerPositions.push(spawnSpot);
                    }
                }
            });

        // 2. Wind Pollination
        if (Math.random() < WIND_POLLINATION_CHANCE) {
            const { dx, dy } = windVectors[windDirection];
            for (let i = 1; i <= windStrength; i++) {
                const targetX = flower.x + i * dx;
                const targetY = flower.y + i * dy;
                if (targetX < 0 || targetX >= gridWidth || targetY < 0 || targetY >= gridHeight) break;
                
                const targetFlower = grid[targetY][targetX]?.find(c => c.type === 'flower') as Flower | undefined;
                if (targetFlower?.isMature) {
                    const spawnSpot = findCellForFlowerSpawn(grid, params, {x: targetX, y: targetY});
                    if (spawnSpot) {
                         newFlowerPromises.push(createNewFlower(spawnSpot.x, spawnSpot.y, flower.genome, targetFlower.genome));
                         newFlowerPositions.push(spawnSpot);
                    }
                    break;
                }
                if (grid[targetY][targetX]?.length > 0) break;
            }
        }
    }
};
