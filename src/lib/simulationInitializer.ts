import type { SimulationParams, CellContent, Flower, FEService, FlowerGenomeStats, Insect } from '../types';
import { getInsectEmoji, generateRandomInsectGenome } from '../utils';
import { INSECT_DATA } from '../constants';

// Fallback values
const FALLBACK_MAX_HEALTH = 100;
const FALLBACK_MAX_STAMINA = 100;
const FALLBACK_MATURATION_AGE = 50;
const FALLBACK_NUTRIENT_EFFICIENCY = 1.0;

/**
 * This function encapsulates the logic for creating a new flower actor.
 * It is now executed exclusively within the flower.worker.ts context.
 */
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
        console.error("Flower Worker: Failed to create flower:", error);
        return null;
    }
};

/**
 * Creates the initial set of mobile actors (insects, birds) with placeholder coordinates.
 * The actual placement is handled by the simulation worker.
 */
export const createInitialMobileActors = (params: SimulationParams): CellContent[] => {
    const { initialInsects, initialBirds } = params;
    const actors: CellContent[] = [];

    for (let i = 0; i < initialInsects; i++) {
        const id = `insect-init-${i}`;
        const emoji = getInsectEmoji(id);
        const baseStats = INSECT_DATA.get(emoji);
        
        if (baseStats) {
            const newInsect: Insect = { 
                id, type: 'insect', x: -1, y: -1, 
                pollen: null, emoji, 
                genome: generateRandomInsectGenome(),
                health: baseStats.maxHealth,
                maxHealth: baseStats.maxHealth,
                stamina: baseStats.maxStamina,
                maxStamina: baseStats.maxStamina
            };
            actors.push(newInsect);
        }
    }
    for (let i = 0; i < initialBirds; i++) {
        actors.push({ id: `bird-init-${i}`, type: 'bird', x: -1, y: -1, target: null, patrolTarget: null });
    }

    return actors;
};
