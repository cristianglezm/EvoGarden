import type { Insect, Flower, Hive, TerritoryMark, Corpse } from '../../../types';
import {
    INSECT_STAMINA_REGEN_PER_TICK,
    INSECT_MOVE_COST,
    INSECT_DATA,
    INSECT_ATTACK_COST,
    INSECT_POLLINATION_CHANCE,
    CORPSE_DECAY_TIME,
    FOOD_VALUE_CORPSE,
} from '../../../constants';
import { scoreFlower, findCellForFlowerSpawn, getActorsOnCell } from '../../simulationUtils';
import { InsectBehavior } from '../base/InsectBehavior';
import type { InsectBehaviorContext } from '../../../types';
import { propagateSignal } from '../../ecosystemManager';
import { Rectangle } from '../../Quadtree';

const BEE_VISION_RANGE = 7;

export class HoneybeeBehavior extends InsectBehavior {
    public update(insect: Insect, context: InsectBehaviorContext): void {
        insect.signalToSend = undefined; // Reset signal intent at the start of each turn
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

        this._updateTerritoryMark(insect, context);
    }

    private _updateTerritoryMark(insect: Insect, context: InsectBehaviorContext) {
        const { nextActorState, params, getNextId, qtree } = context;
        const markId = getNextId('territoryMark', insect.x, insect.y);
        let mark = nextActorState.get(markId) as TerritoryMark | undefined;

        // Determine if we need to overwrite an enemy mark
        const isEnemyMark = mark && mark.hiveId !== insect.hiveId;
        if (isEnemyMark) {
            insect.signalToSend = { type: 'UNDER_ATTACK', origin: { x: insect.x, y: insect.y } };
        }

        if (mark) {
            // Mark exists, update it (claim ownership if it was enemy's, refresh otherwise)
            mark.hiveId = insect.hiveId!;
            mark.lifespan = params.territoryMarkLifespan;
        } else {
            // No mark exists, create a new one and add it directly to the state
            const newMark: TerritoryMark = {
                id: markId, type: 'territoryMark', x: insect.x, y: insect.y,
                hiveId: insect.hiveId!, lifespan: params.territoryMarkLifespan,
            };
            nextActorState.set(markId, newMark);
            // This new actor won't be in the original qtree, but that's okay for signaling
            // within the same tick. For cross-tick interactions, it will be in the next tick's qtree.
            mark = newMark;
        }

        if (insect.signalToSend && mark.hiveId === insect.hiveId) {
            mark.signal = {
                type: insect.signalToSend.type,
                origin: insect.signalToSend.origin || { x: insect.x, y: insect.y },
                ttl: params.signalTTL
            };
            propagateSignal(mark, qtree, nextActorState, params);
        }
    }

