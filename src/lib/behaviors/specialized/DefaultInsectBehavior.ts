import type { Insect, Flower } from '../../../types';
import { 
    INSECT_POLLINATION_CHANCE, 
    INSECT_DORMANCY_TEMP, 
    INSECT_HEAL_FROM_HEALING_FLOWER, 
    INSECT_STAMINA_REGEN_PER_TICK,
    INSECT_MOVE_COST,
    INSECT_DATA,
    INSECT_WANDER_CHANCE,
    INSECT_STAMINA_GAIN_FROM_EATING,
    INSECT_DAMAGE_FROM_TOXIC_FLOWER
} from '../../../constants';
import { findCellForFlowerSpawn, scoreFlower } from '../../simulationUtils';
import { InsectBehavior } from '../base/InsectBehavior';
import type { InsectBehaviorContext } from '../insectBehavior';

/**
 * Implements the default behavior for most insects like butterflies, beetles, etc.
 * This includes finding desirable flowers based on genetics, pollinating, and basic interactions.
 */
export class DefaultInsectBehavior extends InsectBehavior {
    public update(insect: Insect, context: InsectBehaviorContext): void {
        const { currentTemperature } = context;

        if (this.handleHealthAndDeath(insect, context)) {
            return; // Insect died
        }

        if (insect.reproductionCooldown && insect.reproductionCooldown > 0) {
            insect.reproductionCooldown--;
        }

        // If it's too cold, insects become dormant
        if (currentTemperature < INSECT_DORMANCY_TEMP) {
            return;
        }

        let hasInteracted = false;
        
        // 1. Check for a flower on the current cell to interact with
        const flowerOnCurrentCell = this.findFlowerOnCell(insect.x, insect.y, context);
        if (flowerOnCurrentCell) {
            this.handleInteraction(insect, flowerOnCurrentCell, context);
            hasInteracted = true;
        }

        // 2. Movement phase
        this.handleMovement(insect, hasInteracted, context);

        // 3. Regenerate stamina if idle
        if (!hasInteracted) {
             insect.stamina = Math.min(insect.maxStamina, insect.stamina + INSECT_STAMINA_REGEN_PER_TICK);
        }
    }
    
    protected findFlowerOnCell(x: number, y: number, context: InsectBehaviorContext): Flower | undefined {
         return Array.from(context.nextActorState.values()).find(
            (actor) => actor.x === x && actor.y === y && actor.type === 'flower'
        ) as Flower | undefined;
    }
    
    protected handleInteraction(insect: Insect, flower: Flower, context: InsectBehaviorContext) {
        const baseStats = INSECT_DATA.get(insect.emoji)!;
        
        // Eating now restores stamina instead of costing it.
        insect.stamina = Math.min(insect.maxStamina, insect.stamina + INSECT_STAMINA_GAIN_FROM_EATING);

        // Interaction logic based on flower type
        if (flower.toxicityRate < 0) {
            // Healing flower: Restores insect's health.
            flower.health = Math.max(0, flower.health - baseStats.attack);
            insect.health = Math.min(insect.maxHealth, insect.health + (INSECT_HEAL_FROM_HEALING_FLOWER * Math.abs(flower.toxicityRate)));
        } else {
            // Neutral or Toxic flower: Both parties take damage.
            flower.health = Math.max(0, flower.health - baseStats.attack);
            
            // Damage to insect is scaled by toxicity. A neutral flower will do minimal damage.
            const damageToInsect = INSECT_DAMAGE_FROM_TOXIC_FLOWER * flower.toxicityRate;
            insect.health = Math.max(0, insect.health - damageToInsect);
        }
        
        // Pollination logic
        this.handlePollination(insect, flower, context);

        // Always pick up pollen from the interacted flower
        const pollenScore = scoreFlower(insect, flower);
        insect.pollen = { genome: flower.genome, sourceFlowerId: flower.id, score: pollenScore };
    }
    
    protected handlePollination(insect: Insect, flower: Flower, context: InsectBehaviorContext) {
        const { pollen } = insect;
        if (pollen && pollen.sourceFlowerId !== flower.id && flower.isMature && Math.random() < INSECT_POLLINATION_CHANCE) {
            const spawnSpot = findCellForFlowerSpawn(context.grid, context.params, { x: flower.x, y: flower.y });
            if (spawnSpot) {
                const seed = context.asyncFlowerFactory.requestNewFlower(context.nextActorState, spawnSpot.x, spawnSpot.y, flower.genome, pollen.genome);
                if (seed) {
                    context.newActorQueue.push(seed);
                }
            }
        }
    }
    
    protected handleMovement(insect: Insect, hasInteracted: boolean, context: InsectBehaviorContext) {
        const moveCost = INSECT_MOVE_COST * (context.currentTemperature < INSECT_DORMANCY_TEMP ? 2 : 1);
        if (insect.stamina < moveCost) return;

        insect.stamina -= moveCost;

        if (hasInteracted) {
            this.wander(insect, context);
            return;
        }

        let moved = false;
        if (Math.random() > INSECT_WANDER_CHANCE) {
            const targetFlower = this.findBestFlowerTarget(insect, context);
            if (targetFlower) {
                moved = this.moveTowards(insect, targetFlower, context);
            }
        }
        
        if (!moved) {
            this.wander(insect, context);
        }
    }
}
