import type { Insect, Flower } from '../../../types';
import { 
    INSECT_POLLINATION_CHANCE, 
    INSECT_DORMANCY_TEMP, 
    INSECT_STAMINA_REGEN_PER_TICK,
    INSECT_MOVE_COST,
    INSECT_WANDER_CHANCE,
    INSECT_STAMINA_GAIN_FROM_EATING,
    INSECT_HEAL_FROM_HEALING_FLOWER,
    INSECT_DAMAGE_FROM_TOXIC_FLOWER,
} from '../../../constants';
import { findCellForFlowerSpawn, scoreFlower, getActorsOnCell } from '../../simulationUtils';
import { InsectBehavior } from '../base/InsectBehavior';
import type { InsectBehaviorContext } from '../../../types';

/**
 * Implements the behavior for Butterflies. They are pure pollinators and
 * do not damage flowers. Their reproduction leads to caterpillars.
 */
export class ButterflyBehavior extends InsectBehavior {
    public update(insect: Insect, context: InsectBehaviorContext): void {
        const { currentTemperature } = context;

        if (this.handleHealthAndDeath(insect, context)) {
            return; // Butterfly died
        }
        
        if (insect.reproductionCooldown && insect.reproductionCooldown > 0) {
            insect.reproductionCooldown--;
        }

        if (currentTemperature < INSECT_DORMANCY_TEMP) {
            return;
        }

        let hasInteracted = false;
        
        const flowerOnCurrentCell = this.findFlowerOnCell(insect.x, insect.y, context);
        if (flowerOnCurrentCell) {
            this.handleInteraction(insect, flowerOnCurrentCell, context);
            hasInteracted = true;
        }
        
        this.handleMovement(insect, hasInteracted, context);

        if (hasInteracted) {
            // Regenerate stamina from "eating" after moving away from the flower.
            insect.stamina = Math.min(insect.maxStamina, insect.stamina + INSECT_STAMINA_GAIN_FROM_EATING);
        } else {
            // If it didn't interact (i.e., it was idle or just wandering), regenerate stamina.
            insect.stamina = Math.min(insect.maxStamina, insect.stamina + INSECT_STAMINA_REGEN_PER_TICK);
        }
    }
    
    protected findFlowerOnCell(x: number, y: number, context: InsectBehaviorContext): Flower | undefined {
         return getActorsOnCell(context.qtree, context.nextActorState, x, y).find(
            (actor) => actor.type === 'flower'
        ) as Flower | undefined;
    }
    
    private handleInteraction(insect: Insect, flower: Flower, context: InsectBehaviorContext) {
        // Butterflies don't eat or damage flowers, they only interact for pollination.
        // Add stamina regeneration upon pollinating to prevent getting stuck
        insect.stamina = Math.min(insect.maxStamina, insect.stamina + INSECT_STAMINA_GAIN_FROM_EATING);
        
        // Apply healing or toxicity from the flower
        if (flower.toxicityRate < 0) {
            // Healing flower
            insect.health = Math.min(insect.maxHealth, insect.health + (INSECT_HEAL_FROM_HEALING_FLOWER * Math.abs(flower.toxicityRate)));
        } else {
            // Toxic or neutral flower
            const damageToInsect = INSECT_DAMAGE_FROM_TOXIC_FLOWER * flower.toxicityRate;
            insect.health = Math.max(0, insect.health - damageToInsect);
        }

        this.handlePollination(insect, flower, context);
        const pollenScore = scoreFlower(insect, flower);
        insect.pollen = { genome: flower.genome, sourceFlowerId: flower.id, score: pollenScore };
    }
    
    protected handlePollination(insect: Insect, flower: Flower, context: InsectBehaviorContext) {
        const { pollen } = insect;
        if (pollen && pollen.sourceFlowerId !== flower.id && flower.isMature && Math.random() < INSECT_POLLINATION_CHANCE) {
            const spawnSpot = findCellForFlowerSpawn(context.grid, context.params, { x: flower.x, y: flower.y });
            if (spawnSpot) {
                const seed = context.asyncFlowerFactory.requestNewFlower(context.nextActorState, spawnSpot.x, spawnSpot.y, flower.genome, pollen.genome, context.getNextId);
                if (seed) {
                    context.newActorQueue.push(seed);
                }
            }
        }
    }
    
    private handleMovement(insect: Insect, hasInteracted: boolean, context: InsectBehaviorContext): boolean {
        if (insect.stamina < INSECT_MOVE_COST) return false;

        let moved = false;

        if (hasInteracted) {
            moved = this.wander(insect, context);
        } else {
            if (Math.random() > INSECT_WANDER_CHANCE) {
                const targetFlower = this.findBestFlowerTarget(insect, context);
                if (targetFlower) {
                    moved = this.moveTowards(insect, targetFlower, context);
                }
            }
            
            if (!moved) {
                moved = this.wander(insect, context);
            }
        }

        if (moved) {
            insect.stamina -= INSECT_MOVE_COST;
        }

        return moved;
    }
}
