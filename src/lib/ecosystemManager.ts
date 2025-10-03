import type { Grid, SimulationParams, CellContent, AppEvent, Insect, Nutrient, Flower, Egg, TerritoryMark } from '../types';
import { Quadtree, Rectangle } from './Quadtree';
import { FLOWER_NUTRIENT_HEAL, MUTATION_CHANCE, MUTATION_AMOUNT, INSECT_DATA, INSECT_REPRODUCTION_COOLDOWN } from '../constants';
import { findCellForStationaryActor, neighborVectors } from './simulationUtils';

export const processNutrientHealing = (nextActorState: Map<string, CellContent>, qtree: Quadtree<CellContent>): void => {
    const nutrientsToProcess = Array.from(nextActorState.values()).filter(a => a.type === 'nutrient') as Nutrient[];
    for (const nutrient of nutrientsToProcess) {
        if (!nextActorState.has(nutrient.id)) continue;

        const healArea = new Rectangle(nutrient.x, nutrient.y, 1.5, 1.5);
        const flowersToHeal = qtree.query(healArea).map(p => p.data).filter(a => a.type === 'flower' && nextActorState.has(a.id)) as Flower[];

        if (flowersToHeal.length > 0) {
            for (const flowerPoint of flowersToHeal) {
                const flower = nextActorState.get(flowerPoint.id) as Flower;
                const healAmount = FLOWER_NUTRIENT_HEAL * flower.nutrientEfficiency;
                flower.health = Math.min(flower.maxHealth, flower.health + healAmount);
                flower.stamina = Math.min(flower.maxStamina, flower.stamina + healAmount);
            }
            nextActorState.delete(nutrient.id);
        }
    }
};

export const propagateSignal = (startMark: TerritoryMark, nextActorState: Map<string, CellContent>, params: SimulationParams) => {
    if (!startMark.signal || startMark.signal.ttl <= 0) return;

    const queue: { mark: TerritoryMark; ttl: number }[] = [{ mark: startMark, ttl: startMark.signal.ttl }];
    const visited = new Set<string>([startMark.id]);

    while (queue.length > 0) {
        const { mark, ttl } = queue.shift()!;

        // Update the current mark with the signal, creating a new object
        // to avoid reference sharing issues.
        mark.signal = {
            type: startMark.signal.type,
            origin: startMark.signal.origin,
            ttl: ttl,
        };

        if (ttl > 0) {
            for (const [dx, dy] of neighborVectors) {
                const nx = mark.x + dx;
                const ny = mark.y + dy;

                if (nx >= 0 && nx < params.gridWidth && ny >= 0 && ny < params.gridHeight) {
                    const neighborActors = Array.from(nextActorState.values()).filter(a => a.x === nx && a.y === ny);
                    for (const actor of neighborActors) {
                        if (actor.type === 'territoryMark' && (actor as TerritoryMark).hiveId === startMark.hiveId && !visited.has(actor.id)) {
                            const neighborMark = actor as TerritoryMark;
                            // Check if the neighbor already has this signal or a stronger one
                            if (!neighborMark.signal || (neighborMark.signal.type === startMark.signal.type && neighborMark.signal.ttl < ttl - 1)) {
                                visited.add(neighborMark.id);
                                queue.push({ mark: neighborMark, ttl: ttl - 1 });
                            }
                        }
                    }
                }
            }
        }
    }
};


const createOffspringGenome = (genome1: number[], genome2: number[]): number[] => {
    const newGenome = genome1.map((gene, i) => {
        return Math.random() < 0.5 ? gene : genome2[i];
    });

    // Mutation
    for (let i = 0; i < newGenome.length; i++) {
        if (Math.random() < MUTATION_CHANCE) {
            newGenome[i] *= 1 + (Math.random() * MUTATION_AMOUNT * 2) - MUTATION_AMOUNT;
        }
    }
    return newGenome;
};

export const handleInsectReproduction = (
    nextActorState: Map<string, CellContent>,
    params: SimulationParams,
    events: AppEvent[]
): number => {
    let eggsLaidThisTick = 0;
    const { gridWidth, gridHeight } = params;

    const currentTickGrid: Grid = Array.from({ length: gridHeight }, () => Array.from({ length: gridWidth }, () => []));
    for (const actor of nextActorState.values()) {
        if (actor.x >= 0 && actor.x < gridWidth && actor.y >= 0 && actor.y < gridHeight) {
            currentTickGrid[actor.y][actor.x].push(actor);
        }
    }

    const boundary = new Rectangle(gridWidth / 2, gridHeight / 2, gridWidth / 2, gridHeight / 2);
    const insectQtree = new Quadtree<CellContent>(boundary, 4);
    const allInsects: Insect[] = [];
    
    for (const actor of nextActorState.values()) {
        if (actor.type === 'insect') {
            const insect = actor as Insect;
            // Honeybees do not reproduce directly; the hive does.
            if (insect.emoji === '🐝') continue;
            insectQtree.insert({ x: insect.x, y: insect.y, data: insect });
            allInsects.push(insect);
        }
    }
    
    const reproducedInsects = new Set<string>();
    for (const insect of allInsects) {
        if (reproducedInsects.has(insect.id) || insect.reproductionCooldown) continue;

        const baseStats = INSECT_DATA.get(insect.emoji);
        if (!baseStats || baseStats.reproductionCost === 0) continue; // Skip if no stats or cannot reproduce (e.g., caterpillar)

        // Check for partners on the same cell
        const range = new Rectangle(insect.x, insect.y, 0.5, 0.5);
        const partners = insectQtree.query(range).map(p => p.data as Insect).filter(other => other.id !== insect.id && other.emoji === insect.emoji && !reproducedInsects.has(other.id) && !other.reproductionCooldown);

        if (partners.length > 0 && insect.stamina >= baseStats.reproductionCost) {
            const partner = partners[0];
            const spot = findCellForStationaryActor(currentTickGrid, params, 'egg', { x: insect.x, y: insect.y });
            
            if (spot) {
                // Determine what the egg will hatch into
                const offspringEmoji = insect.emoji === '🦋' ? '🐛' : insect.emoji;

                const eggId = `egg-${spot.x}-${spot.y}-${Date.now()}`;
                const offspringGenome = createOffspringGenome(insect.genome, partner.genome);
                const newEgg: Egg = { 
                    id: eggId, type: 'egg', x: spot.x, y: spot.y, 
                    hatchTimer: baseStats.eggHatchTime, 
                    insectEmoji: offspringEmoji, 
                    genome: offspringGenome 
                };
                nextActorState.set(eggId, newEgg);
                
                insect.stamina -= baseStats.reproductionCost;
                insect.reproductionCooldown = INSECT_REPRODUCTION_COOLDOWN;
                partner.reproductionCooldown = INSECT_REPRODUCTION_COOLDOWN;

                eggsLaidThisTick++;
                reproducedInsects.add(insect.id).add(partner.id);
                events.push({ message: `${insect.emoji} laid an egg!`, type: 'info', importance: 'low' });
            }
        }
    }
    return eggsLaidThisTick;
};
