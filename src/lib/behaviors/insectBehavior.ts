import type { Insect, Cockroach, InsectBehaviorContext } from '../../types';
import { InsectBehavior } from './base/InsectBehavior';
import { CockroachBehavior } from './specialized/CockroachBehavior';
import { CaterpillarBehavior } from './specialized/CaterpillarBehavior';
import { ButterflyBehavior } from './specialized/ButterflyBehavior';
import { BeetleBehavior } from './specialized/BeetleBehavior';
import { LadybugBehavior } from './specialized/LadybugBehavior';
import { SnailBehavior } from './specialized/SnailBehavior';
import { ScorpionBehavior } from './specialized/ScorpionBehavior';
import { HoneybeeBehavior } from './specialized/HoneybeeBehavior';
import { AntBehavior } from './specialized/AntBehavior';
import { SpiderBehavior } from './specialized/SpiderBehavior';

// Map insect emojis to their specific behavior handlers
const behaviorMap: Map<string, InsectBehavior> = new Map<string, InsectBehavior>([
    ['🦋', new ButterflyBehavior()],
    ['🐛', new CaterpillarBehavior()],
    ['🐌', new SnailBehavior()],
    ['🐞', new LadybugBehavior()],
    ['🐝', new HoneybeeBehavior()],
    ['🪳', new CockroachBehavior()],
    ['🪲', new BeetleBehavior()],
    ['🦂', new ScorpionBehavior()],
    ['🐜', new AntBehavior()],
    ['🕷️', new SpiderBehavior()],
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
    // Universal check: if an insect is trapped, it can't do anything else.
    if ('isTrapped' in insect && insect.isTrapped) {
        return;
    }

    const behavior = behaviorMap.get(insect.emoji);
    if (behavior) {
        behavior.update(insect, context);
    } else {
        console.warn(`No behavior defined for insect emoji: ${insect.emoji}`);
    }
};