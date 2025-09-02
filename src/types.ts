export type WindDirection = 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW';

export interface SimulationParams {
    gridWidth: number;
    gridHeight: number;
    initialFlowers: number;
    initialInsects: number;
    initialBirds: number;
    humidity: number;
    temperature: number;
    windDirection: WindDirection;
    windStrength: number;
    flowerDetailRadius: number;
}

export interface Coord {
    x: number;
    y: number;
}

export interface Actor extends Coord {
    id: string;
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

export interface Insect extends Actor {
    type: 'insect';
    pollen: {
        genome: string;
        sourceFlowerId: string;
    } | null; // Genome and source ID of last visited flower
    emoji: string;
    lifespan: number;
}

export interface Bird extends Actor {
    type: 'bird';
    target: {x: number, y: number} | null; // target insect coordinates
}

export interface Nutrient extends Actor {
    type: 'nutrient';
    lifespan: number;
}

export interface Egg extends Actor {
    type: 'egg';
    hatchTimer: number;
    insectEmoji: string;
}

export type CellContent = Flower | Insect | Bird | Nutrient | Egg;

export type Grid = (CellContent[])[][];

export interface ToastMessage {
  id: string;
  message: string;
  type: 'info' | 'success' | 'error';
  count?: number;
  key?: number;
}

export interface FEService {
    initialize(): Promise<void>;
    setParams(params: FEParams): void;
    makeFlower(): Promise<{genome: string, image: string}>;
    reproduce(father: string, mother: string): Promise<{genome: string, image: string}>;
    mutate(original: string, addNodeRate?: number, addConnRate?: number, removeConnRate?: number, perturbWeightsRate?: number, enableRate?: number, disableRate?: number, actTypeRate?: number): Promise<{genome: string, image: string}>;
    getFlowerStats(genome: string, humidity?: number, temperature?: number, altitude?: number, terrainType?: number): Promise<FlowerGenomeStats>;
    draw3DFlower(genome: string): Promise<string>;
    drawFlower(genome: string): Promise<{genome: string, image: string}>;
}

export interface FEParams {
    radius: number;
    numLayers: number;
    P: number;
    bias: number;
}

// --- Challenges & Analytics ---

export type ChallengeId = 'survival-1' | 'survival-2' | 'survival-3' | 'predation-1' | 'predation-2' | 'predation-3';

export interface Challenge {
    id: ChallengeId;
    title: string;
    description: string;
    goal: number;
    progress: number;
    completed: boolean;
    metric: keyof TickSummary;
    aggregator: 'max' | 'sum';
}

export interface ChallengeState {
    challenges: Challenge[];
    processTick: (summary: TickSummary) => void;
}

export interface AnalyticsDataPoint {
    tick: number;
    flowers: number;
    insects: number;
    birds: number;
    reproductions: number;
    insectsEaten: number;
    eggsEaten: number;
    insectsDiedOfOldAge: number;
    eggsLaid: number;
    insectsBorn: number;
    avgHealth: number;
    maxHealth: number;
    maxToxicity: number;
    avgStamina: number;
    maxStamina: number;
    avgNutrientEfficiency: number;
    avgMaturationPeriod: number;
    avgVitality: number;
    avgAgility: number;
    avgStrength: number;
    avgIntelligence: number;
    avgLuck: number;
}

export interface AnalyticsState {
    history: AnalyticsDataPoint[];
    addDataPoint: (summary: TickSummary) => void;
    reset: () => void;
}

export interface TickSummary {
    tick: number;
    flowerCount: number;
    insectCount: number;
    birdCount: number;
    reproductions: number;
    insectsEaten: number; // In this tick
    totalInsectsEaten: number; // Cumulative
    maxFlowerAge: number;
    eggsLaid: number;
    insectsBorn: number;
    eggsEaten: number;
    insectsDiedOfOldAge: number;
    avgHealth: number;
    avgStamina: number;
    maxHealth: number;
    maxToxicity: number;
    maxStamina: number;
    avgNutrientEfficiency: number;
    avgMaturationPeriod: number;
    avgVitality: number;
    avgAgility: number;
    avgStrength: number;
    avgIntelligence: number;
    avgLuck: number;
}
