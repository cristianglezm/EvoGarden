import type { SimulationParams, InsectStats } from './types';

export const TICK_RATE_MS = 250;

export const DEFAULT_SIM_PARAMS: SimulationParams = {
    gridWidth: 15,
    gridHeight: 10,
    initialFlowers: 30,
    initialInsects: 15,
    initialBirds: 0,
    humidity: 0.7, // 70%
    temperature: 20, // 20°C
    windDirection: 'S',
    windStrength: 3,
    flowerDetailRadius: 8,
    herbicideFlowerDensityThreshold: 0.95,
    herbicideDamage: 25,
    herbicideSmokeLifespan: 2,
    herbicideCooldown: 90,
    herbicideSmokeExpansionCount: 2,
    notificationMode: 'both',
    // Seasonal Cycle Parameters
    seasonLengthInTicks: 150,
    temperatureAmplitude: 15, // Varies by ±15°C from base
    humidityAmplitude: 0.25, // Varies by ±25% from base
    // Weather Event Parameters
    weatherEventChance: 0.008, // 0.8% chance per tick
    heatwaveTempIncrease: 10,
    coldsnapTempDecrease: 10,
    heavyRainHumidityIncrease: 0.2,
    droughtHumidityDecrease: 0.2,
    weatherEventMinDuration: 20, // Ticks
    weatherEventMaxDuration: 50, // Ticks
};

// --- FLOWER CONSTANTS ---
export const FLOWER_TICK_COST_MULTIPLIER = 0.08;
export const FLOWER_STAMINA_COST_PER_TICK = 1;
export const FLOWER_HEALTH_COST_PER_TICK = 2; // when stamina is 0
export const FLOWER_NUTRIENT_HEAL = 4;
export const SEED_HEALTH = 10;
export const WIND_POLLINATION_CHANCE = 0.005;
export const PROXIMITY_POLLINATION_CHANCE = 0.002;
export const FLOWER_EXPANSION_CHANCE = 0.001;

// --- NUTRIENT CONSTANTS ---
export const NUTRIENT_LIFESPAN = 2; // ticks
export const NUTRIENT_FROM_PREY_LIFESPAN = 4;
export const NUTRIENT_FROM_OLD_AGE_LIFESPAN = 5;

// --- BIRD CONSTANTS ---
export const BIRD_DROP_NUTRIENT_CHANCE = 0.05;

// --- INSECT CONSTANTS ---
export const INSECT_POLLINATION_CHANCE = 0.75;
export const TOXIC_FLOWER_THRESHOLD = 0.1;
export const INSECT_DAMAGE_FROM_TOXIC_FLOWER = 5;
export const INSECT_HEAL_FROM_HEALING_FLOWER = 5;
export const INSECT_DORMANCY_TEMP = 5; // 5°C

// New Insect Mechanics
export const INSECT_HEALTH_DECAY_PER_TICK = 0.2;
export const INSECT_STAMINA_REGEN_PER_TICK = 2;
export const INSECT_MOVE_COST = 2;
export const INSECT_ATTACK_COST = 4;
export const INSECT_REPRODUCTION_COOLDOWN = 1; // ticks
export const MUTATION_CHANCE = 0.05; // 5% chance per gene
export const MUTATION_AMOUNT = 0.2;  // Mutate by +/- 20%

// --- GENETIC ALGORITHM CONSTANTS ---
export const FLOWER_STAT_INDICES = {
    HEALTH: 0,
    STAMINA: 1,
    TOXICITY: 2,
    NUTRIENT_EFFICIENCY: 3,
    VITALITY: 4,
    AGILITY: 5,
    STRENGTH: 6,
    INTELLIGENCE: 7,
    LUCK: 8
};
export const INSECT_GENOME_LENGTH = Object.keys(FLOWER_STAT_INDICES).length;

// Defines the base stats for each insect type
export const INSECT_DATA: ReadonlyMap<string, InsectStats> = new Map([
    // Pollinators do minimal damage
    ['🦋', { role: 'pollinator', attack: 0, maxHealth: 100, maxStamina: 40, speed: 2, eggHatchTime: 15, reproductionCost: 5 }],
    // Attacker does more damage, but not enough to instantly kill flowers
    ['🐛', { role: 'attacker', attack: 5, maxHealth: 150, maxStamina: 30, speed: 1, eggHatchTime: 20, reproductionCost: 6 }],
    // Tank is slow and sturdy, low damage
    ['🐌', { role: 'tank', attack: 3, maxHealth: 250, maxStamina: 20, speed: 1, eggHatchTime: 25, reproductionCost: 3 }],
    // Balanced is a jack-of-all-trades
    ['🐞', { role: 'balanced', attack: 4, maxHealth: 120, maxStamina: 35, speed: 1, eggHatchTime: 18, reproductionCost: 5 }],
    // Bees are fast pollinators with slightly more damage than butterflies
    ['🐝', { role: 'pollinator', attack: 3, maxHealth: 110, maxStamina: 50, speed: 2, eggHatchTime: 12, reproductionCost: 5 }],
]);


// --- POPULATION CONTROL ---
export const POPULATION_TREND_WINDOW = 5;
export const POPULATION_GROWTH_THRESHOLD_INSECT = 0.02;
export const POPULATION_DECLINE_THRESHOLD_INSECT = 0.04;
export const BIRD_SPAWN_COOLDOWN = 5;
export const EAGLE_SPAWN_COOLDOWN = 8;
