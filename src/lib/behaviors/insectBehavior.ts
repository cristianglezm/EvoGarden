import type { Insect, SimulationParams, Grid, Flower, CellContent, Nutrient, AppEvent } from '../../types';
import { 
    INSECT_POLLINATION_CHANCE, 
    INSECT_DORMANCY_TEMP, 
    TOXIC_FLOWER_THRESHOLD, 
    INSECT_DAMAGE_FROM_TOXIC_FLOWER, 
    INSECT_HEAL_FROM_HEALING_FLOWER,
    INSECT_HEALTH_DECAY_PER_TICK,
    INSECT_STAMINA_REGEN_PER_TICK,
    INSECT_MOVE_COST,
    INSECT_ATTACK_COST,
    FLOWER_STAT_INDICES,
    INSECT_DATA,
    NUTRIENT_FROM_OLD_AGE_LIFESPAN
} from '../../constants';
import { findCellForFlowerSpawn, neighborVectors } from '../simulationUtils';
import { Quadtree, Rectangle } from '../Quadtree';
import type { AsyncFlowerFactory } from '../asyncFlowerFactory';

const INSECT_VISION_RANGE = 5;
const INSECT_WANDER_CHANCE = 0.2; // 20% chance to wander even if a target is found

export interface InsectContext {
    params: SimulationParams;
    grid: Grid; // The original grid from the start of the tick
    nextActorState: Map<string, CellContent>;
    asyncFlowerFactory: AsyncFlowerFactory;
    flowerQtree: Quadtree<CellContent>;
    events: AppEvent[];
    incrementInsectsDiedOfOldAge: () => void;
    currentTemperature: number;
}

const scoreFlower = (insect: Insect, flower: Flower): number => {
    const genome = insect.genome;
    let score = 0;
    score += (flower.health / flower.maxHealth) * genome[FLOWER_STAT_INDICES.HEALTH];
    score += (flower.stamina / flower.maxStamina) * genome[FLOWER_STAT_INDICES.STAMINA];
    score += flower.toxicityRate * genome[FLOWER_STAT_INDICES.TOXICITY]; // Negative toxicity is healing, so a negative weight here is good
    score += flower.nutrientEfficiency * genome[FLOWER_STAT_INDICES.NUTRIENT_EFFICIENCY];
    score += flower.effects.vitality * genome[FLOWER_STAT_INDICES.VITALITY];
    score += flower.effects.agility * genome[FLOWER_STAT_INDICES.AGILITY];
    score += flower.effects.strength * genome[FLOWER_STAT_INDICES.STRENGTH];
    score += flower.effects.intelligence * genome[FLOWER_STAT_INDICES.INTELLIGENCE];
    score += flower.effects.luck * genome[FLOWER_STAT_INDICES.LUCK];
    // Add a small distance penalty to prefer closer flowers among equally good options
    const dist = Math.hypot(insect.x - flower.x, insect.y - flower.y);
    score -= dist * 0.1;

    return score;
};

