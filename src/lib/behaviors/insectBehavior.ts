import type { Insect, SimulationParams, Grid, Flower, CellContent, Coord, Nutrient, AppEvent } from '../../types';
import { INSECT_DAMAGE_TO_FLOWER, INSECT_POLLINATION_CHANCE, NUTRIENT_FROM_OLD_AGE_LIFESPAN } from '../../constants';
import { findCellForFlowerSpawn } from '../simulationUtils';
import { Quadtree, Rectangle } from '../Quadtree';

const INSECT_VISION_RANGE = 5;
const INSECT_WANDER_CHANCE = 0.2; // 20% chance to wander even if a target is found

export interface InsectContext {
    params: SimulationParams;
    grid: Grid; // The original grid from the start of the tick
    nextActorState: Map<string, CellContent>;
    createNewFlower: (x: number, y: number, genome?: string, parentGenome2?: string) => Promise<Flower | null>;
    flowerQtree: Quadtree<CellContent>;
    events: AppEvent[];
    incrementInsectsDiedOfOldAge: () => void;
}

export const processInsectTick = (
    insect: Insect,
    context: InsectContext,
    newFlowerPromises: Promise<Flower | null>[],
    newFlowerPositions: Coord[]
) => {
    const { params, grid, nextActorState, createNewFlower, flowerQtree, events, incrementInsectsDiedOfOldAge } = context;
    const { gridWidth, gridHeight } = params;
    
    // 1. Lifecycle: Check for death from old age
    insect.lifespan--;
    if (insect.lifespan <= 0) {
        nextActorState.delete(insect.id);
        const nutrientId = `nutrient-${insect.x}-${insect.y}-${Date.now()}`;
        const nutrient: Nutrient = { id: nutrientId, type: 'nutrient', x: insect.x, y: insect.y, lifespan: NUTRIENT_FROM_OLD_AGE_LIFESPAN };
        nextActorState.set(nutrientId, nutrient);
        events.push({ message: '💀 An insect died of old age.', type: 'info', importance: 'low' });
        incrementInsectsDiedOfOldAge();
        return; // End tick processing for this insect
    }

    const { x, y } = insect;
    let target: Coord | null = null;
    let newX = x;
    let newY = y;
    let movedDeterministically = false;

    // 2. Find a target flower using the Quadtree
    const vision = new Rectangle(x, y, INSECT_VISION_RANGE, INSECT_VISION_RANGE);
    const nearbyFlowers = flowerQtree.query(vision)
        .map(p => p.data as Flower)
        .filter(f => f.x !== insect.x || f.y !== insect.y); // Exclude the flower at the current position

    if (nearbyFlowers.length > 0) {
        const closestFlower = nearbyFlowers.reduce((closest, flower) => {
            const dist = Math.hypot(x - flower.x, y - flower.y);
            return (dist < closest.dist) ? { flower, dist } : closest;
        }, { flower: null as Flower | null, dist: Infinity }).flower;
        
        if (closestFlower) {
            target = { x: closestFlower.x, y: closestFlower.y };
        }
    }

    // 3. Move towards target if one is found and not wandering
    if (target && Math.random() > INSECT_WANDER_CHANCE) {
        const dx = Math.sign(target.x - x);
        const dy = Math.sign(target.y - y);
        const potentialX = x + dx;
        const potentialY = y + dy;
        // Check if the target cell is valid and not occupied by a bird
        if (potentialX >= 0 && potentialX < gridWidth && potentialY >= 0 && potentialY < gridHeight && !grid[potentialY][potentialX].some(c => c.type === 'bird')) {
            newX = potentialX;
            newY = potentialY;
            movedDeterministically = true;
        }
    } 
    
    // 4. Fallback to random movement if no target or wander chance met
    if (!movedDeterministically) {
        const moves = [[0,1], [0,-1], [1,0], [-1,0]].sort(() => Math.random() - 0.5);
        for (const [dx, dy] of moves) {
            const potentialX = x + dx; 
            const potentialY = y + dy;
            if (potentialX >= 0 && potentialX < gridWidth && potentialY >= 0 && potentialY < gridHeight && !grid[potentialY][potentialX].some(c => c.type ==='bird')) {
                newX = potentialX; 
                newY = potentialY;
                break;
            }
        }
    }
    
    insect.x = newX;
    insect.y = newY;
    
    // 5. Pollination logic (runs after movement is decided)
    const flower = grid[newY][newX].find(c => c.type === 'flower') as Flower | undefined;
    if (flower && nextActorState.has(flower.id)) {
         const nextFlower = nextActorState.get(flower.id) as Flower;
         nextFlower.health = Math.max(0, nextFlower.health - INSECT_DAMAGE_TO_FLOWER);
         
         if (insect.pollen && insect.pollen.sourceFlowerId !== flower.id && flower.isMature && Math.random() < INSECT_POLLINATION_CHANCE) {
             const spawnSpot = findCellForFlowerSpawn(grid, params, {x: newX, y: newY});
             if (spawnSpot) {
                 newFlowerPromises.push(createNewFlower(spawnSpot.x, spawnSpot.y, flower.genome, insect.pollen.genome));
                 newFlowerPositions.push(spawnSpot);
             }
         }
         insect.pollen = { genome: flower.genome, sourceFlowerId: flower.id };
    }
};
