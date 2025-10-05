import type { Insect, SlimeTrail } from '../../../types';
import { 
    INSECT_DORMANCY_TEMP, 
    INSECT_STAMINA_REGEN_PER_TICK,
    INSECT_MOVE_COST,
    SNAIL_MOVE_COOLDOWN,
    SLIME_TRAIL_LIFESPAN,
} from '../../../constants';
import { DefaultInsectBehavior } from './DefaultInsectBehavior';
import type { InsectBehaviorContext } from '../insectBehavior';

/**
 * Implements the behavior for Snails. They are very slow, leave a slime trail,
 * and eat flowers. This class extends DefaultInsectBehavior to reuse the
 * flower interaction logic.
 */
export class SnailBehavior extends DefaultInsectBehavior {
    public update(insect: Insect, context: InsectBehaviorContext): void {
        const { currentTemperature } = context;

        if (this.handleHealthAndDeath(insect, context)) {
            return; // Snail died
        }

        // Initialize moveCooldown if it doesn't exist
        if (insect.moveCooldown === undefined) {
            insect.moveCooldown = 0;
        }

        if (currentTemperature < INSECT_DORMANCY_TEMP) {
            return;
        }

        // --- Cooldown Phase ---
        if (insect.moveCooldown > 0) {
            insect.moveCooldown--;
            // Even when on cooldown, still check for eating and regen stamina if idle
            const flowerOnCell = this.findFlowerOnCell(insect.x, insect.y, context);
            if (flowerOnCell) {
                this.handleInteraction(insect, flowerOnCell, context);
            } else {
                insect.stamina = Math.min(insect.maxStamina, insect.stamina + INSECT_STAMINA_REGEN_PER_TICK);
            }
            return; // Exit early if on cooldown
        }

        // --- Action & Movement Phase ---
        insect.moveCooldown = SNAIL_MOVE_COOLDOWN; // Reset cooldown for the next move

        let hasInteracted = false;
        const flowerOnCurrentCell = this.findFlowerOnCell(insect.x, insect.y, context);
        if (flowerOnCurrentCell) {
            this.handleInteraction(insect, flowerOnCurrentCell, context);
            hasInteracted = true;
        }
        
        const hasMoved = this.handleMovement(insect, hasInteracted, context);

        if (!hasInteracted && !hasMoved) {
            insect.stamina = Math.min(insect.maxStamina, insect.stamina + INSECT_STAMINA_REGEN_PER_TICK);
        }
    }

    // Override handleMovement to add slime trail creation
    protected handleMovement(insect: Insect, hasInteracted: boolean, context: InsectBehaviorContext): boolean {
        if (insect.stamina < INSECT_MOVE_COST) return false;

        const oldX = insect.x;
        const oldY = insect.y;

        // Use the parent's movement logic
        const movedByParent = super.handleMovement(insect, hasInteracted, context);
        
        if (movedByParent) {
            // Leave a slime trail at the old position
            const trailId = context.getNextId('slime', oldX, oldY);
            const slimeTrail: SlimeTrail = {
                id: trailId,
                type: 'slimeTrail',
                x: oldX,
                y: oldY,
                lifespan: SLIME_TRAIL_LIFESPAN,
            };
            context.newActorQueue.push(slimeTrail);
        }

        return movedByParent;
    }
}