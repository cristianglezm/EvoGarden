import type { Insect, SpiderWeb, Flower } from '../../../types';
import { 
    INSECT_DORMANCY_TEMP, 
    INSECT_STAMINA_REGEN_PER_TICK,
    INSECT_MOVE_COST,
    CORPSE_DECAY_TIME,
    FOOD_VALUE_CORPSE,
} from '../../../constants';
import { InsectBehavior } from '../base/InsectBehavior';
import type { InsectBehaviorContext } from '../../../types';
import { Rectangle } from '../../Quadtree';
import { SPIDER_HEAL_FROM_PREY, INSECT_DATA } from '../../../constants';
import { neighborVectors, scoreFlower, getActorsOnCell } from '../../simulationUtils';

const SPIDER_DECISION_COOLDOWN = 10;

export class SpiderBehavior extends InsectBehavior {
    public update(insect: Insect, context: InsectBehaviorContext): void {
        if (this.handleHealthAndDeath(insect, context)) return;
        if (context.currentTemperature < INSECT_DORMANCY_TEMP) return;

        // Initialize spider-specific state
        if (insect.webs === undefined) insect.webs = [];
        if (insect.webStamina === undefined) insect.webStamina = context.params.spiderWebStamina;
        if (insect.behaviorState === undefined) insect.behaviorState = 'ambushing';
        if (insect.decisionCooldown === undefined) insect.decisionCooldown = 0;
        
        // Regenerate web stamina (happens every tick)
        insect.webStamina = Math.min(context.params.spiderWebStamina, insect.webStamina + context.params.spiderWebStaminaRegen);

        // Cooldown logic
        if (insect.decisionCooldown > 0) {
            insect.decisionCooldown--;
            // Even on cooldown, spiders can still move if they have a target from the previous decision
            this.executeCurrentState(insect, context);
            return;
        }

        // If cooldown is 0, make a new decision, then execute
        this.decideNextAction(insect, context);
        insect.decisionCooldown = SPIDER_DECISION_COOLDOWN + Math.floor(Math.random() * 5);
        this.executeCurrentState(insect, context);
    }
    
    private decideNextAction(spider: Insect, context: InsectBehaviorContext): void {
        // --- High Priority Interruptions ---
        // 1. Check for trapped prey
        for (const webId of spider.webs!) {
            const web = context.nextActorState.get(webId) as SpiderWeb;
            if (web && web.trappedActorId) {
                spider.behaviorState = 'consuming';
                spider.targetId = web.id;
                return;
            }
        }
        
        // --- Strategic Decisions (when not consuming) ---
        const repairCost = context.params.spiderWebBuildCost / 2;

        if (spider.webStamina! < repairCost) {
            // Not enough stamina to build or repair, just ambush and recover.
            spider.behaviorState = 'ambushing';
            spider.targetId = undefined;
            spider.targetPosition = undefined;
            return;
        }
        
        // 2. Repair an old web
        const oldWeb = this.findOldWeb(spider, context);
        if (oldWeb && spider.webStamina! >= repairCost) {
            spider.behaviorState = 'repairing';
            spider.targetPosition = { x: oldWeb.x, y: oldWeb.y };
            spider.targetId = oldWeb.id;
            return;
        }

        // 3. Build a new web
        if (spider.webs!.length < context.params.spiderMaxWebs && spider.webStamina! >= context.params.spiderWebBuildCost) {
            const buildSpot = this.findWebExpansionSpot(spider, context);
            if (buildSpot) {
                spider.behaviorState = 'building';
                spider.targetPosition = buildSpot;
                spider.targetId = undefined; // No target ID, just a position
                return;
            }
        }
        
        // 4. Default: Ambush
        spider.behaviorState = 'ambushing';
        spider.targetId = undefined;
        spider.targetPosition = undefined;
    }

