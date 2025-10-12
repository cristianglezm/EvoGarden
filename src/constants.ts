import type { SimulationParams, InsectStats } from './types';

export const BASE_TICK_RATE_MS = 250;

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
    simulationSpeed: 1,
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
    // Insect Evolution
    reproductionCooldown: 1,
    mutationChance: 0.05,
    mutationAmount: 0.2,
    // Hive Parameters
    hiveGridArea: 10,
    beeDormancyTemp: 10,
    beeWinterHoneyConsumption: 0.01,
    hivePollenToHoneyRatio: 0.5,
    hiveSpawnThreshold: 100,
    hiveSpawnCost: 20,
    territoryMarkLifespan: 100,
    signalTTL: 10,
    beePollinationWanderChance: 0.2,
    // Ant Colony Parameters
    colonyGridArea: 10,
    antDormancyTemp: 10,
    antColonySpawnThreshold: 100,
    antColonySpawnCost: 20,
    pheromoneLifespan: 200,
    pheromoneStrengthDecay: 0.05,
    // Spider Parameters
    spiderGridArea: 15,
    spiderWebStamina: 100,
    spiderWebStaminaRegen: 0.5,
    spiderWebBuildCost: 25,
    spiderMaxWebs: 5,
    spiderWebLifespan: 500,
    spiderWebStrength: 20,
    spiderWebTrapChance: 0.4,
    spiderEscapeChanceModifier: 0.5,
    // Permitted Actors
    allowedActors: ['🦋', '🐛', '🐌', '🐞', '🪲', '🦂', '🐝', '🐜', '🕷️', '🪳', '🐦', '🦅'],
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
export const NUTRIENT_FROM_COCKROACH_LIFESPAN = 2; // Lower quality nutrient
export const NUTRIENT_FROM_FLOWER_DEATH_LIFESPAN = 3; // From a flower killed by a cockroach
export const CORPSE_DECAY_TIME = 25; // ticks


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
export const INSECT_STAMINA_REGEN_PER_TICK = 4;
export const INSECT_STAMINA_GAIN_FROM_EATING = 4;
export const INSECT_MOVE_COST = 2;
export const INSECT_ATTACK_COST = 4;
export const INSECT_REPRODUCTION_COOLDOWN = 1; // ticks
export const MUTATION_CHANCE = 0.05; // 5% chance per gene
export const MUTATION_AMOUNT = 0.2;  // Mutate by +/- 20%
export const INSECT_WANDER_CHANCE = 0.1;

// --- CATERPILLAR & COCOON CONSTANTS ---
export const CATERPILLAR_EAT_AMOUNT_FOR_COCOON = 50;
export const COCOON_HATCH_TIME = 40; // ticks
export const LADYBUG_HEAL_FROM_CATERPILLAR = 20;


// --- BEETLE CONSTANTS ---
export const HEALTHY_FLOWER_THRESHOLD = 0.8;
export const WEAK_FLOWER_THRESHOLD = 0.5;
export const BEETLE_HEAL_AMOUNT = 20;
export const BEETLE_COLLECT_STAMINA_COST = 5;
export const BEETLE_DEPOSIT_STAMINA_COST = 5;

// --- COCKROACH CONSTANTS ---
export const COCKROACH_VISION_RANGE = 4;
export const COCKROACH_HEALTH_DECAY_PER_TICK = 0.5;
export const COCKROACH_STAMINA_REGEN_PER_TICK = 3;
export const COCKROACH_MOVE_STAMINA_COST = 1;
export const COCKROACH_MIN_STAMINA_TO_MOVE = 2;
export const CORPSE_NUTRITION_VALUE = 10; // Health/stamina restored to cockroach
export const COCKROACH_NUTRIENT_DROP_COOLDOWN = 3; // ticks

// --- SNAIL & SLIME CONSTANTS ---
export const SNAIL_MOVE_COOLDOWN = 3; // Snail only moves every 3 ticks
export const SLIME_TRAIL_LIFESPAN = 50; // ticks
export const SLIME_TRAIL_SLOW_FACTOR = 0.5; // Halves speed

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
    // Butterfly is a pure pollinator with no attack
    ['🦋', { role: 'pollinator', attack: 0, maxHealth: 100, maxStamina: 40, speed: 2, eggHatchTime: 15, reproductionCost: 5 }],
    // Caterpillar is a voracious attacker
    ['🐛', { role: 'attacker', attack: 8, maxHealth: 150, maxStamina: 30, speed: 1, eggHatchTime: 20, reproductionCost: 0 }], // Caterpillars don't reproduce
    // Tank is slow and sturdy, low damage
    ['🐌', { role: 'tank', attack: 3, maxHealth: 250, maxStamina: 20, speed: 1, eggHatchTime: 25, reproductionCost: 3 }],
    // Ladybugs are pest hunters
    ['🐞', { role: 'hunter', attack: 5, maxHealth: 120, maxStamina: 40, speed: 2, eggHatchTime: 18, reproductionCost: 5 }],
    // Bees are fast pollinators with slightly more damage than butterflies
    ['🐝', { role: 'pollinator', attack: 5, maxHealth: 60, maxStamina: 70, speed: 2, eggHatchTime: 12, reproductionCost: 0 }],
    // Cockroaches are scavengers that can also attack weak flowers
    ['🪳', { role: 'scavenger', attack: 2, maxHealth: 50, maxStamina: 50, speed: 1, eggHatchTime: 30, reproductionCost: 2 }],
    // Beetles are support tanks
    ['🪲', { role: 'support', attack: 1, maxHealth: 200, maxStamina: 50, speed: 1, eggHatchTime: 30, reproductionCost: 10 }],
    // Scorpions are ground predators
    ['🦂', { role: 'hunter', attack: 12, maxHealth: 220, maxStamina: 60, speed: 1, eggHatchTime: 35, reproductionCost: 15 }],
    // Ants are colony builders and scavengers
    ['🐜', { role: 'colony-builder', attack: 4, maxHealth: 80, maxStamina: 60, speed: 2, eggHatchTime: 10, reproductionCost: 5 }],
    // Spiders are trappers/hunters
    ['🕷️', { role: 'hunter', attack: 15, maxHealth: 180, maxStamina: 80, speed: 1, eggHatchTime: 20, reproductionCost: 20 }],
]);

// --- FOOD VALUES for Ants ---
export const FOOD_VALUE_CORPSE = 50;
export const FOOD_VALUE_EGG = 20;
export const FOOD_VALUE_COCOON = 30;
export const FOOD_VALUE_POLLEN = 5;
export const ANT_CARRY_CAPACITY = 20;
export const ANT_EAT_AMOUNT = 5;

// --- POPULATION CONTROL ---
export const POPULATION_TREND_WINDOW = 5;
export const POPULATION_GROWTH_THRESHOLD_INSECT = 0.02;
export const POPULATION_DECLINE_THRESHOLD_INSECT = 0.04;
export const POPULATION_GROWTH_THRESHOLD_CORPSE = 0.02;
export const POPULATION_DECLINE_THRESHOLD_CORPSE = 0.04;
export const BIRD_SPAWN_COOLDOWN = 5;
export const EAGLE_SPAWN_COOLDOWN = 8;
export const COCKROACH_SPAWN_COOLDOWN = 15;

// --- SCORPION CONSTANTS ---
export const SCORPION_HEAL_FROM_PREY = 30;

// --- SPIDER CONSTANTS ---
export const SPIDER_HEAL_FROM_PREY = 40;
