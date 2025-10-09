import type { Insect, Flower, Hive, TerritoryMark } from '../../../types';
import { 
    INSECT_STAMINA_REGEN_PER_TICK,
    INSECT_MOVE_COST,
    INSECT_DATA,
    INSECT_ATTACK_COST,
    INSECT_POLLINATION_CHANCE,
} from '../../../constants';
import { scoreFlower, findCellForFlowerSpawn, getActorsOnCell } from '../../simulationUtils';
import { InsectBehavior } from '../base/InsectBehavior';
import type { InsectBehaviorContext } from '../insectBehavior';
import { propagateSignal } from '../../ecosystemManager';
import { Rectangle } from '../../Quadtree';

const BEE_VISION_RANGE = 7;

export class HoneybeeBehavior extends InsectBehavior {
    public update(insect: Insect, context: InsectBehaviorContext): void {
        if (this.handleHealthAndDeath(insect, context)) return;

        // Dormancy logic for winter/cold
        if (context.currentTemperature < context.params.beeDormancyTemp) {
            this.handleDormancy(insect, context);
            return;
        }

        if (!insect.behaviorState) insect.behaviorState = 'seeking_food';
        if (insect.reproductionCooldown && insect.reproductionCooldown > 0) insect.reproductionCooldown--;

        this.checkForSignals(insect, context);
        
        let hasInteracted = false;
        let hasMoved = false;

        hasInteracted = this.handleInteraction(insect, context);
        hasMoved = this.handleMovement(insect, hasInteracted, context);
        
        if (!hasInteracted && !hasMoved) {
            insect.stamina = Math.min(insect.maxStamina, insect.stamina + INSECT_STAMINA_REGEN_PER_TICK);
        }

        this.leaveTerritoryMark(insect, context);
    }

    private handleDormancy(insect: Insect, context: InsectBehaviorContext) {
        const hive = this.findHive(insect, context);
        if (hive) {
            if (insect.x === hive.x && insect.y === hive.y) {
                // At hive, enter it for safety.
                hive.honey = Math.max(0, hive.honey - context.params.beeWinterHoneyConsumption);
                if (hive.storedBees === undefined) {
                    hive.storedBees = 0;
                }
                hive.storedBees++;
                context.nextActorState.delete(insect.id); // Bee is now safe inside the hive.
                context.events.push({ message: `🐝 A bee entered its hive to shelter from the cold.`, type: 'info', importance: 'low' });

            } else {
                // Not at hive, set state to return and move
                insect.behaviorState = 'returning_to_hive';
                this.moveTowards(insect, hive, context);
                this.leaveTerritoryMark(insect, context); // Still leave a trail home
            }
        }
    }

    private checkForSignals(insect: Insect, context: InsectBehaviorContext) {
        const mark = this.getMarkOnCell(insect.x, insect.y, context);
        if (mark && mark.signal && mark.hiveId === insect.hiveId) {
            if (mark.signal.type === 'UNDER_ATTACK') {
                insect.behaviorState = 'hunting';
                insect.targetId = undefined; // Force find a new target
                mark.signal = undefined; // Clear signal
            }
            // Clear other signals after reading
            mark.signal = undefined;
        }
    }
    
    private handleInteraction(insect: Insect, context: InsectBehaviorContext): boolean {
        switch (insect.behaviorState) {
            case 'seeking_food': {
                const flowerOnCell = this.findFlowerOnCell(insect.x, insect.y, context);
                if (flowerOnCell) {
                    this.handleCollectPollen(insect, flowerOnCell, context);
                    insect.behaviorState = 'returning_to_hive';
                    return true;
                }
                break;
            }
            case 'returning_to_hive': {
                const hive = this.findHive(insect, context);
                if (hive && insect.x === hive.x && insect.y === hive.y) {
                    this.handleDepositPollen(insect, hive);
                    insect.behaviorState = 'seeking_food';
                    return true;
                }
                const flowerOnCell = this.findFlowerOnCell(insect.x, insect.y, context);
                if (flowerOnCell) {
                    this.handlePollination(insect, flowerOnCell, context);
                }
                break;
            }
            case 'hunting': {
                const enemy = this.findNearestEnemy(insect, context);
                if (enemy && insect.x === enemy.x && insect.y === enemy.y) {
                    if (insect.stamina >= INSECT_ATTACK_COST) {
                        insect.stamina -= Math.max(0, INSECT_ATTACK_COST);
                        enemy.health -= Math.max(0, INSECT_DATA.get('🐝')!.attack);
                        this.createSignal(insect, 'UNDER_ATTACK', context);
                    }
                    return true;
                }
                break;
            }
        }
        return false;
    }

    private handleMovement(insect: Insect, hasInteracted: boolean, context: InsectBehaviorContext): boolean {
        if (insect.stamina < INSECT_MOVE_COST) {
            return false;
        }

        let moved = false;
        if (hasInteracted) {
             moved = this.wander(insect, context);
        } else {
            switch (insect.behaviorState) {
                case 'seeking_food': {
                    const target = this.findBestFlowerTarget(insect, context);
                    if (target) {
                        moved = this.moveTowards(insect, target, context);
                    } else {
                        moved = this.wander(insect, context);
                    }
                    break;
                }
                case 'returning_to_hive': {
                    const hive = this.findHive(insect, context);
                    if (hive) {
                         if (Math.random() < context.params.beePollinationWanderChance) {
                             moved = this.wander(insect, context);
                         } else {
                             moved = this.moveTowards(insect, hive, context);
                         }
                    } else {
                        insect.behaviorState = 'seeking_food';
                        moved = this.wander(insect, context);
                    }
                    break;
                }
                case 'hunting': {
                    const enemy = this.findNearestEnemy(insect, context);
                    if (enemy) {
                        moved = this.moveTowards(insect, enemy, context);
                    } else {
                        insect.behaviorState = 'seeking_food';
                    }
                    break;
                }
            }
        }
        
        if (moved) {
            insect.stamina -= INSECT_MOVE_COST;
        }
        return moved;
    }