    private executeCurrentState(spider: Insect, context: InsectBehaviorContext) {
        let hasActed = false; // Moved or interacted

        switch (spider.behaviorState) {
            case 'building':
                if (spider.targetPosition) {
                    if (spider.x === spider.targetPosition.x && spider.y === spider.targetPosition.y) {
                        hasActed = this.buildWeb(spider, context);
                    } else {
                        hasActed = this.moveTowardsTarget(spider, spider.targetPosition, context);
                    }
                } else {
                    spider.behaviorState = 'ambushing'; // Invalid state, reset
                }
                break;
            
            case 'repairing':
                if (spider.targetPosition) {
                    if (spider.x === spider.targetPosition.x && spider.y === spider.targetPosition.y) {
                        hasActed = this.repairWeb(spider, context);
                    } else {
                        hasActed = this.moveTowardsTarget(spider, spider.targetPosition, context);
                    }
                } else {
                     spider.behaviorState = 'ambushing'; // Invalid state, reset
                }
                break;

            case 'consuming':
                const webToConsume = spider.targetId ? context.nextActorState.get(spider.targetId) as SpiderWeb : undefined;
                if (webToConsume && webToConsume.trappedActorId) {
                    if (spider.x === webToConsume.x && spider.y === webToConsume.y) {
                        hasActed = this.consume(spider, webToConsume, context);
                    } else {
                        hasActed = this.moveTowardsTarget(spider, webToConsume, context);
                    }
                } else {
                    spider.behaviorState = 'ambushing'; // Prey is gone
                    spider.targetId = undefined;
                }
                break;

            case 'ambushing':
                // Move to a random web in the network to wait.
                if (spider.webs!.length > 0) {
                    const randomWebId = spider.webs![Math.floor(Math.random() * spider.webs!.length)];
                    const targetWeb = context.nextActorState.get(randomWebId);
                    if (targetWeb && (spider.x !== targetWeb.x || spider.y !== targetWeb.y)) {
                         hasActed = this.moveTowardsTarget(spider, targetWeb, context);
                    }
                } else {
                    // No webs, wander to find a spot.
                    hasActed = this.moveTowardsTarget(spider, null, context);
                }
                break;
        }

        if (!hasActed) {
             spider.stamina = Math.min(spider.maxStamina, spider.stamina + INSECT_STAMINA_REGEN_PER_TICK);
        }
    }

    private moveTowardsTarget(spider: Insect, target: { x: number, y: number } | null, context: InsectBehaviorContext): boolean {
        if (spider.stamina < INSECT_MOVE_COST) return false;

        let moved = false;
        if (target) {
            moved = this.moveTowards(spider, target, context);
        } else {
            moved = this.wander(spider, context);
        }
        
        if (moved) {
            spider.stamina -= INSECT_MOVE_COST;
        }
        return moved;
    }
    
    private findOldWeb(spider: Insect, context: InsectBehaviorContext): SpiderWeb | null {
        const { nextActorState, params } = context;
        const OLD_WEB_LIFESPAN_THRESHOLD = params.spiderWebLifespan * 0.25;

        if (!spider.webs || spider.webs.length === 0) {
            return null;
        }

        let oldestWeb: SpiderWeb | null = null;
        let lowestLifespan = Infinity;

        for (const webId of spider.webs) {
            const web = nextActorState.get(webId) as SpiderWeb | undefined;
            if (web && web.lifespan < lowestLifespan) {
                lowestLifespan = web.lifespan;
                oldestWeb = web;
            }
        }

        if (oldestWeb && oldestWeb.lifespan < OLD_WEB_LIFESPAN_THRESHOLD) {
            return oldestWeb;
        }

        return null;
    }

    private findWebExpansionSpot(spider: Insect, context: InsectBehaviorContext): { x: number; y: number } | null {
        const { params, flowerQtree, qtree, nextActorState, claimedCellsThisTick } = context;
        const searchRadius = 3;
        
        const possibleSpots: { x: number; y: number }[] = [];

        // Check spider's current location first
        possibleSpots.push({ x: spider.x, y: spider.y });
        
        // Then check neighbors
        for (const [dx, dy] of neighborVectors) {
            const nx = spider.x + dx;
            const ny = spider.y + dy;
            if (nx >= 0 && nx < params.gridWidth && ny >= 0 && ny < params.gridHeight) {
                possibleSpots.push({ x: nx, y: ny });
            }
        }

        let bestSpot: { x: number; y: number } | null = null;
        let highestScore = -Infinity;

        // Evaluate all possible spots (current + neighbors)
        for (const spot of possibleSpots) {
            const claimKey = `spiderweb-${spot.x}-${spot.y}`;
            if (claimedCellsThisTick.has(claimKey)) {
                continue; // Skip already claimed spots
            }

            const actorsOnCell = getActorsOnCell(qtree, nextActorState, spot.x, spot.y);
            // A spot is valid if it doesn't have a web or another colony-like structure.
            if (actorsOnCell.some(a => a.type === 'spiderweb' || a.type === 'hive' || a.type === 'antColony')) {
                continue; // Skip invalid spots
            }

            let score = 0;
            const vision = new Rectangle(spot.x, spot.y, searchRadius, searchRadius);
            const nearbyFlowers = flowerQtree.query(vision).map(p => p.data as Flower);
            
            for (const flower of nearbyFlowers) {
                score += scoreFlower(spider, flower);
            }

            if (score > highestScore) {
                highestScore = score;
                bestSpot = spot;
            }
        }
        
        // Only build if the spot is considered "good enough"
        if (highestScore > 0) {
            return bestSpot;
        }

        return null;
    }

