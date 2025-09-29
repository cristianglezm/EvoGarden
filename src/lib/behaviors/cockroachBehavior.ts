import type { Cockroach, CellContent, Corpse, Nutrient, SimulationParams, Flower } from '../../types';
import { Quadtree, Rectangle } from '../Quadtree';
import { 
    COCKROACH_VISION_RANGE, 
    CORPSE_NUTRITION_VALUE, 
    NUTRIENT_FROM_COCKROACH_LIFESPAN, 
    INSECT_DATA,
    COCKROACH_HEALTH_DECAY_PER_TICK,
    COCKROACH_STAMINA_REGEN_PER_TICK,
    COCKROACH_MIN_STAMINA_TO_MOVE,
    COCKROACH_MOVE_STAMINA_COST,
    NUTRIENT_FROM_FLOWER_DEATH_LIFESPAN,
} from '../../constants';
import { scoreFlower } from '../simulationUtils';

export interface CockroachContext {
    params: SimulationParams;
    qtree: Quadtree<CellContent>;
    flowerQtree: Quadtree<CellContent>;
    nextActorState: Map<string, CellContent>;
}

export const processCockroachTick = (cockroach: Cockroach, context: CockroachContext) => {
    const { params, qtree, flowerQtree, nextActorState } = context;
    const { x, y } = cockroach;
    const baseStats = INSECT_DATA.get('🪳')!;

    // Health decay
    cockroach.health -= COCKROACH_HEALTH_DECAY_PER_TICK;
    if (cockroach.health <= 0) {
        nextActorState.delete(cockroach.id);
        return; // Cockroaches don't leave corpses to prevent loops
    }

    // Stamina regen
    cockroach.stamina = Math.min(cockroach.maxStamina, cockroach.stamina + COCKROACH_STAMINA_REGEN_PER_TICK);

    // --- Action Phase ---

    // 1. Eat corpse on current cell (highest priority)
    const corpseOnCell = Array.from(nextActorState.values()).find(a => a.x === x && a.y === y && a.type === 'corpse') as Corpse | undefined;
    if (corpseOnCell) {
        nextActorState.delete(corpseOnCell.id);
        cockroach.health = Math.min(cockroach.maxHealth, cockroach.health + CORPSE_NUTRITION_VALUE);
        cockroach.stamina = Math.min(cockroach.maxStamina, cockroach.stamina + CORPSE_NUTRITION_VALUE);
        
        const nutrientId = `nutrient-${x}-${y}-${Date.now()}`;
        const nutrient: Nutrient = { id: nutrientId, type: 'nutrient', x, y, lifespan: NUTRIENT_FROM_COCKROACH_LIFESPAN };
        nextActorState.set(nutrientId, nutrient);
        return; // Action for this tick is complete
    }

    // 2. Attack flower on current cell (if no corpse)
    const flowerOnCell = Array.from(nextActorState.values()).find(a => a.x === x && a.y === y && a.type === 'flower') as Flower | undefined;
    if (flowerOnCell && cockroach.stamina >= baseStats.reproductionCost) {
        flowerOnCell.health = Math.max(0, flowerOnCell.health - baseStats.attack);
        cockroach.stamina -= baseStats.reproductionCost;
        
        if (flowerOnCell.health <= 0) {
            // A defeated flower creates a nutrient
            const nutrientId = `nutrient-${x}-${y}-${Date.now()}`;
            const nutrient: Nutrient = { id: nutrientId, type: 'nutrient', x, y, lifespan: NUTRIENT_FROM_FLOWER_DEATH_LIFESPAN };
            nextActorState.set(nutrientId, nutrient);
        }

        return;
    }
    
    // 3. Search and Move
    if (cockroach.stamina < COCKROACH_MIN_STAMINA_TO_MOVE) { // Not enough stamina to move
        return;
    }

    let target: { x: number, y: number } | null = null;

    // Search for corpses first
    const vision = new Rectangle(x, y, COCKROACH_VISION_RANGE, COCKROACH_VISION_RANGE);
    const nearbyCorpses = qtree.query(vision)
        .map(p => p.data)
        .filter(a => a?.type === 'corpse' && nextActorState.has(a.id)) as Corpse[];

    if (nearbyCorpses.length > 0) {
        target = nearbyCorpses.reduce((closest, corpse) => {
            const dist = Math.hypot(x - corpse.x, y - corpse.y);
            return (dist < closest.dist) ? { x: corpse.x, y: corpse.y, dist } : closest;
        }, { x: 0, y: 0, dist: Infinity });
    } else {
        // If no corpses, search for the weakest flower using the genetic scoring function
        const nearbyFlowers = flowerQtree.query(vision)
            .map(p => p.data)
            .filter(a => a?.type === 'flower' && nextActorState.has(a.id)) as Flower[];
        
        if (nearbyFlowers.length > 0) {
            const bestFlower = nearbyFlowers.reduce((best, current) => {
                const currentScore = scoreFlower(cockroach, current);
                return (currentScore > best.score) ? { flower: current, score: currentScore } : best;
            }, { flower: null as Flower | null, score: -Infinity }).flower;
    
            if (bestFlower) {
                target = { x: bestFlower.x, y: bestFlower.y };
            }
        }
    }

    // Move logic
    cockroach.stamina -= COCKROACH_MOVE_STAMINA_COST;
    let dx = 0, dy = 0;

    if (target) {
        dx = Math.sign(target.x - x);
        dy = Math.sign(target.y - y);
    } else { // Wander
        const moves = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
        const move = moves[Math.floor(Math.random() * moves.length)];
        dx = move[0];
        dy = move[1];
    }

    const newX = x + dx * baseStats.speed;
    const newY = y + dy * baseStats.speed;
    
    const { gridWidth, gridHeight } = params;
    if (newX >= 0 && newX < gridWidth && newY >= 0 && newY < gridHeight) {
        cockroach.x = newX;
        cockroach.y = newY;
    }
};