    private _handleAttack(attacker: Insect, target: Insect, context: InsectBehaviorContext): void {
        if (attacker.stamina >= INSECT_ATTACK_COST) {
            const initialTargetHealth = target.health;
            attacker.stamina -= INSECT_ATTACK_COST;
            target.health -= INSECT_DATA.get('🐝')!.attack;

            if (target.health < initialTargetHealth) {
                context.events.push({ message: `A 🐝 from hive ${attacker.hiveId} attacked a rival bee.`, type: 'info', importance: 'low' });
            }

            if (target.health <= 0) {
                context.nextActorState.delete(target.id);
                const corpseId = context.getNextId('corpse', target.x, target.y);
                const foodValue = INSECT_DATA.get(target.emoji)?.maxHealth || FOOD_VALUE_CORPSE;
                const newCorpse: Corpse = { 
                    id: corpseId, type: 'corpse', x: target.x, y: target.y, 
                    originalEmoji: target.emoji, decayTimer: CORPSE_DECAY_TIME,
                    foodValue: foodValue 
                };
                context.nextActorState.set(corpseId, newCorpse);
                context.qtree.insert({ x: newCorpse.x, y: newCorpse.y, data: newCorpse });

                context.events.push({ message: `A 🐝 from hive ${attacker.hiveId} defeated a rival bee!`, type: 'info', importance: 'low' });

                attacker.behaviorState = 'seeking_food';
                attacker.targetId = undefined;
                attacker.targetPosition = undefined;
            }
        }
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
                this._updateTerritoryMark(insect, context); // Still leave a trail home
            }
        }
    }

    private checkForSignals(insect: Insect, context: InsectBehaviorContext) {
        const mark = this.getMarkOnCell(insect.x, insect.y, context);
        if (mark && mark.signal && mark.hiveId === insect.hiveId) {
            if (mark.signal.type === 'UNDER_ATTACK') {
                insect.behaviorState = 'hunting';
                insect.targetId = undefined; // Force find a new target
                insect.targetPosition = mark.signal.origin;
            } else if (mark.signal.type === 'ALL_CLEAR' && insect.behaviorState === 'hunting') {
                insect.behaviorState = 'seeking_food';
                insect.targetId = undefined;
                insect.targetPosition = undefined;
            }
        }
    }
    
    private handleInteraction(insect: Insect, context: InsectBehaviorContext): boolean {
        switch (insect.behaviorState) {
            case 'seeking_food': {
                const actorsOnCell = getActorsOnCell(context.qtree, context.nextActorState, insect.x, insect.y);
                const enemyOnCell = actorsOnCell.find((a: any) => a.type === 'insect' && (a as Insect).emoji === '🐝' && (a as Insect).hiveId !== insect.hiveId) as Insect | undefined;

                if (enemyOnCell) {
                    insect.behaviorState = 'hunting';
                    // Set the intent to signal aggression at the end of the turn.
                    insect.signalToSend = { type: 'UNDER_ATTACK' };
                    this._handleAttack(insect, enemyOnCell, context);
                    return true;
                }
                
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
                    this.handleDepositPollen(insect, hive, context);
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
                    this._handleAttack(insect, enemy, context);
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
                    } else if (insect.targetPosition) {
                        if (insect.x === insect.targetPosition.x && insect.y === insect.targetPosition.y) {
                            insect.targetPosition = undefined;
                            insect.behaviorState = 'seeking_food';
                            insect.signalToSend = { type: 'ALL_CLEAR' };
                            moved = this.wander(insect, context);
                        } else {
                            moved = this.moveTowards(insect, insect.targetPosition, context);
                        }
                    } else {
                        insect.behaviorState = 'seeking_food';
                        insect.signalToSend = { type: 'ALL_CLEAR' };
                    }
                    break;
                }
            }
        }
        
        if (moved) {
            insect.stamina -= INSECT_MOVE_COST;
            if (insect.behaviorState === 'hunting') {
                // Set the intent to signal aggression at the end of the turn.
                insect.signalToSend = { type: 'UNDER_ATTACK' };
            }
        }
        return moved;
    }

    private findHive(insect: Insect, context: InsectBehaviorContext): Hive | undefined {
        if (insect.hivePosition) {
            const actorsOnCell = getActorsOnCell(context.qtree, context.nextActorState, insect.hivePosition.x, insect.hivePosition.y);
            const hive = actorsOnCell.find((a: any) => a.type === 'hive' && (a as Hive).hiveId === insect.hiveId) as Hive | undefined;
            if (hive) return hive;
        }
        return Array.from(context.nextActorState.values()).find((a: any) => a.type === 'hive' && (a as Hive).hiveId === insect.hiveId) as Hive | undefined;
    }
    
    protected findFlowerOnCell(x: number, y: number, context: InsectBehaviorContext): Flower | undefined {
        return getActorsOnCell(context.qtree, context.nextActorState, x, y).find(
           (actor) => actor.type === 'flower'
       ) as Flower | undefined;
   }

    protected handlePollination(insect: Insect, flower: Flower, context: InsectBehaviorContext) {
        const { pollen } = insect;
        if (pollen && pollen.sourceFlowerId !== flower.id && flower.isMature && Math.random() < INSECT_POLLINATION_CHANCE) {
            const spawnSpot = findCellForFlowerSpawn(context.grid, context.params, { x: flower.x, y: flower.y }, context.claimedCellsThisTick);
            if (spawnSpot) {
                const seed = context.asyncFlowerFactory.requestNewFlower(context.nextActorState, spawnSpot.x, spawnSpot.y, flower.genome, pollen.genome, context.getNextId);
                if (seed) {
                    context.newActorQueue.push(seed);
                    context.claimedCellsThisTick.add(`flower-${spawnSpot.x}-${spawnSpot.y}`);
                }
            }
        }
    }

    private handleCollectPollen(insect: Insect, flower: Flower, context: InsectBehaviorContext) {
        this.handlePollination(insect, flower, context);
        let pollenScore = scoreFlower(insect, flower);
        pollenScore = Math.max(0, pollenScore);
        insect.pollen = { genome: flower.genome, sourceFlowerId: flower.id, score: pollenScore };
        if (pollenScore > 5) {
            // Set the intent to signal a good food source at the end of the turn.
            insect.signalToSend = { type: 'HIGH_VALUE_FLOWER_FOUND', origin: { x: flower.x, y: flower.y } };
        }
    }

    private handleDepositPollen(insect: Insect, hive: Hive, context: InsectBehaviorContext) {
        if (insect.pollen !== null) {
            const score = Number(insect.pollen?.score);
            if(score > 0){
                hive.pollen += score;
                const learningRate = Math.min(0.05, score / 500);
                if (hive.genome && hive.genome.length === insect.genome.length) {
                    for (let i = 0; i < hive.genome.length; i++) {
                        hive.genome[i] = (1 - learningRate) * hive.genome[i] + learningRate * insect.genome[i];
                    }
                }
            }
            insect.pollen = null;

            insect.health = insect.maxHealth;
            insect.stamina = insect.maxStamina;
            context.events.push({ message: `🐝 A bee delivered pollen and rested at its hive.`, type: 'info', importance: 'low' });
        }
    }
    
    private getMarkOnCell(x: number, y: number, context: InsectBehaviorContext): TerritoryMark | undefined {
        const markId = context.getNextId('territoryMark', x, y);
        const mark = context.nextActorState.get(markId);
        if (mark && mark.type === 'territoryMark') {
            return mark as TerritoryMark;
        }
        return undefined;
    }
    
    private findNearestEnemy(insect: Insect, context: InsectBehaviorContext): Insect | null {
        const vision = new Rectangle(insect.x, insect.y, BEE_VISION_RANGE, BEE_VISION_RANGE);
        const nearbyBees = context.qtree.query(vision)
            .map(p => p.data)
            .filter((a: any) => a.type === 'insect' && (a as Insect).emoji === '🐝' && (a as Insect).hiveId !== insect.hiveId && context.nextActorState.has(a.id)) as Insect[];

        if (nearbyBees.length === 0) return null;

        return nearbyBees.reduce((closest, current) => {
            const dist = Math.hypot(insect.x - current.x, insect.y - current.y);
            return dist < closest.dist ? { bee: current, dist } : closest;
        }, { bee: null as Insect | null, dist: Infinity }).bee;
    }
}
