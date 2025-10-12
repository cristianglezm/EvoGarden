import type { Cockroach, Corpse, Nutrient, Flower, CellContent, Egg, Cocoon } from '../../../types';
import { 
    COCKROACH_VISION_RANGE, 
    CORPSE_NUTRITION_VALUE, 
    NUTRIENT_FROM_COCKROACH_LIFESPAN, 
    INSECT_DATA,
    COCKROACH_STAMINA_REGEN_PER_TICK,
    COCKROACH_MIN_STAMINA_TO_MOVE,
    COCKROACH_MOVE_STAMINA_COST,
    COCKROACH_HEALTH_DECAY_PER_TICK,
    INSECT_ATTACK_COST,
    COCKROACH_NUTRIENT_DROP_COOLDOWN,
} from '../../../constants';
import { Rectangle, type Point } from '../../Quadtree';
import { InsectBehavior } from '../base/InsectBehavior';
import type { InsectBehaviorContext } from '../../../types';
import { getActorsOnCell } from '../../simulationUtils';

export class CockroachBehavior extends InsectBehavior {
    public update(cockroach: Cockroach, context: InsectBehaviorContext): void {
        const { nextActorState } = context;

        // Simplified health decay for cockroaches, they don't leave a corpse.
        cockroach.health -= COCKROACH_HEALTH_DECAY_PER_TICK;
        if (cockroach.health <= 0) {
            nextActorState.delete(cockroach.id);
            return;
        }

        // Handle nutrient drop cooldown
        if (cockroach.nutrientDropCooldown !== undefined) {
            if (cockroach.nutrientDropCooldown > 0) {
                cockroach.nutrientDropCooldown--;
            }
            if (cockroach.nutrientDropCooldown === 0) {
                this.handleDropNutrient(cockroach, context);
            }
        }

        cockroach.stamina = Math.min(cockroach.maxStamina, cockroach.stamina + COCKROACH_STAMINA_REGEN_PER_TICK);

        // --- Action Phase ---

        // 1. Eat corpse on current cell (highest priority)
        const actorsOnCell = getActorsOnCell(context.qtree, context.nextActorState, cockroach.x, cockroach.y);
        const corpseOnCell = actorsOnCell.find(a => a.type === 'corpse') as Corpse | undefined;
        if (corpseOnCell) {
            this.handleEatCorpse(cockroach, corpseOnCell, context);
            return;
        }
        
        // 2. Eat egg or cocoon on current cell
        if (this.handleEatEggOrCocoon(cockroach, actorsOnCell, context)) {
            return;
        }

        // 3. Attack flower on current cell
        const flowerOnCell = actorsOnCell.find(a => a.type === 'flower') as Flower | undefined;
        if (flowerOnCell) {
            this.handleAttackFlower(cockroach, flowerOnCell, context);
            return;
        }
        
        // 4. Search and Move
        if (cockroach.stamina >= COCKROACH_MIN_STAMINA_TO_MOVE) {
            cockroach.stamina -= COCKROACH_MOVE_STAMINA_COST;
            this.handleMovement(cockroach, context);
        }
    }

    private handleDropNutrient(cockroach: Cockroach, context: InsectBehaviorContext) {
        const { getNextId } = context;
        const nutrientValue = cockroach.pendingNutrientValue || 0;
        if (nutrientValue > 0) {
            const nutrientId = getNextId('nutrient', cockroach.x, cockroach.y);
            const lifespan = 2 + Math.floor(0.5 * nutrientValue);
            const nutrient: Nutrient = { id: nutrientId, type: 'nutrient', x: cockroach.x, y: cockroach.y, lifespan };
            context.nextActorState.set(nutrientId, nutrient);
        }

        cockroach.nutrientDropCooldown = undefined;
        cockroach.pendingNutrientValue = undefined;
    }

    private handleEatCorpse(cockroach: Cockroach, corpse: Corpse, context: InsectBehaviorContext) {
        context.nextActorState.delete(corpse.id);
        cockroach.health = Math.min(cockroach.maxHealth, cockroach.health + CORPSE_NUTRITION_VALUE);
        cockroach.stamina = Math.min(cockroach.maxStamina, cockroach.stamina + CORPSE_NUTRITION_VALUE);
        
        const nutrientId = context.getNextId('nutrient', cockroach.x, cockroach.y);
        const nutrient: Nutrient = { id: nutrientId, type: 'nutrient', x: cockroach.x, y: cockroach.y, lifespan: NUTRIENT_FROM_COCKROACH_LIFESPAN };
        context.nextActorState.set(nutrientId, nutrient);
    }

    private handleEatEggOrCocoon(cockroach: Cockroach, actorsOnCell: CellContent[], context: InsectBehaviorContext): boolean {
        const preyOnCell = actorsOnCell.find(a => a.type === 'egg' || a.type === 'cocoon') as Egg | Cocoon | undefined;

        if (preyOnCell) {
            // Don't eat its own eggs
            if (preyOnCell.type === 'egg' && preyOnCell.insectEmoji === '🪳') {
                return false;
            }

            context.nextActorState.delete(preyOnCell.id);
            cockroach.health = Math.min(cockroach.maxHealth, cockroach.health + CORPSE_NUTRITION_VALUE);
            cockroach.stamina = Math.min(cockroach.maxStamina, cockroach.stamina + CORPSE_NUTRITION_VALUE);
            context.events.push({ message: `🪳 A cockroach ate a ${preyOnCell.type}!`, type: 'info', importance: 'low' });
            return true;
        }
        return false;
    }

    private handleAttackFlower(cockroach: Cockroach, flower: Flower, _context: InsectBehaviorContext) {
        const baseStats = INSECT_DATA.get('🪳')!;
        if (cockroach.stamina >= INSECT_ATTACK_COST) {
            flower.health = Math.max(0, flower.health - baseStats.attack);
            cockroach.stamina -= INSECT_ATTACK_COST;
            
            if (flower.health <= 0) {
                // Instead of spawning nutrient, set a cooldown on the cockroach
                cockroach.nutrientDropCooldown = COCKROACH_NUTRIENT_DROP_COOLDOWN;
                cockroach.pendingNutrientValue = flower.maxHealth;
            }
        }
    }

    private findClosestEggOrCocoon(cockroach: Cockroach, context: InsectBehaviorContext): Egg | Cocoon | null {
        const vision = new Rectangle(cockroach.x, cockroach.y, COCKROACH_VISION_RANGE, COCKROACH_VISION_RANGE);
        const nearbyPrey = context.qtree.query(vision)
            .map(p => p.data)
            .filter(a => (a?.type === 'egg' || a?.type === 'cocoon') && context.nextActorState.has(a.id)) as (Egg | Cocoon)[];
        
        const validPrey = nearbyPrey.filter(p => {
            if (p.type === 'egg') {
                return p.insectEmoji !== '🪳';
            }
            return true; // Cocoons are always fair game for now
        });

        if (validPrey.length === 0) return null;
        
        return validPrey.reduce((closest, current) => {
            const dist = Math.hypot(cockroach.x - current.x, cockroach.y - current.y);
            return dist < closest.dist ? { prey: current, dist } : closest;
        }, { prey: null as (Egg | Cocoon | null), dist: Infinity }).prey;
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
            // Priority 2: Find eggs or cocoons
            target = this.findClosestEggOrCocoon(cockroach, context);
            if (!target) {
                // Priority 3: Find weak flowers
                target = this.findBestFlowerTarget(cockroach, context);
            }
        }
        
        if (target) {
            this.moveTowards(cockroach, target, context);
        } else {
            this.wander(cockroach, context);
        }
    }
}
