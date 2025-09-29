import type { Insect, Cockroach, Flower } from '../../../types';
import { 
    INSECT_HEALTH_DECAY_PER_TICK,
    INSECT_DATA,
    CORPSE_DECAY_TIME,
} from '../../../constants';
import { neighborVectors, scoreFlower } from '../../simulationUtils';
import { Rectangle } from '../../Quadtree';
import type { InsectBehaviorContext } from '../insectBehavior';

const INSECT_VISION_RANGE = 5;

/**
 * Abstract base class defining the contract for all insect behaviors.
 * It provides a common `update` method that all specialized behaviors must implement,
 * as well as a collection of reusable utility functions for common actions like
 * moving, eating, and finding targets.
 */
export abstract class InsectBehavior {
    /**
     * The main update method called by the simulation engine for each insect on every tick.
     * @param insect The insect actor to process.
     * @param context The current state of the simulation.
     */
    abstract update(insect: Insect | Cockroach, context: InsectBehaviorContext): void;

    /**
     * Handles the health decay and potential death of an insect at the start of its turn.
     * @returns `true` if the insect died, `false` otherwise.
     */
    protected handleHealthAndDeath(insect: Insect | Cockroach, context: InsectBehaviorContext): boolean {
        insect.health -= INSECT_HEALTH_DECAY_PER_TICK;
        if (insect.health <= 0) {
            context.nextActorState.delete(insect.id);
            const corpseId = `corpse-${insect.x}-${insect.y}-${Date.now()}`;
            context.nextActorState.set(corpseId, { 
                id: corpseId, type: 'corpse', x: insect.x, y: insect.y, 
                originalEmoji: insect.emoji, decayTimer: CORPSE_DECAY_TIME 
            });
            context.events.push({ message: `💀 A ${insect.emoji} died.`, type: 'info', importance: 'low' });
            context.incrementInsectsDiedOfOldAge();
            return true;
        }
        return false;
    }

    /**
     * Finds the best flower target for an insect based on its genome.
     */
    protected findBestFlowerTarget(insect: Insect | Cockroach, context: InsectBehaviorContext): Flower | null {
        const vision = new Rectangle(insect.x, insect.y, INSECT_VISION_RANGE, INSECT_VISION_RANGE);
        const nearbyFlowers = context.flowerQtree.query(vision)
            .map(p => p.data as Flower)
            .filter(f => context.nextActorState.has(f.id));

        if (nearbyFlowers.length === 0) {
            return null;
        }

        return nearbyFlowers.reduce((best, current) => {
            const currentScore = scoreFlower(insect, current);
            return (currentScore > best.score) ? { flower: current, score: currentScore } : best;
        }, { flower: null as Flower | null, score: -Infinity }).flower;
    }

    /**
     * Moves the insect towards a target coordinate, respecting its speed.
     * @returns `true` if the insect moved, `false` otherwise.
     */
    protected moveTowards(insect: Insect | Cockroach, target: { x: number, y: number }, context: InsectBehaviorContext): boolean {
        const baseStats = INSECT_DATA.get(insect.emoji)!;
        const dx = target.x - insect.x;
        const dy = target.y - insect.y;
        const distance = Math.hypot(dx, dy);

        if (distance > 0) {
            let moveX, moveY;
            if (distance <= baseStats.speed) {
                moveX = target.x;
                moveY = target.y;
            } else {
                moveX = insect.x + (dx / distance) * baseStats.speed;
                moveY = insect.y + (dy / distance) * baseStats.speed;
            }

            const nextX = Math.round(moveX);
            const nextY = Math.round(moveY);

            if (nextX >= 0 && nextX < context.params.gridWidth && nextY >= 0 && nextY < context.params.gridHeight) {
                insect.x = nextX;
                insect.y = nextY;
                return true;
            }
        }
        return false;
    }

    /**
     * Executes a random "wander" move to a neighboring cell.
     * @returns `true` if the insect moved, `false` if it was unable to find a valid cell.
     */
    protected wander(insect: Insect | Cockroach, context: InsectBehaviorContext): boolean {
        const moves = neighborVectors.sort(() => Math.random() - 0.5);
        for (const [dx, dy] of moves) {
            const potentialX = insect.x + dx;
            const potentialY = insect.y + dy;
            if (potentialX >= 0 && potentialX < context.params.gridWidth && potentialY >= 0 && potentialY < context.params.gridHeight) {
                insect.x = potentialX;
                insect.y = potentialY;
                return true;
            }
        }
        return false;
    }
}
