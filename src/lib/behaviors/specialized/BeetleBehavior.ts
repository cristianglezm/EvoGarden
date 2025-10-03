import type { Insect, Flower } from '../../../types';
import { 
    INSECT_DORMANCY_TEMP, 
    INSECT_STAMINA_REGEN_PER_TICK,
    INSECT_MOVE_COST,
    HEALTHY_FLOWER_THRESHOLD,
    WEAK_FLOWER_THRESHOLD,
    BEETLE_HEAL_AMOUNT,
    BEETLE_COLLECT_STAMINA_COST,
    BEETLE_DEPOSIT_STAMINA_COST
} from '../../../constants';
import { InsectBehavior } from '../base/InsectBehavior';
import type { InsectBehaviorContext } from '../insectBehavior';
import { Rectangle } from '../../Quadtree';

export class BeetleBehavior extends InsectBehavior {
    public update(insect: Insect, context: InsectBehaviorContext): void {
        const { currentTemperature } = context;

        if (this.handleHealthAndDeath(insect, context)) {
            return; // Insect died
        }

        // Initialize isCarryingNutrient if it doesn't exist
        if (insect.isCarryingNutrient === undefined) {
            insect.isCarryingNutrient = false;
        }

        if (currentTemperature < INSECT_DORMANCY_TEMP) {
            return; // Dormant
        }

        let hasInteracted = false;
        
        // --- Interaction Phase ---
        if (insect.isCarryingNutrient) {
            // Trying to deposit
            const flowerOnCell = this.findFlowerOnCell(insect.x, insect.y, 'weak', context);
            if (flowerOnCell) {
                this.handleDeposit(insect, flowerOnCell, context);
                hasInteracted = true;
            }
        } else {
            // Trying to collect
            const flowerOnCell = this.findFlowerOnCell(insect.x, insect.y, 'healthy', context);
            if (flowerOnCell) {
                this.handleCollect(insect, context);
                hasInteracted = true;
            }
        }

        // --- Movement Phase ---
        let hasMoved = false;
        if (!hasInteracted) {
            hasMoved = this.handleMovement(insect, context);
        }

        // --- Stamina Regen ---
        // Only regen stamina if no action was taken
        if (!hasInteracted && !hasMoved) {
            insect.stamina = Math.min(insect.maxStamina, insect.stamina + INSECT_STAMINA_REGEN_PER_TICK);
        }
    }

    private handleCollect(insect: Insect, context: InsectBehaviorContext) {
        if (insect.stamina >= BEETLE_COLLECT_STAMINA_COST) {
            insect.stamina -= BEETLE_COLLECT_STAMINA_COST;
            insect.isCarryingNutrient = true;
            context.events.push({ message: `🪲 A beetle collected nutrients.`, type: 'info', importance: 'low' });
        }
    }

    private handleDeposit(insect: Insect, flower: Flower, context: InsectBehaviorContext) {
        if (insect.stamina >= BEETLE_DEPOSIT_STAMINA_COST) {
            insect.stamina -= BEETLE_DEPOSIT_STAMINA_COST;
            flower.health = Math.min(flower.maxHealth, flower.health + BEETLE_HEAL_AMOUNT);
            // Also give some stamina back to the flower
            flower.stamina = Math.min(flower.maxStamina, flower.stamina + BEETLE_HEAL_AMOUNT);
            insect.isCarryingNutrient = false;
            context.events.push({ message: `🪲 A beetle healed a flower.`, type: 'info', importance: 'low' });
        }
    }

    private handleMovement(insect: Insect, context: InsectBehaviorContext): boolean {
        if (insect.stamina < INSECT_MOVE_COST) return false;

        let target: Flower | null = null;
        if (insect.isCarryingNutrient) {
            target = this.findClosestFlower('weak', insect, context);
        } else {
            target = this.findClosestFlower('healthy', insect, context);
        }

        if (target) {
            if (this.moveTowards(insect, target, context)) {
                insect.stamina -= INSECT_MOVE_COST;
                return true;
            }
        } else {
            if (this.wander(insect, context)) {
                 insect.stamina -= INSECT_MOVE_COST;
                 return true;
            }
        }
        return false;
    }

    private findFlowerOnCell(x: number, y: number, type: 'healthy' | 'weak', context: InsectBehaviorContext): Flower | undefined {
        const flower = Array.from(context.nextActorState.values()).find(
            (actor) => actor.x === x && actor.y === y && actor.type === 'flower'
        ) as Flower | undefined;
        
        if (!flower) return undefined;
        
        const healthRatio = flower.health / flower.maxHealth;
        if (type === 'healthy' && healthRatio >= HEALTHY_FLOWER_THRESHOLD) {
            return flower;
        }
        if (type === 'weak' && healthRatio < WEAK_FLOWER_THRESHOLD) {
            return flower;
        }
        return undefined;
    }

    private findClosestFlower(type: 'healthy' | 'weak', insect: Insect, context: InsectBehaviorContext): Flower | null {
        const vision = new Rectangle(insect.x, insect.y, 5, 5);
        const nearbyFlowers = context.flowerQtree.query(vision)
            .map(p => p.data as Flower)
            .filter(f => context.nextActorState.has(f.id));

        const threshold = type === 'healthy' ? HEALTHY_FLOWER_THRESHOLD : WEAK_FLOWER_THRESHOLD;
        const comparator = type === 'healthy' 
            ? (ratio: number) => ratio >= threshold 
            : (ratio: number) => ratio < threshold;

        const validTargets = nearbyFlowers.filter(f => comparator(f.health / f.maxHealth));

        if (validTargets.length === 0) return null;

        return validTargets.reduce((closest, current) => {
            const dist = Math.hypot(insect.x - current.x, insect.y - current.y);
            return dist < closest.dist ? { flower: current, dist } : closest;
        }, { flower: null as Flower | null, dist: Infinity }).flower;
    }
}
