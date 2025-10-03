import type { Insect } from '../../../types';
import { 
    INSECT_DORMANCY_TEMP, 
    INSECT_STAMINA_REGEN_PER_TICK,
    INSECT_MOVE_COST,
    INSECT_ATTACK_COST,
    SCORPION_HEAL_FROM_PREY,
    INSECT_DATA,
    CORPSE_DECAY_TIME,
} from '../../../constants';
import { InsectBehavior } from '../base/InsectBehavior';
import type { InsectBehaviorContext } from '../insectBehavior';
import { Rectangle } from '../../Quadtree';

const SCORPION_VISION_RANGE = 6;
const PREY_PRIORITY = ['🪲', '🐌', '🪳', '🐞']; // Beetle, Snail, Cockroach, Ladybug

export class ScorpionBehavior extends InsectBehavior {
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
             // After attacking, the scorpion pauses to recover a bit of stamina. It doesn't move this turn.
             insect.stamina = Math.min(insect.maxStamina, insect.stamina + INSECT_STAMINA_REGEN_PER_TICK);
             return;
        }
        
        const hasMoved = this.handleMovement(insect, context);
        
        // Regenerate stamina if idle
        if (!hasInteracted && !hasMoved) {
            insect.stamina = Math.min(insect.maxStamina, insect.stamina + INSECT_STAMINA_REGEN_PER_TICK);
        }
    }

    private handleInteraction(insect: Insect, context: InsectBehaviorContext): boolean {
        const targetOnCell = Array.from(context.nextActorState.values())
            .find(a => a.x === insect.x && a.y === insect.y && a.id === insect.targetId) as Insect | undefined;

        if (targetOnCell && insect.stamina >= INSECT_ATTACK_COST) {
            const baseStats = INSECT_DATA.get(insect.emoji)!;
            targetOnCell.health -= baseStats.attack;
            insect.stamina -= INSECT_ATTACK_COST;

            if (targetOnCell.health <= 0) {
                // Prey is killed
                context.nextActorState.delete(targetOnCell.id);
                // Create a corpse
                const corpseId = `corpse-${targetOnCell.x}-${targetOnCell.y}-${Date.now()}`;
                context.newActorQueue.push({ 
                    id: corpseId, type: 'corpse', x: targetOnCell.x, y: targetOnCell.y, 
                    originalEmoji: targetOnCell.emoji, decayTimer: CORPSE_DECAY_TIME 
                });

                // Scorpion gets reward
                insect.health = Math.min(insect.maxHealth, insect.health + SCORPION_HEAL_FROM_PREY);
                insect.stamina = Math.min(insect.maxStamina, insect.stamina + SCORPION_HEAL_FROM_PREY);

                // Scorpion disengages to find a new target
                insect.targetId = undefined;
                insect.isHunting = false;
                
                context.events.push({ message: `🦂 A scorpion killed a ${targetOnCell.emoji}!`, type: 'info', importance: 'low' });
            } else {
                // Prey is damaged but not dead, scorpion stays engaged
                context.events.push({ message: `🦂 A scorpion attacked a ${targetOnCell.emoji}.`, type: 'info', importance: 'low' });
            }
            return true; // An interaction occurred
        }
        return false;
    }

    private handleMovement(insect: Insect, context: InsectBehaviorContext): boolean {
        if (insect.stamina < INSECT_MOVE_COST) return false;

        if (!insect.targetId) {
            const prey = this.findPrey(insect, context);
            if (prey) {
                insect.targetId = prey.id;
                insect.isHunting = true;
            }
        }
        
        const target = insect.targetId ? context.nextActorState.get(insect.targetId) : null;
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

    private findPrey(insect: Insect, context: InsectBehaviorContext): Insect | null {
        const vision = new Rectangle(insect.x, insect.y, SCORPION_VISION_RANGE, SCORPION_VISION_RANGE);
        const nearbyActors = context.qtree.query(vision)
            .map(p => p.data)
            .filter(a => (a?.type === 'insect' || a?.type === 'cockroach') && context.nextActorState.has(a.id)) as Insect[];

        for (const preyType of PREY_PRIORITY) {
            const potentialTargets = nearbyActors.filter(a => a.emoji === preyType);
            if (potentialTargets.length > 0) {
                return potentialTargets.reduce((closest, current) => {
                    const dist = Math.hypot(insect.x - current.x, insect.y - current.y);
                    return dist < closest.dist ? { prey: current, dist } : closest;
                }, { prey: null as Insect | null, dist: Infinity }).prey;
            }
        }

        return null;
    }
}