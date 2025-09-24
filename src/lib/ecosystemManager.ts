import type { Grid, SimulationParams, CellContent, AppEvent, Insect, Nutrient, Flower } from '../types';
import { Quadtree, Rectangle } from './Quadtree';
import { FLOWER_NUTRIENT_HEAL, INSECT_REPRODUCTION_CHANCE, EGG_HATCH_TIME, INSECT_REPRODUCTION_COOLDOWN } from '../constants';
import { findCellForStationaryActor } from './simulationUtils';

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

export const handleInsectReproduction = (
    nextActorState: Map<string, CellContent>,
    params: SimulationParams,
    events: AppEvent[]
): number => {
    let eggsLaidThisTick = 0;
    const { gridWidth, gridHeight } = params;

    // Create a temporary grid based on the current state of this tick's actors
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
            insectQtree.insert({ x: insect.x, y: insect.y, data: insect });
            allInsects.push(insect);
        }
    }
    
    const reproducedInsects = new Set<string>();
    for (const insect of allInsects) {
        if (reproducedInsects.has(insect.id) || insect.reproductionCooldown) continue;

        const range = new Rectangle(insect.x, insect.y, 0.5, 0.5);
        const partners = insectQtree.query(range).map(p => p.data as Insect).filter(other => other.id !== insect.id && other.emoji === insect.emoji && !reproducedInsects.has(other.id) && !other.reproductionCooldown);

        if (partners.length > 0 && Math.random() < INSECT_REPRODUCTION_CHANCE) {
            // Use the temporary, up-to-date grid for placement checks
            const spot = findCellForStationaryActor(currentTickGrid, params, 'egg', { x: insect.x, y: insect.y });
            const partner = partners[0];
            if (spot) {
                const eggId = `egg-${spot.x}-${spot.y}-${Date.now()}`;
                nextActorState.set(eggId, { id: eggId, type: 'egg', x: spot.x, y: spot.y, hatchTimer: EGG_HATCH_TIME, insectEmoji: insect.emoji });
                
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
