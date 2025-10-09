import type { Insect, Flower, PheromoneTrail, AntColony, Corpse, Egg, Cocoon } from '../../../types';
import { 
    INSECT_MOVE_COST,
    FOOD_VALUE_EGG,
    FOOD_VALUE_COCOON,
    FOOD_VALUE_POLLEN,
    INSECT_STAMINA_REGEN_PER_TICK,
    ANT_CARRY_CAPACITY,
    ANT_EAT_AMOUNT,
    INSECT_ATTACK_COST,
    INSECT_DATA,
    CORPSE_DECAY_TIME,
    FOOD_VALUE_CORPSE,
} from '../../../constants';
import { InsectBehavior } from '../base/InsectBehavior';
import type { InsectBehaviorContext } from '../insectBehavior';
import { Rectangle } from '../../Quadtree';
import { scoreFlower, getActorsOnCell } from '../../simulationUtils';
import { neighborVectors } from '../../simulationUtils';

const ANT_VISION_RANGE = 7;
const PREY_PRIORITY: ('corpse' | 'egg' | 'cocoon')[] = ['corpse', 'egg', 'cocoon'];

export class AntBehavior extends InsectBehavior {
    public update(insect: Insect, context: InsectBehaviorContext): void {
        if (this.handleHealthAndDeath(insect, context)) return;

        if (context.currentTemperature < context.params.antDormancyTemp) {
            this.handleDormancy(insect, context);
            return;
        }

        if (!insect.behaviorState) insect.behaviorState = 'seeking_food';

        this.checkForSignals(insect, context);
        
        this._handleEmergencyEat(insect, context);

        const hasInteracted = this.handleInteraction(insect, context);
        const hasMoved = this.handleMovement(insect, hasInteracted, context);

        if (!hasInteracted && !hasMoved) {
            insect.stamina = Math.min(insect.maxStamina, insect.stamina + INSECT_STAMINA_REGEN_PER_TICK);
        }
    }
    
    private handleDormancy(insect: Insect, context: InsectBehaviorContext) {
        const colony = this.findColony(insect, context);
        if (colony) {
            if (insect.x === colony.x && insect.y === colony.y) {
                // At colony, enter it for safety.
                if (colony.storedAnts === undefined) colony.storedAnts = 0;
                colony.storedAnts++;
                context.nextActorState.delete(insect.id); 
                context.events.push({ message: `🐜 An ant entered its colony to shelter from the cold.`, type: 'info', importance: 'low' });
            } else {
                insect.behaviorState = 'returning_to_colony';
                this.moveTowards(insect, colony, context);
            }
        }
    }

    private _handleEmergencyEat(insect: Insect, context: InsectBehaviorContext): void {
        if (
            insect.behaviorState === 'returning_to_colony' &&
            insect.carriedItem &&
            insect.carriedItem.value > 0 &&
            insect.stamina < INSECT_MOVE_COST
        ) {
            const amountToEat = Math.min(ANT_EAT_AMOUNT, insect.carriedItem.value);
            
            insect.carriedItem.value -= amountToEat;
            insect.stamina = Math.min(insect.maxStamina, insect.stamina + amountToEat);
            insect.health = Math.min(insect.maxHealth, insect.health + amountToEat);
            
            context.events.push({ message: `🐜 An ant ate some of its carried food for energy.`, type: 'info', importance: 'low' });

            if (insect.carriedItem.value <= 0) {
                insect.carriedItem = undefined;
                insect.behaviorState = 'seeking_food'; // Task failed, find new food
            }
        }
    }
    
    private checkForSignals(insect: Insect, context: InsectBehaviorContext) {
        const trail = this.getPheromoneOnCell(insect.x, insect.y, context);
        if (trail && trail.signal && trail.colonyId === insect.colonyId) {
            if (trail.signal.type === 'UNDER_ATTACK') {
                insect.behaviorState = 'hunting';
                insect.targetId = undefined; // Force find a new target
                insect.targetPosition = trail.signal.origin;
            }
        }
    }

