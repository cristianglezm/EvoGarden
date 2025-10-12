import type { Insect, Flower, Egg, Cocoon } from '../../../types';
import { 
    INSECT_DORMANCY_TEMP, 
    INSECT_STAMINA_REGEN_PER_TICK,
    INSECT_MOVE_COST,
    LADYBUG_HEAL_FROM_CATERPILLAR,
    INSECT_ATTACK_COST,
} from '../../../constants';
import { InsectBehavior } from '../base/InsectBehavior';
import type { InsectBehaviorContext } from '../../../types';
import { Rectangle } from '../../Quadtree';
import { getActorsOnCell } from '../../simulationUtils';

const LADYBUG_VISION_RANGE = 7;

export class LadybugBehavior extends InsectBehavior {
    public update(insect: Insect, context: InsectBehaviorContext): void {
        if (this.handleHealthAndDeath(insect, context)) return;

        if (context.currentTemperature < INSECT_DORMANCY_TEMP) return;

        // Reset target if it's gone
        if (insect.targetId && !context.nextActorState.has(insect.targetId)) {
            insect.targetId = undefined;
            insect.isHunting = false;
        }

        const hasInteracted = this.handleInteraction(insect, context);
        if (hasInteracted) {
             // Don't move after eating, just regen stamina
             insect.stamina = Math.min(insect.maxStamina, insect.stamina + INSECT_STAMINA_REGEN_PER_TICK);
             return;
        }
        
        const hasMoved = this.handleMovement(insect, context);
        
        if (!hasInteracted && !hasMoved) {
            insect.stamina = Math.min(insect.maxStamina, insect.stamina + INSECT_STAMINA_REGEN_PER_TICK);
        }
    }

    private handleInteraction(insect: Insect, context: InsectBehaviorContext): boolean {
        const actorsOnCell = getActorsOnCell(context.qtree, context.nextActorState, insect.x, insect.y);
        // Priority 1: Eat caterpillar
        const caterpillarOnCell = actorsOnCell
            .find(a => a.type === 'insect' && (a as Insect).emoji === '🐛') as Insect | undefined;

        if (caterpillarOnCell && insect.stamina >= INSECT_ATTACK_COST) {
            context.nextActorState.delete(caterpillarOnCell.id);
            insect.health = Math.min(insect.maxHealth, insect.health + LADYBUG_HEAL_FROM_CATERPILLAR);
            insect.stamina = Math.min(insect.maxStamina, insect.stamina + LADYBUG_HEAL_FROM_CATERPILLAR - INSECT_ATTACK_COST);
            insect.targetId = undefined;
            insect.isHunting = false;
            context.events.push({ message: '🐞 A ladybug ate a caterpillar!', type: 'info', importance: 'low' });
            return true;
        }

        // Priority 2: Eat egg or cocoon (not its own)
        const preyOnCell = actorsOnCell
            .find(a => a.type === 'egg' || a.type === 'cocoon') as Egg | Cocoon | undefined;

        if (preyOnCell && insect.stamina >= INSECT_ATTACK_COST) {
            if (preyOnCell.type === 'egg' && preyOnCell.insectEmoji === '🐞') {
                // Don't eat its own eggs
            } else {
                context.nextActorState.delete(preyOnCell.id);
                const healAmount = LADYBUG_HEAL_FROM_CATERPILLAR / 2;
                insect.health = Math.min(insect.maxHealth, insect.health + healAmount);
                insect.stamina = Math.min(insect.maxStamina, insect.stamina + healAmount - INSECT_ATTACK_COST);
                insect.targetId = undefined;
                insect.isHunting = false;
                context.events.push({ message: `🐞 A ladybug ate a ${preyOnCell.type}!`, type: 'info', importance: 'low' });
                return true;
            }
        }
        return false;
    }

    private handleMovement(insect: Insect, context: InsectBehaviorContext): boolean {
        if (insect.stamina < INSECT_MOVE_COST) return false;

        // Find a target if we don't have one
        if (!insect.targetId) {
            const prey = this.findPrey(insect, context);
            if (prey) {
                insect.targetId = prey.id;
                insect.isHunting = true;
            } else {
                // Fallback to patrolling flowers
                const flower = this.findRandomFlower(insect, context);
                if (flower) {
                    insect.targetId = flower.id;
                    insect.isHunting = false;
                }
            }
        }
        
        const target = insect.targetId ? context.nextActorState.get(insect.targetId) : null;
        if (target) {
            if (this.moveTowards(insect, target, context)) {
                insect.stamina -= INSECT_MOVE_COST;
                return true;
            }
        } else {
            // Wander if no target can be found
            if (this.wander(insect, context)) {
                insect.stamina -= INSECT_MOVE_COST;
                return true;
            }
        }

        return false;
    }

    private findPrey(insect: Insect, context: InsectBehaviorContext): Insect | Egg | Cocoon | null {
        const vision = new Rectangle(insect.x, insect.y, LADYBUG_VISION_RANGE, LADYBUG_VISION_RANGE);
        const nearbyActors = context.qtree.query(vision).map(p => p.data);

        // Priority 1: Caterpillars
        const nearbyCaterpillars = nearbyActors
            .filter(a => a?.type === 'insect' && (a as Insect).emoji === '🐛' && context.nextActorState.has(a.id)) as Insect[];

        if (nearbyCaterpillars.length > 0) {
            return nearbyCaterpillars.reduce((closest, current) => {
                const dist = Math.hypot(insect.x - current.x, insect.y - current.y);
                return dist < closest.dist ? { prey: current, dist } : closest;
            }, { prey: null as Insect | null, dist: Infinity }).prey;
        }

        // Priority 2: Eggs and Cocoons (not its own)
        const nearbyPrey = nearbyActors
            .filter(a => (a?.type === 'egg' || a?.type === 'cocoon') && context.nextActorState.has(a.id)) as (Egg | Cocoon)[];
        
        const validPrey = nearbyPrey.filter(p => {
            if (p.type === 'egg') {
                return p.insectEmoji !== '🐞';
            }
            return true; // Cocoons are always fair game for now
        });

        if (validPrey.length > 0) {
            return validPrey.reduce((closest, current) => {
                const dist = Math.hypot(insect.x - current.x, insect.y - current.y);
                return dist < closest.dist ? { prey: current, dist } : closest;
            }, { prey: null as (Egg | Cocoon | null), dist: Infinity }).prey;
        }

        return null;
    }
    
    private findRandomFlower(insect: Insect, context: InsectBehaviorContext): Flower | null {
        const vision = new Rectangle(insect.x, insect.y, LADYBUG_VISION_RANGE, LADYBUG_VISION_RANGE);
        const nearbyFlowers = context.flowerQtree.query(vision)
            .map(p => p.data as Flower)
            .filter(f => context.nextActorState.has(f.id));

        if (nearbyFlowers.length === 0) return null;
        
        return nearbyFlowers[Math.floor(Math.random() * nearbyFlowers.length)];
    }
}
