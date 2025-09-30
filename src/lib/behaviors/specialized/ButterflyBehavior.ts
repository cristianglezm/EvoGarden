import type { Insect, Flower } from '../../../types';
import { 
    INSECT_POLLINATION_CHANCE, 
    INSECT_DORMANCY_TEMP, 
    INSECT_STAMINA_REGEN_PER_TICK,
    INSECT_MOVE_COST,
    INSECT_WANDER_CHANCE,
} from '../../../constants';
import { findCellForFlowerSpawn } from '../../simulationUtils';
import { InsectBehavior } from '../base/InsectBehavior';
import type { InsectBehaviorContext } from '../insectBehavior';

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

        if (!hasInteracted) {
             insect.stamina = Math.min(insect.maxStamina, insect.stamina + INSECT_STAMINA_REGEN_PER_TICK);
        }
    }
    
    private findFlowerOnCell(x: number, y: number, context: InsectBehaviorContext): Flower | undefined {
         return Array.from(context.nextActorState.values()).find(
            (actor) => actor.x === x && actor.y === y && actor.type === 'flower'
        ) as Flower | undefined;
    }
    
    private handleInteraction(insect: Insect, flower: Flower, context: InsectBehaviorContext) {
        // Butterflies don't eat or damage flowers, they only interact for pollination.
        this.handlePollination(insect, flower, context);
        insect.pollen = { genome: flower.genome, sourceFlowerId: flower.id };
    }
    
    private handlePollination(insect: Insect, flower: Flower, context: InsectBehaviorContext) {
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
    
    private handleMovement(insect: Insect, hasInteracted: boolean, context: InsectBehaviorContext) {
        if (insect.stamina < INSECT_MOVE_COST) return;

        insect.stamina -= INSECT_MOVE_COST;

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
