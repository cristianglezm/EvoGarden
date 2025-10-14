import type { Cockroach, Corpse, Nutrient, Flower, CellContent } from '../../../types';
import { 
    COCKROACH_VISION_RANGE, 
    CORPSE_NUTRITION_VALUE, 
    NUTRIENT_FROM_COCKROACH_LIFESPAN, 
    INSECT_DATA,
    COCKROACH_STAMINA_REGEN_PER_TICK,
    COCKROACH_MIN_STAMINA_TO_MOVE,
    COCKROACH_MOVE_STAMINA_COST,
    NUTRIENT_FROM_FLOWER_DEATH_LIFESPAN,
    COCKROACH_HEALTH_DECAY_PER_TICK,
} from '../../../constants';
import { Rectangle, type Point } from '../../Quadtree';
import { InsectBehavior } from '../base/InsectBehavior';
import type { InsectBehaviorContext } from '../insectBehavior';

export class CockroachBehavior extends InsectBehavior {
    public update(cockroach: Cockroach, context: InsectBehaviorContext): void {
        const { nextActorState } = context;

        // Simplified health decay for cockroaches, they don't leave a corpse.
        cockroach.health -= COCKROACH_HEALTH_DECAY_PER_TICK;
        if (cockroach.health <= 0) {
            nextActorState.delete(cockroach.id);
            return;
        }

        cockroach.stamina = Math.min(cockroach.maxStamina, cockroach.stamina + COCKROACH_STAMINA_REGEN_PER_TICK);

        // --- Action Phase ---

        // 1. Eat corpse on current cell (highest priority)
        const corpseOnCell = Array.from(nextActorState.values()).find(a => a.x === cockroach.x && a.y === cockroach.y && a.type === 'corpse') as Corpse | undefined;
        if (corpseOnCell) {
            this.handleEatCorpse(cockroach, corpseOnCell, context);
            return;
        }

        // 2. Attack flower on current cell
        const flowerOnCell = Array.from(nextActorState.values()).find(a => a.x === cockroach.x && a.y === cockroach.y && a.type === 'flower') as Flower | undefined;
        if (flowerOnCell) {
            this.handleAttackFlower(cockroach, flowerOnCell, context);
            return;
        }
        
        // 3. Search and Move
        if (cockroach.stamina >= COCKROACH_MIN_STAMINA_TO_MOVE) {
            cockroach.stamina -= COCKROACH_MOVE_STAMINA_COST;
            this.handleMovement(cockroach, context);
        }
    }

    private handleEatCorpse(cockroach: Cockroach, corpse: Corpse, context: InsectBehaviorContext) {
        context.nextActorState.delete(corpse.id);
        cockroach.health = Math.min(cockroach.maxHealth, cockroach.health + CORPSE_NUTRITION_VALUE);
        cockroach.stamina = Math.min(cockroach.maxStamina, cockroach.stamina + CORPSE_NUTRITION_VALUE);
        
        const nutrientId = `nutrient-${cockroach.x}-${cockroach.y}-${Date.now()}`;
        const nutrient: Nutrient = { id: nutrientId, type: 'nutrient', x: cockroach.x, y: cockroach.y, lifespan: NUTRIENT_FROM_COCKROACH_LIFESPAN };
        context.nextActorState.set(nutrientId, nutrient);
    }

    private handleAttackFlower(cockroach: Cockroach, flower: Flower, context: InsectBehaviorContext) {
        const baseStats = INSECT_DATA.get('🪳')!;
        if (cockroach.stamina >= baseStats.reproductionCost) { // Using reproductionCost as attack cost for now
            flower.health = Math.max(0, flower.health - baseStats.attack);
            cockroach.stamina -= baseStats.reproductionCost;
            
            if (flower.health <= 0) {
                const nutrientId = `nutrient-${cockroach.x}-${cockroach.y}-${Date.now()}`;
                const nutrient: Nutrient = { id: nutrientId, type: 'nutrient', x: cockroach.x, y: cockroach.y, lifespan: NUTRIENT_FROM_FLOWER_DEATH_LIFESPAN };
                context.nextActorState.set(nutrientId, nutrient);
            }
        }
    }

    private handleMovement(cockroach: Cockroach, context: InsectBehaviorContext) {
        let target: { x: number, y: number } | null = null;
        
        // Priority 1: Find corpses
        const vision = new Rectangle(cockroach.x, cockroach.y, COCKROACH_VISION_RANGE, COCKROACH_VISION_RANGE);
        const nearbyCorpses = context.qtree.query(vision)
            .map((p: Point<CellContent>) => p.data)
            .filter((a): a is Corpse => !!a && a.type === 'corpse' && context.nextActorState.has(a.id));

        if (nearbyCorpses.length > 0) {
            target = nearbyCorpses.reduce((closest, corpse) => {
                const dist = Math.hypot(cockroach.x - corpse.x, cockroach.y - corpse.y);
                return (dist < closest.dist) ? { x: corpse.x, y: corpse.y, dist } : closest;
            }, { x: 0, y: 0, dist: Infinity });
        } else {
            // Priority 2: Find weak flowers
            target = this.findBestFlowerTarget(cockroach, context);
        }
        
        if (target) {
            this.moveTowards(cockroach, target, context);
        } else {
            this.wander(cockroach, context);
        }
    }
}