    private handleInteraction(insect: Insect, context: InsectBehaviorContext): boolean {
        const actorsOnCell = getActorsOnCell(context.qtree, context.nextActorState, insect.x, insect.y);
        switch (insect.behaviorState) {
            case 'seeking_food': {
                const enemyOnCell = actorsOnCell.find((a: any) => a.type === 'insect' && (a as Insect).emoji === '🐜' && (a as Insect).colonyId !== insect.colonyId) as Insect | undefined;
                if (enemyOnCell) {
                    insect.behaviorState = 'hunting';
                    this.createSignal(insect, 'UNDER_ATTACK', context);
                    return true; // Interaction occurred, will attack next tick
                }

                const food = this.findFoodOnCell(insect, context);
                if (food) {
                    this.handleCollectFood(insect, food, context);
                    return true;
                }
                break;
            }
            case 'returning_to_colony': {
                const colony = this.findColony(insect, context);
                if (colony && insect.x === colony.x && insect.y === colony.y) {
                    this.handleDepositFood(insect, colony, context);
                    return true;
                }
                break;
            }
            case 'hunting': {
                const enemy = this.findNearestEnemy(insect, context);
                if (enemy && insect.x === enemy.x && insect.y === enemy.y) {
                    if (insect.stamina >= INSECT_ATTACK_COST) {
                        insect.stamina -= INSECT_ATTACK_COST;
                        const attackPower = INSECT_DATA.get('🐜')!.attack;
                        enemy.health -= attackPower;
                        context.events.push({ message: `An 🐜 from colony ${insect.colonyId} attacked an ant from colony ${enemy.colonyId}.`, type: 'info', importance: 'low' });

                        if (enemy.health <= 0) {
                            context.nextActorState.delete(enemy.id);
                            const corpseId = context.getNextId('corpse', enemy.x, enemy.y);
                            const foodValue = INSECT_DATA.get(enemy.emoji)?.maxHealth || FOOD_VALUE_CORPSE;
                            const newCorpse: Corpse = { 
                                id: corpseId, type: 'corpse', x: enemy.x, y: enemy.y, 
                                originalEmoji: enemy.emoji, decayTimer: CORPSE_DECAY_TIME,
                                foodValue: foodValue 
                            };
                            context.nextActorState.set(corpseId, newCorpse);
                            context.qtree.insert({ x: newCorpse.x, y: newCorpse.y, data: newCorpse });

                            insect.behaviorState = 'seeking_food'; // Go back to foraging
                            insect.targetId = undefined;
                        }
                    }
                    return true;
                }
                break;
            }
        }
        return false;
    }
    
    private findBestPheromoneTrail(insect: Insect, context: InsectBehaviorContext): { x: number, y: number, strength: number } | null {
        const { params } = context;
        let bestTrail: { x: number, y: number, strength: number } | null = null;
        
        const currentTrail = this.getPheromoneOnCell(insect.x, insect.y, context);
        let highestStrength = (currentTrail && currentTrail.colonyId === insect.colonyId) ? currentTrail.strength : -1;
    
        for (const [dx, dy] of neighborVectors) {
            const nx = insect.x + dx;
            const ny = insect.y + dy;
    
            if (nx >= 0 && nx < params.gridWidth && ny >= 0 && ny < params.gridHeight) {
                const trailOnCell = this.getPheromoneOnCell(nx, ny, context);
    
                if (trailOnCell && trailOnCell.colonyId === insect.colonyId) {
                    if (insect.lastPheromonePosition && nx === insect.lastPheromonePosition.x && ny === insect.lastPheromonePosition.y) {
                        continue;
                    }

                    if (trailOnCell.strength > highestStrength) {
                        highestStrength = trailOnCell.strength;
                        bestTrail = { x: nx, y: ny, strength: trailOnCell.strength };
                    }
                }
            }
        }
        return bestTrail;
    }

    private handleMovement(insect: Insect, hasInteracted: boolean, context: InsectBehaviorContext): boolean {
        if (insect.stamina < INSECT_MOVE_COST) return false;

        let moved = false;

        if (hasInteracted) {
            moved = this.wander(insect, context);
        } else {
            switch (insect.behaviorState) {
                case 'hunting': {
                    const enemy = this.findNearestEnemy(insect, context);
                    if (enemy) {
                        // If an enemy is in sight, prioritize attacking it.
                        moved = this.moveTowards(insect, enemy, context);
                    } else if (insect.targetPosition) {
                        // If no enemy is in sight, move towards the signal origin.
                        if (insect.x === insect.targetPosition.x && insect.y === insect.targetPosition.y) {
                            // Reached the origin, clear target and wander to search.
                            insect.targetPosition = undefined;
                            moved = this.wander(insect, context);
                        } else {
                            moved = this.moveTowards(insect, insect.targetPosition, context);
                        }
                    } else {
                        // No enemy and no target position, just wander and search.
                        moved = this.wander(insect, context);
                    }
                    break;
                }
                case 'returning_to_colony': {
                    const colony = this.findColony(insect, context);
                    if (colony) {
                        moved = this.moveTowards(insect, colony, context);
                    } else {
                        insect.behaviorState = 'seeking_food';
                        insect.carriedItem = undefined;
                        moved = this.wander(insect, context);
                    }
                    break;
                }
                case 'seeking_food': {
                    const bestTrailCell = this.findBestPheromoneTrail(insect, context);
                    if (bestTrailCell) {
                        insect.x = bestTrailCell.x;
                        insect.y = bestTrailCell.y;
                        moved = true;
                    } else {
                        const target = this.findNearestFood(insect, context);
                        if (target) {
                            moved = this.moveTowards(insect, target, context);
                        } else {
                            moved = this.wander(insect, context);
                        }
                    }
                    break;
                }
            }
        }
        
        if (moved) {
            insect.stamina -= INSECT_MOVE_COST;
            if (insect.behaviorState === 'returning_to_colony' && insect.carriedItem) {
                this.leavePheromoneTrail(insect, context);
            }
            if (insect.behaviorState === 'hunting') {
                this.createSignal(insect, 'UNDER_ATTACK', context);
            }
        }
    
        return moved;
    }

