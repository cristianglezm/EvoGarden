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
                trail.signal = undefined; // Clear signal
            }
            trail.signal = undefined;
        }
    }

    private handleInteraction(insect: Insect, context: InsectBehaviorContext): boolean {
        switch (insect.behaviorState) {
            case 'seeking_food': {
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
            // Hunting interaction logic would go here
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

        // --- Pheromone Pathfinding Logic (Priority 1) ---
        const bestTrailCell = this.findBestPheromoneTrail(insect, context);
        if (bestTrailCell) {
            // Move to the cell with the strongest pheromone
            insect.x = bestTrailCell.x;
            insect.y = bestTrailCell.y;
            moved = true;
        }
        
        // --- Default Behavior (if no trail was followed) ---
        if (!moved) {
            if (hasInteracted) {
                 moved = this.wander(insect, context);
            } else {
                switch (insect.behaviorState) {
                    case 'seeking_food': {
                        const target = this.findNearestFood(insect, context);
                        if (target) {
                            moved = this.moveTowards(insect, target, context);
                        } else {
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
                     // Hunting movement logic would go here
                }
            }
        }
        
        if (moved) {
            insect.stamina -= INSECT_MOVE_COST;
            // Reinforce trail when returning with food.
            if (insect.behaviorState === 'returning_to_colony' && insect.carriedItem) {
                this.leavePheromoneTrail(insect, context);
            }
        }
    
        return moved;
    }

    private findFoodOnCell(insect: Insect, context: InsectBehaviorContext): Corpse | Egg | Cocoon | Flower | null {
        const actorsOnCell = getActorsOnCell(context.qtree, context.nextActorState, insect.x, insect.y);
        for (const type of PREY_PRIORITY) {
            const food = actorsOnCell.find(a => {
                if (a.type !== type) return false;
                if (a.type === 'corpse') return (a as Corpse).foodValue > 0;
                return true;
            });
            if (food) return food as Corpse | Egg | Cocoon;
        }
        return actorsOnCell.find(a => a.type === 'flower') as Flower || null;
    }
    
    private findNearestFood(insect: Insect, context: InsectBehaviorContext): Corpse | Egg | Cocoon | Flower | null {
        const vision = new Rectangle(insect.x, insect.y, ANT_VISION_RANGE, ANT_VISION_RANGE);
        
        for (const type of PREY_PRIORITY) {
            const potentialTargets = context.qtree.query(vision)
                .map(p => p.data)
                .filter(a => {
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
        // This is still O(N), but colonies are few. A better optimization would be a dedicated map.
        return Array.from(context.nextActorState.values()).find(a => a.type === 'antColony' && (a as AntColony).colonyId === insect.colonyId) as AntColony | undefined;
    }
    
    private getPheromoneOnCell(x: number, y: number, context: InsectBehaviorContext): PheromoneTrail | undefined {
        return getActorsOnCell(context.qtree, context.nextActorState, x, y)
            .find(a => a.type === 'pheromoneTrail') as PheromoneTrail | undefined;
    }
    
    private leavePheromoneTrail(insect: Insect, context: InsectBehaviorContext) {
        const strength = insect.carriedItem?.value || 1;
        // Only leave strong trails from valuable food, or weak "exploration" trails when returning home.
        // Don't leave trails when just wandering around seeking food.
        if (strength <= 1 && insect.behaviorState !== 'returning_to_colony') return; 
        
        const trailOnCell = this.getPheromoneOnCell(insect.x, insect.y, context);

        if (trailOnCell) {
            if (trailOnCell.colonyId === insect.colonyId) {
                // Reinforce existing friendly trail
                trailOnCell.strength = Math.max(trailOnCell.strength, strength);
                trailOnCell.lifespan = context.params.pheromoneLifespan;
            } else {
                // Overwrite weaker enemy trail
                if (strength > trailOnCell.strength) {
                    trailOnCell.colonyId = insect.colonyId!;
                    trailOnCell.strength = strength;
                    trailOnCell.lifespan = context.params.pheromoneLifespan;
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
        }
    }
}
