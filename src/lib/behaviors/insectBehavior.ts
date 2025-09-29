import type { Insect, SimulationParams, Grid, CellContent, AppEvent, Cockroach } from '../../types';
import { Quadtree } from '../Quadtree';
import type { AsyncFlowerFactory } from '../asyncFlowerFactory';
import { InsectBehavior } from './base/InsectBehavior';
import { DefaultInsectBehavior } from './specialized/DefaultInsectBehavior';
import { CockroachBehavior } from './specialized/CockroachBehavior';

// The context object passed to each behavior's update method
export interface InsectBehaviorContext {
    params: SimulationParams;
    grid: Grid; // The original grid from the start of the tick
    nextActorState: Map<string, CellContent>;
    asyncFlowerFactory: AsyncFlowerFactory;
    qtree: Quadtree<CellContent>;
    flowerQtree: Quadtree<CellContent>;
    events: AppEvent[];
    incrementInsectsDiedOfOldAge: () => void;
    currentTemperature: number;
    newActorQueue: CellContent[];
}

// Map insect emojis to their specific behavior handlers
const behaviorMap: Map<string, InsectBehavior> = new Map<string, InsectBehavior>([
    ['🦋', new DefaultInsectBehavior()],
    ['🐛', new DefaultInsectBehavior()],
    ['🐌', new DefaultInsectBehavior()],
    ['🐞', new DefaultInsectBehavior()],
    ['🐝', new DefaultInsectBehavior()],
    ['🪳', new CockroachBehavior()],
]);

/**
 * Main entry point for processing an insect's tick.
 * This function acts as a dispatcher, looking up the appropriate behavior
 * strategy for the given insect type and executing it.
 */
export const processInsectTick = (
    insect: Insect | Cockroach,
    context: InsectBehaviorContext
) => {
    const behavior = behaviorMap.get(insect.emoji);
    if (behavior) {
        behavior.update(insect, context);
    } else {
        console.warn(`No behavior defined for insect emoji: ${insect.emoji}`);
    }
};