    private buildWeb(spider: Insect, context: InsectBehaviorContext): boolean {
        if (spider.webStamina! >= context.params.spiderWebBuildCost) {
            const claimKey = `spiderweb-${spider.x}-${spider.y}`;
            if (context.claimedCellsThisTick.has(claimKey)) {
                spider.behaviorState = 'ambushing';
                return false; // Cell was claimed by another actor this tick, abort.
            }

            const webId = context.getNextId('spiderweb', spider.x, spider.y);
            const newWeb: SpiderWeb = {
                id: webId, type: 'spiderweb', x: spider.x, y: spider.y,
                ownerId: spider.id, strength: context.params.spiderWebStrength,
                trappedActorId: null, lifespan: context.params.spiderWebLifespan,
            };
            context.newActorQueue.push(newWeb);
            context.claimedCellsThisTick.add(claimKey); // Claim the cell for this tick
            spider.webs!.push(webId);
            spider.webStamina! -= context.params.spiderWebBuildCost;
            context.events.push({ message: `🕷️ A spider built a web.`, type: 'info', importance: 'low' });
            spider.behaviorState = 'ambushing';
            return true;
        }
        spider.behaviorState = 'ambushing';
        return false;
    }
    
    private repairWeb(spider: Insect, context: InsectBehaviorContext): boolean {
        const { nextActorState, events, params } = context;
        const webOnCell = nextActorState.get(spider.targetId!) as SpiderWeb | undefined;
        
        const repairCost = params.spiderWebBuildCost / 2;

        if (webOnCell && spider.webStamina! >= repairCost) {
            webOnCell.lifespan = params.spiderWebLifespan;
            webOnCell.strength = params.spiderWebStrength;
            spider.webStamina! -= repairCost;
            events.push({ message: `🕷️ A spider repaired its web.`, type: 'info', importance: 'low' });
            spider.behaviorState = 'ambushing';
            spider.targetId = undefined;
            spider.targetPosition = undefined;
            return true;
        }

        spider.behaviorState = 'ambushing';
        return false;
    }

    private consume(spider: Insect, web: SpiderWeb, context: InsectBehaviorContext): boolean {
        const prey = context.nextActorState.get(web.trappedActorId!) as Insect;
        if (prey) {
            context.nextActorState.delete(prey.id);
            
            const corpseId = context.getNextId('corpse', prey.x, prey.y);
            const preyBaseStats = INSECT_DATA.get(prey.emoji);
            const foodValue = preyBaseStats ? preyBaseStats.maxHealth : FOOD_VALUE_CORPSE;
            context.newActorQueue.push({ id: corpseId, type: 'corpse', x: prey.x, y: prey.y, originalEmoji: prey.emoji, decayTimer: CORPSE_DECAY_TIME, foodValue });

            spider.health = Math.min(spider.maxHealth, spider.health + SPIDER_HEAL_FROM_PREY);
            spider.stamina = Math.min(spider.maxStamina, spider.stamina + SPIDER_HEAL_FROM_PREY);
            
            context.events.push({ message: `🕷️ A spider consumed a trapped ${prey.emoji}.`, type: 'info', importance: 'low' });
            
            web.trappedActorId = null;
            spider.targetId = undefined;
            spider.behaviorState = 'ambushing';
            return true;
        }
        return false;
    }
}
