import type { Grid, SimulationParams, CellContent, Flower, FEService, FlowerGenomeStats, Coord } from '../types';
import { getInsectEmoji } from '../utils';
import { INSECT_LIFESPAN } from '../constants';

// Fallback values
const FALLBACK_MAX_HEALTH = 100;
const FALLBACK_MAX_STAMINA = 100;
const FALLBACK_MATURATION_AGE = 50;
const FALLBACK_NUTRIENT_EFFICIENCY = 1.0;

export const createNewFlower = async (
    flowerService: FEService, 
    params: SimulationParams, 
    x: number, y: number, 
    genome?: string, parentGenome2?: string
): Promise<Flower | null> => {
    try {
        let newFlowerData: { genome: string; image: string };
        const { humidity, temperature } = params;

        if (genome && parentGenome2) newFlowerData = await flowerService.reproduce(genome, parentGenome2);
        else if (genome) newFlowerData = await flowerService.mutate(genome);
        else newFlowerData = await flowerService.makeFlower();

        const stats: FlowerGenomeStats = await flowerService.getFlowerStats(newFlowerData.genome, humidity, temperature);
        const maxHealth = stats.health || FALLBACK_MAX_HEALTH;
        const maxStamina = stats.stamina || FALLBACK_MAX_STAMINA;
        const nutrientEfficiency = 1.0 + ((stats.effects?.vitality || 0) / 100) || FALLBACK_NUTRIENT_EFFICIENCY;
        const maturationPeriod = stats.maturationPeriod || FALLBACK_MATURATION_AGE;

        return {
            id: `flower-${x}-${y}-${Date.now()}`, type: 'flower', x, y,
            genome: newFlowerData.genome, imageData: newFlowerData.image, maxHealth, maxStamina,
            nutrientEfficiency, minTemperature: stats.minTemperature, maxTemperature: stats.maxTemperature,
            maturationPeriod, sex: stats.sex, toxicityRate: stats.toxicityRate, effects: stats.effects,
            health: maxHealth, stamina: maxStamina, age: 0, isMature: false,
        };
    } catch (error) {
        console.error("Engine: Failed to create flower:", error);
        return null;
    }
};


export const initializeGridState = async (params: SimulationParams, flowerService: FEService): Promise<Grid> => {
    const { gridHeight, gridWidth, initialFlowers, initialInsects, initialBirds } = params;
    const grid: Grid = Array.from({ length: gridHeight }, () => Array.from({ length: gridWidth }, () => []));

    const flowerCells: Coord[] = [];
    for (let y = 0; y < gridHeight; y++) {
        for (let x = 0; x < gridWidth; x++) {
            flowerCells.push({ x, y });
        }
    }
    flowerCells.sort(() => Math.random() - 0.5);

    const flowerPromises = [];
    for (let i = 0; i < initialFlowers; i++) {
        const pos = flowerCells.pop();
        if (pos) {
            flowerPromises.push(createNewFlower(flowerService, params, pos.x, pos.y));
        }
    }
    const flowers = await Promise.all(flowerPromises);
    flowers.forEach(flower => {
        if (flower) {
            grid[flower.y][flower.x].push(flower);
        }
    });

    const placeMobileActor = (actor: CellContent) => {
        for (let i = 0; i < 100; i++) {
            const x = Math.floor(Math.random() * gridWidth);
            const y = Math.floor(Math.random() * gridHeight);
            if (!grid[y][x].some(c => c.type === 'bird' || c.type === 'insect')) {
                actor.x = x; actor.y = y;
                grid[y][x].push(actor);
                return;
            }
        }
        const x = Math.floor(Math.random() * gridWidth);
        const y = Math.floor(Math.random() * gridHeight);
        actor.x = x; actor.y = y;
        grid[y][x].push(actor);
    };

    for (let i = 0; i < initialInsects; i++) {
        const id = `insect-init-${i}`;
        const emoji = getInsectEmoji(id);
        placeMobileActor({ id, type: 'insect', x: 0, y: 0, pollen: null, emoji, lifespan: INSECT_LIFESPAN });
    }
    for (let i = 0; i < initialBirds; i++) {
        placeMobileActor({ id: `bird-init-${i}`, type: 'bird', x: 0, y: 0, target: null, patrolTarget: null });
    }

    return grid;
};