    private findFoodOnCell(insect: Insect, context: InsectBehaviorContext): Corpse | Egg | Cocoon | Flower | null {
        const actorsOnCell = getActorsOnCell(context.qtree, context.nextActorState, insect.x, insect.y);
        for (const type of PREY_PRIORITY) {
            const food = actorsOnCell.find((a: any) => {
                if (a.type !== type) return false;
                if (a.type === 'corpse') return (a as Corpse).foodValue > 0;
                return true;
            });
            if (food) return food as Corpse | Egg | Cocoon;
        }
        return actorsOnCell.find((a: any) => a.type === 'flower') as Flower || null;
    }
    
    private findNearestFood(insect: Insect, context: InsectBehaviorContext): Corpse | Egg | Cocoon | Flower | null {
        const vision = new Rectangle(insect.x, insect.y, ANT_VISION_RANGE, ANT_VISION_RANGE);
        
        for (const type of PREY_PRIORITY) {
            const potentialTargets = context.qtree.query(vision)
                .map(p => p.data)
                .filter((a: any) => {
                    if (a?.type !== type || !context.nextActorState.has(a.id)) return false;
                    if (a.type === 'corpse') return (a as Corpse).foodValue > 0;
                    return true;
                });
            
            if (potentialTargets.length > 0) {
                return potentialTargets.reduce((closest, current) => {
                    const dist = Math.hypot(insect.x - current.x, insect.y - current.y);
                    return dist < closest.dist ? { item: current, dist } : closest;
                }, { item: null as any, dist: Infinity }).item;
            }
        }

        return this.findBestFlowerTarget(insect, context);
    }
    
    private handleCollectFood(insect: Insect, food: Corpse | Egg | Cocoon | Flower, context: InsectBehaviorContext) {
        let itemType: 'corpse' | 'egg' | 'cocoon' | 'pollen' | null = null;
        let totalHarvestedValue = 0;
    
        if (food.type === 'corpse') {
            const corpse = food as Corpse;
            const amountToHarvest = Math.min(ANT_CARRY_CAPACITY, corpse.foodValue);
            if (amountToHarvest > 0) {
                itemType = 'corpse';
                totalHarvestedValue = amountToHarvest;
                corpse.foodValue -= amountToHarvest;
                if (corpse.foodValue <= 0) {
                    context.nextActorState.delete(corpse.id);
                    context.events.push({ message: `🐜 An ant finished scavenging a corpse.`, type: 'info', importance: 'low' });
                }
            }
        } else if (food.type === 'egg') {
            itemType = 'egg';
            totalHarvestedValue = FOOD_VALUE_EGG;
            context.nextActorState.delete(food.id);
        } else if (food.type === 'cocoon') {
            itemType = 'cocoon';
            totalHarvestedValue = FOOD_VALUE_COCOON;
            context.nextActorState.delete(food.id);
        } else if (food.type === 'flower') {
            const score = scoreFlower(insect, food);
            const pollenValue = Math.max(0, score) > 0 ? FOOD_VALUE_POLLEN : 0;
            if (pollenValue > 0) {
                itemType = 'pollen';
                totalHarvestedValue = pollenValue;
            }
        }
    
        if (itemType && totalHarvestedValue > 0) {
            const amountToEat = Math.min(ANT_EAT_AMOUNT, totalHarvestedValue);
            insect.health = Math.min(insect.maxHealth, insect.health + amountToEat);
            insect.stamina = Math.min(insect.maxStamina, insect.stamina + amountToEat);
            
            const amountToCarry = totalHarvestedValue - amountToEat;
    
            if (amountToCarry > 0) {
                insect.carriedItem = { type: itemType as 'corpse' | 'egg' | 'cocoon' | 'pollen', value: amountToCarry };
            }
            insect.behaviorState = 'returning_to_colony';
        }
    }
    
    private handleDepositFood(insect: Insect, colony: AntColony, context: InsectBehaviorContext) {
        if (insect.carriedItem) {
            insect.stamina = insect.maxStamina;
            colony.foodReserves += insect.carriedItem.value;
            context.events.push({ message: `🐜 An ant delivered ${insect.carriedItem.type} to its colony.`, type: 'info', importance: 'low' });
            insect.carriedItem = undefined;
        }
        insect.behaviorState = 'seeking_food';
        insect.lastPheromonePosition = null; // Reset memory after successful deposit
    }

