import type { Insect, SimulationParams, Grid, Flower, CellContent, Nutrient, AppEvent, FlowerSeed } from '../../types';
import { INSECT_DAMAGE_TO_FLOWER, INSECT_POLLINATION_CHANCE, NUTRIENT_FROM_OLD_AGE_LIFESPAN, INSECT_DORMANCY_TEMP, TOXIC_FLOWER_THRESHOLD, INSECT_DAMAGE_FROM_TOXIC_FLOWER, INSECT_HEAL_FROM_HEALING_FLOWER } from '../../constants';
import { findCellForFlowerSpawn } from '../simulationUtils';
import { Quadtree, Rectangle } from '../Quadtree';

const INSECT_VISION_RANGE = 5;
const INSECT_WANDER_CHANCE = 0.2; // 20% chance to wander even if a target is found

export interface InsectContext {
    params: SimulationParams;
    grid: Grid; // The original grid from the start of the tick
    nextActorState: Map<string, CellContent>;
    requestNewFlower: (x: number, y: number, genome?: string, parentGenome2?: string) => FlowerSeed | null;
    flowerQtree: Quadtree<CellContent>;
    events: AppEvent[];
    incrementInsectsDiedOfOldAge: () => void;
    currentTemperature: number;
}

export const processInsectTick = (
    insect: Insect,
    context: InsectContext,
    newActorQueue: CellContent[]
) => {
    const { params, grid, nextActorState, requestNewFlower, flowerQtree, events, incrementInsectsDiedOfOldAge, currentTemperature } = context;
    const { gridWidth, gridHeight } = params;
    
    // Environmental Effect: Dormancy
    if (currentTemperature < INSECT_DORMANCY_TEMP) {
        return; // Insect is dormant and does nothing
    }

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
    
    // Decrement reproduction cooldown if it's active
    if (insect.reproductionCooldown && insect.reproductionCooldown > 0) {
        insect.reproductionCooldown--;
    }

    const { x, y } = insect;
    let target: { x: number, y: number } | null = null;
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
        
        if (nextFlower.toxicityRate < 0) {
            // Healing flower: heals the insect. Lifespan is a countdown, so adding to it extends life.
            insect.lifespan += INSECT_HEAL_FROM_HEALING_FLOWER;
        } else if (nextFlower.toxicityRate > TOXIC_FLOWER_THRESHOLD) {
            // Toxic/Carnivorous flower: damages the insect.
            insect.lifespan -= INSECT_DAMAGE_FROM_TOXIC_FLOWER;
            // The flower also takes a small amount of damage in the struggle
            nextFlower.health = Math.max(0, nextFlower.health - (INSECT_DAMAGE_TO_FLOWER / 2));
        } else {
            // Normal/mildly toxic flower: gets damaged by insect.
            nextFlower.health = Math.max(0, nextFlower.health - INSECT_DAMAGE_TO_FLOWER);
        }
        
        if (insect.pollen && insect.pollen.sourceFlowerId !== flower.id && flower.isMature && Math.random() < INSECT_POLLINATION_CHANCE) {
            const spawnSpot = findCellForFlowerSpawn(grid, params, {x: newX, y: newY});
            if (spawnSpot) {
                const seed = requestNewFlower(spawnSpot.x, spawnSpot.y, flower.genome, insect.pollen.genome);
                if(seed) newActorQueue.push(seed);
            }
        }
        insect.pollen = { genome: flower.genome, sourceFlowerId: flower.id };
    }
};
