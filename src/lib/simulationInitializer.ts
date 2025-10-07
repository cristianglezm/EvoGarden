import type { SimulationParams, CellContent, Flower, FEService, FlowerGenomeStats, Insect, Hive, AntColony } from '../types';
import { getInsectEmoji, generateRandomInsectGenome, ACTOR_NAMES } from '../utils';
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
    genome?: string, parentGenome2?: string,
    flowerId?: string,
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
        const id = flowerId || `flower-${x}-${y}-${Date.now()}`;

        return {
            id, type: 'flower', x, y,
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
    const { initialInsects, initialBirds, allowedActors } = params;
    const actors: CellContent[] = [];

    for (let i = 0; i < initialInsects; i++) {
        const id = `insect-init-${i}`;
        // Exclude social insects from random initial spawn and respect the whitelist
        const emoji = getInsectEmoji(id, { allowed: allowedActors, exclude: ['🐝', '🐜', '🕷️'] });
        
        if (emoji) {
            const baseStats = INSECT_DATA.get(emoji);
            if (baseStats) {
                const typeName = (ACTOR_NAMES[emoji] || 'insect').toLowerCase();
                const id = `insect-${typeName}-${-1}-${-1}-${Date.now() + i}`;
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
    }
    if (allowedActors.includes('🐦')) {
        for (let i = 0; i < initialBirds; i++) {
            actors.push({ id: `bird-init-${i}`, type: 'bird', x: -1, y: -1, target: null, patrolTarget: null });
        }
    }

    return actors;
};

export const initializeHivesAndBees = (actors: CellContent[], params: SimulationParams) => {
    const { gridWidth, gridHeight, hiveGridArea, hiveSpawnThreshold, hiveSpawnCost } = params;
    const hives: Hive[] = [];
    const bees = actors.filter(a => a.type === 'insect' && (a as Insect).emoji === '🐝') as Insect[];

    let hiveCounter = 1;

    for (let y = 0; y < gridHeight; y += hiveGridArea) {
        for (let x = 0; x < gridWidth; x += hiveGridArea) {
            const hiveX = x + Math.floor(Math.random() * hiveGridArea);
            const hiveY = y + Math.floor(Math.random() * hiveGridArea);

            if (hiveX < gridWidth && hiveY < gridHeight) {
                const hiveId = `hive-${hiveCounter}`;
                const newHive: Hive = {
                    id: hiveId,
                    type: 'hive',
                    x: hiveX,
                    y: hiveY,
                    hiveId: String(hiveCounter),
                    honey: hiveSpawnThreshold + (2 * hiveSpawnCost),
                    pollen: 0,
                    spawnCooldown: 0,
                    genome: generateRandomInsectGenome(),
                    storedBees: 0,
                };
                hives.push(newHive);
                actors.push(newHive); // Modifies the array in place
                hiveCounter++;
            }
        }
    }
    
    // Assign bees to the nearest hive. forEach is safe on an empty array.
    bees.forEach(bee => {
        let closestHive: Hive | null = null;
        let minDistance = Infinity;
        for (const hive of hives) {
            const distance = Math.hypot(bee.x - hive.x, bee.y - hive.y);
            if (distance < minDistance) {
                minDistance = distance;
                closestHive = hive;
            }
        }
        if (closestHive) {
            bee.hiveId = closestHive.hiveId;
        }
    });
};

export const initializeAntColonies = (actors: CellContent[], params: SimulationParams) => {
    const { gridWidth, gridHeight, colonyGridArea, antColonySpawnThreshold, antColonySpawnCost } = params;
    const colonies: AntColony[] = [];
    const ants = actors.filter(a => a.type === 'insect' && (a as Insect).emoji === '🐜') as Insect[];

    let colonyCounter = 1;

    // Create colonies on a grid, similar to hives
    for (let y = 0; y < gridHeight; y += colonyGridArea) {
        for (let x = 0; x < gridWidth; x += colonyGridArea) {
            const colonyX = x + Math.floor(Math.random() * colonyGridArea);
            const colonyY = y + Math.floor(Math.random() * colonyGridArea);

            if (colonyX < gridWidth && colonyY < gridHeight) {
                const colonyId = `colony-${colonyCounter}`;
                const newColony: AntColony = {
                    id: colonyId,
                    type: 'antColony',
                    x: colonyX,
                    y: colonyY,
                    colonyId: String(colonyCounter),
                    foodReserves: antColonySpawnThreshold + (2 * antColonySpawnCost),
                    spawnCooldown: 0,
                    genome: generateRandomInsectGenome(), // For pollen preference
                    storedAnts: 0,
                };
                colonies.push(newColony);
                actors.push(newColony); // Modifies the array in place
                colonyCounter++;
            }
        }
    }
    
    // Assign any pre-existing ants to the nearest colony.
    ants.forEach(ant => {
        let closestColony: AntColony | null = null;
        let minDistance = Infinity;
        for (const colony of colonies) {
            const distance = Math.hypot(ant.x - colony.x, ant.y - colony.y);
            if (distance < minDistance) {
                minDistance = distance;
                closestColony = colony;
            }
        }
        if (closestColony) {
            ant.colonyId = closestColony.colonyId;
        }
    });
};

export const initializeSpiders = (actors: CellContent[], params: SimulationParams) => {
    const { gridWidth, gridHeight, spiderGridArea } = params;
    const baseStats = INSECT_DATA.get('🕷️')!;

    for (let y = 0; y < gridHeight; y += spiderGridArea) {
        for (let x = 0; x < gridWidth; x += spiderGridArea) {
            const spiderX = x + Math.floor(Math.random() * spiderGridArea);
            const spiderY = y + Math.floor(Math.random() * spiderGridArea);

            if (spiderX < gridWidth && spiderY < gridHeight) {
                const id = `insect-spider-${spiderX}-${spiderY}-${Date.now()}`;
                const newSpider: Insect = {
                    id, type: 'insect', x: spiderX, y: spiderY,
                    pollen: null, emoji: '🕷️',
                    genome: generateRandomInsectGenome(),
                    health: baseStats.maxHealth, maxHealth: baseStats.maxHealth,
                    stamina: baseStats.maxStamina, maxStamina: baseStats.maxStamina
                };
                actors.push(newSpider);
            }
        }
    }
};