    private findColony(insect: Insect, context: InsectBehaviorContext): AntColony | undefined {
        // Optimization: Use stored position if available
        if (insect.colonyPosition) {
            const actorsOnCell = getActorsOnCell(context.qtree, context.nextActorState, insect.colonyPosition.x, insect.colonyPosition.y);
            const colony = actorsOnCell.find((a: any) => a.type === 'antColony' && (a as AntColony).colonyId === insect.colonyId) as AntColony | undefined;
            if (colony) return colony;
        }
        // Fallback for old saves or if colony moved (it doesn't, but good practice)
        return Array.from(context.nextActorState.values()).find((a: any) => a.type === 'antColony' && (a as AntColony).colonyId === insect.colonyId) as AntColony | undefined;
    }
    
    private getPheromoneOnCell(x: number, y: number, context: InsectBehaviorContext): PheromoneTrail | undefined {
        return getActorsOnCell(context.qtree, context.nextActorState, x, y)
            .find((a: any) => a.type === 'pheromoneTrail') as PheromoneTrail | undefined;
    }
    
    private leavePheromoneTrail(insect: Insect, context: InsectBehaviorContext) {
        const strength = insect.carriedItem?.value || 1;
        
        const trailOnCell = this.getPheromoneOnCell(insect.x, insect.y, context);

        if (trailOnCell) {
            if (trailOnCell.colonyId === insect.colonyId) {
                trailOnCell.strength = Math.max(trailOnCell.strength, strength);
                trailOnCell.lifespan = context.params.pheromoneLifespan;
            } else {
                // Overwriting an enemy trail
                if (strength > trailOnCell.strength) {
                    trailOnCell.colonyId = insect.colonyId!;
                    trailOnCell.strength = strength;
                    trailOnCell.lifespan = context.params.pheromoneLifespan;
                    // Signal that we are taking over territory
                    this.createSignal(insect, 'UNDER_ATTACK', context);
                }
            }
        } else {
            const trailId = context.getNextId('pheromone', insect.x, insect.y);
            const newTrail: PheromoneTrail = {
                id: trailId, type: 'pheromoneTrail', x: insect.x, y: insect.y,
                colonyId: insect.colonyId!, lifespan: context.params.pheromoneLifespan,
                strength: strength
            };
            context.nextActorState.set(trailId, newTrail);
            context.qtree.insert({ x: insect.x, y: insect.y, data: newTrail });
            insect.lastPheromonePosition = { x: insect.x, y: insect.y };
        }
    }

    private createSignal(insect: Insect, type: 'UNDER_ATTACK' | 'HIGH_VALUE_FLOWER_FOUND', context: InsectBehaviorContext, origin?: { x: number, y: number }) {
        let trail = this.getPheromoneOnCell(insect.x, insect.y, context);
        // If no friendly trail, create one. Overwrite enemy trail if present.
        if (!trail || trail.colonyId !== insect.colonyId) {
            const trailId = context.getNextId('pheromone', insect.x, insect.y);
            const newTrail: PheromoneTrail = {
                id: trailId, type: 'pheromoneTrail', x: insect.x, y: insect.y,
                colonyId: insect.colonyId!, 
                lifespan: context.params.signalTTL + 5, // Lifespan should be at least as long as signal
                strength: 1 // Minimal strength just to exist
            };
            // If there was an enemy trail, remove it before adding our own.
            if (trail && trail.colonyId !== insect.colonyId) {
                context.nextActorState.delete(trail.id);
            }
            context.nextActorState.set(trailId, newTrail);
            // Important: also add to qtree so it can be found by getPheromoneOnCell in the same tick if needed.
            context.qtree.insert({ x: insect.x, y: insect.y, data: newTrail });
            trail = newTrail;
        }
    
        if (trail.colonyId === insect.colonyId) {
            trail.signal = { type, origin: origin || { x: insect.x, y: insect.y }, ttl: context.params.signalTTL };
        }
    }

    private findNearestEnemy(insect: Insect, context: InsectBehaviorContext): Insect | null {
        const vision = new Rectangle(insect.x, insect.y, ANT_VISION_RANGE, ANT_VISION_RANGE);
        const nearbyAnts = context.qtree.query(vision)
            .map(p => p.data)
            .filter((a: any) => a.type === 'insect' && (a as Insect).emoji === '🐜' && (a as Insect).colonyId !== insect.colonyId && context.nextActorState.has(a.id)) as Insect[];

        if (nearbyAnts.length === 0) return null;

        return nearbyAnts.reduce((closest, current) => {
            const dist = Math.hypot(insect.x - current.x, insect.y - current.y);
            return dist < closest.dist ? { ant: current, dist } : closest;
        }, { ant: null as Insect | null, dist: Infinity }).ant;
    }
}
