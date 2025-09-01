import type { SimulationParams } from './types';

export const TICK_RATE_MS = 250;

export const DEFAULT_SIM_PARAMS: SimulationParams = {
    gridWidth: 15,
    gridHeight: 10,
    initialFlowers: 30,
    initialInsects: 15,
    initialBirds: 3,
    humidity: 0.7, // 70%
    temperature: 20, // 20°C
    windDirection: 'S',
    windStrength: 2,
    flowerDetailRadius: 8,
};

// Flower stats like max health, stamina, and maturation age are now dynamic
// and calculated from the flower's genome via the WASM service.
// Fallback values are defined in src/lib/simulationEngine.ts.
// This is the overall energy consumption rate for flowers. Lower values make flowers live longer.
export const FLOWER_TICK_COST_MULTIPLIER = 0.5; 
export const FLOWER_STAMINA_COST_PER_TICK = 1;
export const FLOWER_HEALTH_COST_PER_TICK = 2; // when stamina is 0
export const FLOWER_NUTRIENT_HEAL = 4;

export const NUTRIENT_LIFESPAN = 5; // ticks
export const NUTRIENT_FROM_PREY_LIFESPAN = 15;
export const NUTRIENT_FROM_OLD_AGE_LIFESPAN = 10;

export const BIRD_DROP_NUTRIENT_CHANCE = 0.05;
export const INSECT_DAMAGE_TO_FLOWER = 2;
export const INSECT_POLLINATION_CHANCE = 0.75;
export const WIND_POLLINATION_CHANCE = 0.005;
export const PROXIMITY_POLLINATION_CHANCE = 0.002;
export const FLOWER_EXPANSION_CHANCE = 0.001;

// Insect lifecycle
export const INSECT_LIFESPAN = 100; // ticks
export const INSECT_REPRODUCTION_CHANCE = 0.65;
export const EGG_HATCH_TIME = 15; // ticks
