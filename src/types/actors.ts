import type { Coord } from './base';

export interface Actor extends Coord {
    id: string;
    emoji?: string;
}

// Raw genetic effects from WASM
export interface FlowerEffects {
    vitality: number;
    agility: number;
    intelligence: number;
    strength: number;
    luck: number;
}

// The raw JSON object returned by the WASM getFlowerStats function
export interface FlowerGenomeStats {
    health: number; // This is maxHealth
    stamina: number; // This is maxStamina
    minTemperature: number;
    maxTemperature: number;
    maturationPeriod: number;
    sex: 'male' | 'female' | 'both';
    toxicityRate: number;
    effects: FlowerEffects;
}

// The processed stats used within the simulation
export interface FlowerStats {
    maxHealth: number;
    maxStamina: number;
    nutrientEfficiency: number;
    minTemperature: number;
    maxTemperature: number;
    maturationPeriod: number;
    sex: 'male' | 'female' | 'both';
    toxicityRate: number;
    effects: FlowerEffects;
}

export interface Flower extends Actor, FlowerStats {
    type: 'flower';
    genome: string;
    imageData: string;
    health: number; // Current health
    stamina: number; // Current stamina
    age: number;
    isMature: boolean;
}

export interface FlowerSeed extends Actor {
    type: 'flowerSeed';
    imageData: string;
    health: number;
    maxHealth: number;
    age: number;
}

export interface InsectStats {
    attack: number;
    maxHealth: number;
    maxStamina: number;
    speed: number;
    role: 'pollinator' | 'attacker' | 'tank' | 'balanced' | 'scavenger';
    eggHatchTime: number;
    reproductionCost: number; // stamina cost
}

export interface Insect extends Actor {
    type: 'insect';
    pollen: {
        genome: string;
        sourceFlowerId: string;
    } | null;
    emoji: string;
    health: number;
    maxHealth: number;
    stamina: number;
    maxStamina: number;
    genome: number[];
    lifespan?: number; // Kept for backwards compatibility with old saves
    reproductionCooldown?: number;
    healthEaten?: number; // For caterpillars
}

export interface Bird extends Actor {
    type: 'bird';
    target: {x: number, y: number} | null; // target insect coordinates
    patrolTarget: {x: number, y: number} | null;
}

export interface Eagle extends Actor {
    type: 'eagle';
    target: {x: number, y: number} | null; // target bird coordinates
}

export interface Nutrient extends Actor {
    type: 'nutrient';
    lifespan: number;
}

export interface Egg extends Actor {
    type: 'egg';
    hatchTimer: number;
    insectEmoji: string;
    genome: number[];
}

export interface Corpse extends Actor {
    type: 'corpse';
    originalEmoji: string;
    decayTimer: number;
}

export interface Cocoon extends Actor {
    type: 'cocoon';
    hatchTimer: number;
    butterflyGenome: number[];
}

export interface Cockroach extends Actor {
    type: 'cockroach';
    health: number;
    maxHealth: number;
    stamina: number;
    maxStamina: number;
    genome: number[];
    emoji: string;
    reproductionCooldown?: number;
}

export interface HerbicidePlane extends Actor {
    type: 'herbicidePlane';
    dx: number; // Current direction x
    dy: number; // Current direction y
    turnDx: number; // Direction to turn x
    turnDy: number; // Direction to turn y
    stride: number;
}

export interface HerbicideSmoke extends Actor {
    type: 'herbicideSmoke';
    lifespan: number;
    canBeExpanded: number;
}

// --- Placeholder types for saved state ---
export interface FlowerPlaceholder extends Actor {
    type: 'flower';
}

export interface InsectPlaceholder extends Actor {
    type: 'insect';
}

// --- Grid and State types ---
export type CellContent = Flower | Insect | Bird | Nutrient | Egg | Eagle | HerbicidePlane | HerbicideSmoke | FlowerSeed | Corpse | Cockroach | Cocoon;
export type SavedCellActor = FlowerPlaceholder | InsectPlaceholder | Bird | Nutrient | Egg | Eagle | HerbicidePlane | HerbicideSmoke | FlowerSeed | Corpse | Cockroach | Cocoon;

export type ActorAddDelta = {
    type: 'add';
    actor: CellContent;
};
export type ActorUpdateDelta = {
    type: 'update';
    id: string;
    changes: Partial<CellContent>;
};
export type ActorRemoveDelta = {
    type: 'remove';
    id: string;
};
export type ActorDelta = ActorAddDelta | ActorUpdateDelta | ActorRemoveDelta;
