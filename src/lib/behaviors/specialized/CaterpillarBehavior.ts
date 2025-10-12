import type { Insect, Flower, Cocoon } from '../../../types';
import { 
    INSECT_DORMANCY_TEMP, 
    INSECT_STAMINA_REGEN_PER_TICK,
    INSECT_MOVE_COST,
    INSECT_DATA,
    CATERPILLAR_EAT_AMOUNT_FOR_COCOON,
    COCOON_HATCH_TIME,
    INSECT_HEAL_FROM_HEALING_FLOWER,
    INSECT_DAMAGE_FROM_TOXIC_FLOWER,
} from '../../../constants';
import { InsectBehavior } from '../base/InsectBehavior';
import type { InsectBehaviorContext } from '../../../types';
import { getActorsOnCell } from '../../simulationUtils';

/**
 * Implements the behavior for Caterpillars. Their primary goal is to eat
 * flowers. After eating a certain amount, they transform into a Cocoon.
 */
export class CaterpillarBehavior extends InsectBehavior {
    public update(insect: Insect, context: InsectBehaviorContext): void {
        const { currentTemperature } = context;

        // Initialize healthEaten if it doesn't exist
        if (insect.healthEaten === undefined) {
            insect.healthEaten = 0;
        }

        if (this.handleHealthAndDeath(insect, context)) {
            return; // Caterpillar died
        }

        if (currentTemperature < INSECT_DORMANCY_TEMP) {
            return;
        }

        // 1. Check for a flower on the current cell to eat
        const flowerOnCurrentCell = this.findFlowerOnCell(insect.x, insect.y, context);
        if (flowerOnCurrentCell) {
            this.handleInteraction(insect, flowerOnCurrentCell);
            // After eating, check for metamorphosis
            if (insect.healthEaten >= CATERPILLAR_EAT_AMOUNT_FOR_COCOON) {
                this.metamorphose(insect, context);
                return; // Transformation complete
            }
        }

        // 2. Movement phase
        this.handleMovement(insect, !!flowerOnCurrentCell, context);

        // 3. Regenerate stamina if idle
        if (!flowerOnCurrentCell) {
             insect.stamina = Math.min(insect.maxStamina, insect.stamina + INSECT_STAMINA_REGEN_PER_TICK);
        }
    }
    
    private findFlowerOnCell(x: number, y: number, context: InsectBehaviorContext): Flower | undefined {
         return getActorsOnCell(context.qtree, context.nextActorState, x, y).find(
            (actor) => actor.type === 'flower'
        ) as Flower | undefined;
    }
    
    private handleInteraction(insect: Insect, flower: Flower) {
        const baseStats = INSECT_DATA.get(insect.emoji)!;
        const damageDealt = baseStats.attack;
        
        flower.health = Math.max(0, flower.health - damageDealt);
        insect.healthEaten = (insect.healthEaten || 0) + damageDealt;

        // Apply healing or toxicity from the flower
        if (flower.toxicityRate < 0) {
            // Healing flower
            insect.health = Math.min(insect.maxHealth, insect.health + (INSECT_HEAL_FROM_HEALING_FLOWER * Math.abs(flower.toxicityRate)));
        } else {
            // Toxic or neutral flower
            const damageToInsect = INSECT_DAMAGE_FROM_TOXIC_FLOWER * flower.toxicityRate;
            insect.health = Math.max(0, insect.health - damageToInsect);
        }
    }
    
    private metamorphose(insect: Insect, context: InsectBehaviorContext) {
        const { nextActorState, events, getNextId } = context;
        nextActorState.delete(insect.id);
        
        const cocoonId = getNextId('cocoon', insect.x, insect.y);
        const newCocoon: Cocoon = {
            id: cocoonId,
            type: 'cocoon',
            x: insect.x,
            y: insect.y,
            hatchTimer: COCOON_HATCH_TIME,
            butterflyGenome: insect.genome, // Pass the genome to the cocoon
        };
        nextActorState.set(cocoonId, newCocoon);
        events.push({ message: `🐛 A caterpillar has formed a cocoon!`, type: 'info', importance: 'low' });
    }
    
    private handleMovement(insect: Insect, hasInteracted: boolean, context: InsectBehaviorContext) {
        if (insect.stamina < INSECT_MOVE_COST) return;

        insect.stamina -= INSECT_MOVE_COST;

        // If the caterpillar just ate, it should wander away to find a new flower
        if (hasInteracted) {
            this.wander(insect, context);
            return;
        }
        
        // Find the best flower target (caterpillars are not picky, but this finds the closest)
        const targetFlower = this.findBestFlowerTarget(insect, context);
        if (targetFlower) {
            this.moveTowards(insect, targetFlower, context);
        } else {
            this.wander(insect, context);
        }
    }
}