export const processInsectTick = (
    insect: Insect,
    context: InsectContext,
    newActorQueue: CellContent[]
) => {
    const { params, grid, nextActorState, asyncFlowerFactory, flowerQtree, events, incrementInsectsDiedOfOldAge, currentTemperature } = context;
    const { gridWidth, gridHeight } = params;
    
    const isCold = currentTemperature < INSECT_DORMANCY_TEMP;
    const costMultiplier = isCold ? 2 : 1;
    const moveCost = INSECT_MOVE_COST * costMultiplier;
    const attackCost = INSECT_ATTACK_COST * costMultiplier;

    insect.health -= INSECT_HEALTH_DECAY_PER_TICK;
    if (insect.health <= 0) {
        nextActorState.delete(insect.id);
        const nutrientId = `nutrient-${insect.x}-${insect.y}-${Date.now()}`;
        const nutrient: Nutrient = { id: nutrientId, type: 'nutrient', x: insect.x, y: insect.y, lifespan: NUTRIENT_FROM_OLD_AGE_LIFESPAN };
        nextActorState.set(nutrientId, nutrient);
        events.push({ message: `💀 A ${insect.emoji} died.`, type: 'info', importance: 'low' });
        incrementInsectsDiedOfOldAge();
        return;
    }
    
    if (insect.reproductionCooldown && insect.reproductionCooldown > 0) {
        insect.reproductionCooldown--;
    }

    const { x, y } = insect;
    const baseStats = INSECT_DATA.get(insect.emoji)!;
    
    // --- ACTION PHASE ---
    let hasInteracted = false;
    
    // 1. Check if we are on a flower to interact
    const flowerOnCurrentCell = grid[y][x].find(c => c.type === 'flower') as Flower | undefined;
    if (flowerOnCurrentCell && nextActorState.has(flowerOnCurrentCell.id) && insect.stamina >= attackCost) {
        const flowerState = nextActorState.get(flowerOnCurrentCell.id) as Flower;
        insect.stamina -= attackCost;
        hasInteracted = true;

        // Interaction logic (attack, heal, get poisoned)
        if (flowerState.toxicityRate < 0) {
            insect.health = Math.min(insect.maxHealth, insect.health + INSECT_HEAL_FROM_HEALING_FLOWER);
        } else if (flowerState.toxicityRate > TOXIC_FLOWER_THRESHOLD) {
            insect.health -= INSECT_DAMAGE_FROM_TOXIC_FLOWER;
            flowerState.health = Math.max(0, flowerState.health - (baseStats.attack / 2));
        } else {
            flowerState.health = Math.max(0, flowerState.health - baseStats.attack);
            insect.health = Math.min(insect.maxHealth, insect.health + (baseStats.attack * 0.5)); // Eat
        }
        
        // Pollination logic
        if (insect.pollen && insect.pollen.sourceFlowerId !== flowerState.id && flowerState.isMature && Math.random() < INSECT_POLLINATION_CHANCE) {
            const spawnSpot = findCellForFlowerSpawn(grid, params, {x, y});
            if (spawnSpot) {
                const seed = asyncFlowerFactory.requestNewFlower(nextActorState, spawnSpot.x, spawnSpot.y, flowerState.genome, insect.pollen.genome);
                if(seed) newActorQueue.push(seed);
            }
        }
        insect.pollen = { genome: flowerState.genome, sourceFlowerId: flowerState.id };
    }

    // 2. Movement Phase
    if (insect.stamina >= moveCost) {
        insect.stamina -= moveCost;

        const wander = () => {
            const moves = neighborVectors.sort(() => Math.random() - 0.5);
            for (const [dx, dy] of moves) {
                const potentialX = Math.round(x + dx * baseStats.speed); 
                const potentialY = Math.round(y + dy * baseStats.speed);
                if (potentialX >= 0 && potentialX < gridWidth && potentialY >= 0 && potentialY < gridHeight) {
                    insect.x = potentialX;
                    insect.y = potentialY;
                    return true; // Moved successfully
                }
            }
            return false; // Could not find a valid move
        };

        if (hasInteracted) {
            wander();
        } else {
            let moved = false;
            let target: { x: number, y: number } | null = null;

            const vision = new Rectangle(x, y, INSECT_VISION_RANGE, INSECT_VISION_RANGE);
            const nearbyFlowers = flowerQtree.query(vision).map(p => p.data as Flower).filter(f => nextActorState.has(f.id));

            if (nearbyFlowers.length > 0) {
                const bestFlower = nearbyFlowers.reduce((best, current) => {
                    const currentScore = scoreFlower(insect, current);
                    return (currentScore > best.score) ? { flower: current, score: currentScore } : best;
                }, { flower: null as Flower | null, score: -Infinity }).flower;
                
                if (bestFlower) {
                    target = { x: bestFlower.x, y: bestFlower.y };
                }
            }

            if (target && Math.random() > INSECT_WANDER_CHANCE) {
                const dx = target.x - x;
                const dy = target.y - y;
                const distance = Math.hypot(dx, dy);

                if (distance > 0) {
                    let moveX, moveY;
                    if (distance <= baseStats.speed) {
                        moveX = target.x;
                        moveY = target.y;
                    } else {
                        moveX = x + (dx / distance) * baseStats.speed;
                        moveY = y + (dy / distance) * baseStats.speed;
                    }

                    const nextX = Math.round(moveX);
                    const nextY = Math.round(moveY);

                    if (nextX >= 0 && nextX < gridWidth && nextY >= 0 && nextY < gridHeight) {
                        insect.x = nextX;
                        insect.y = nextY;
                        moved = true;
                    }
                }
            } 
            
            if (!moved) {
                wander();
            }
        }
    } else {
        // 3. Not enough stamina to move, so idle and regenerate
        insect.stamina = Math.min(insect.maxStamina, insect.stamina + INSECT_STAMINA_REGEN_PER_TICK);
    }
};