    private findHive(insect: Insect, context: InsectBehaviorContext): Hive | undefined {
        // Optimization: Use stored position if available
        if (insect.hivePosition) {
            const actorsOnCell = getActorsOnCell(context.qtree, context.nextActorState, insect.hivePosition.x, insect.hivePosition.y);
            const hive = actorsOnCell.find(a => a.type === 'hive' && (a as Hive).hiveId === insect.hiveId) as Hive | undefined;
            if (hive) return hive;
        }
        // Fallback for old saves or if hive moved (it doesn't, but good practice)
        return Array.from(context.nextActorState.values()).find(a => a.type === 'hive' && (a as Hive).hiveId === insect.hiveId) as Hive | undefined;
    }
    
    private findFlowerOnCell(x: number, y: number, context: InsectBehaviorContext): Flower | undefined {
        return getActorsOnCell(context.qtree, context.nextActorState, x, y).find(
           (actor) => actor.type === 'flower'
       ) as Flower | undefined;
   }

    private handlePollination(insect: Insect, flower: Flower, context: InsectBehaviorContext) {
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

    private handleCollectPollen(insect: Insect, flower: Flower, context: InsectBehaviorContext) {
        this.handlePollination(insect, flower, context);
        let pollenScore = scoreFlower(insect, flower);
        // Pollen collected cannot be negative. If a bee dislikes a flower, it gets no resources from it.
        pollenScore = Math.max(0, pollenScore);
        insect.pollen = { genome: flower.genome, sourceFlowerId: flower.id, score: pollenScore };
        if (pollenScore > 5) {
            this.createSignal(insect, 'HIGH_VALUE_FLOWER_FOUND', context, { x: flower.x, y: flower.y });
        }
    }

    private handleDepositPollen(insect: Insect, hive: Hive) {
        if (insect.pollen !== null) {
            const score = Number(insect.pollen?.score);
            if(score > 0){
                hive.pollen += score;
                // Nudge the hive's genome towards the successful bee's genome
                // The higher the score, the more influence it has.
                // Normalize score to a small learning rate, capped at 5%
                const learningRate = Math.min(0.05, score / 500);
                if (hive.genome && hive.genome.length === insect.genome.length) {
                    for (let i = 0; i < hive.genome.length; i++) {
                        hive.genome[i] = (1 - learningRate) * hive.genome[i] + learningRate * insect.genome[i];
                    }
                }
            }
            insect.pollen = null;
        }
    }
    
    private leaveTerritoryMark(insect: Insect, context: InsectBehaviorContext) {
        const markOnCell = this.getMarkOnCell(insect.x, insect.y, context);
        if (markOnCell) {
            if (markOnCell.hiveId !== insect.hiveId) {
                // Overwrite enemy mark
                markOnCell.hiveId = insect.hiveId!;
                markOnCell.lifespan = context.params.territoryMarkLifespan;
                markOnCell.signal = undefined;
            } else {
                // Refresh friendly mark
                markOnCell.lifespan = context.params.territoryMarkLifespan;
            }
        } else {
            // Create a new mark
            const markId = context.getNextId('mark', insect.x, insect.y);
            const newMark: TerritoryMark = {
                id: markId, type: 'territoryMark', x: insect.x, y: insect.y,
                hiveId: insect.hiveId!, lifespan: context.params.territoryMarkLifespan,
            };
            context.nextActorState.set(markId, newMark);
            context.qtree.insert({ x: insect.x, y: insect.y, data: newMark });
        }
    }

    private getMarkOnCell(x: number, y: number, context: InsectBehaviorContext): TerritoryMark | undefined {
        return getActorsOnCell(context.qtree, context.nextActorState, x, y)
            .find(a => a.type === 'territoryMark') as TerritoryMark | undefined;
    }

    private createSignal(insect: Insect, type: 'UNDER_ATTACK' | 'HIGH_VALUE_FLOWER_FOUND', context: InsectBehaviorContext, origin?: { x: number, y: number }) {
        const mark = this.getMarkOnCell(insect.x, insect.y, context);
        if (mark && mark.hiveId === insect.hiveId) {
            mark.signal = { type, origin: origin || { x: insect.x, y: insect.y }, ttl: context.params.signalTTL };
            propagateSignal(mark, context.nextActorState, context.params);
        }
    }
    
    private findNearestEnemy(insect: Insect, context: InsectBehaviorContext): Insect | null {
        const vision = new Rectangle(insect.x, insect.y, BEE_VISION_RANGE, BEE_VISION_RANGE);
        const nearbyBees = context.qtree.query(vision)
            .map(p => p.data)
            .filter(a => a.type === 'insect' && (a as Insect).emoji === '🐝' && (a as Insect).hiveId !== insect.hiveId && context.nextActorState.has(a.id)) as Insect[];

        if (nearbyBees.length === 0) return null;

        return nearbyBees.reduce((closest, current) => {
            const dist = Math.hypot(insect.x - current.x, insect.y - current.y);
            return dist < closest.dist ? { bee: current, dist } : closest;
        }, { bee: null as Insect | null, dist: Infinity }).bee;
    }
}
