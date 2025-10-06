import type { TickSummary, Season, WeatherEventType } from './base';

export interface AppEvent {
  message: string;
  type: 'info' | 'success' | 'error';
  importance: 'low' | 'high';
  tick?: number;
  timestamp?: number;
}

export interface LogEntry extends AppEvent {
  id: string;
  count?: number;
}

export interface ToastMessage {
  id: string;
  message: string;
  type: 'info' | 'success' | 'error';
  count?: number;
  key?: number;
  tick?: number;
}

export type ChallengeId = 'survival-1' | 'survival-2' | 'survival-3' | 'predation-1' | 'predation-2' | 'predation-3' |
'circle-of-life' | 'pest-control' | 'bountiful-harvest' | 'poison-garden' | 'peak-performer' | 'the-swarm-1' | 'the-swarm-2' | 'avian-sanctuary-1' | 'avian-sanctuary-2' | 'unchecked-growth' |
'hive-1' | 'hive-2' | 'colony-1' | 'pest-1' | 'metamorphosis-1' | 'healing-garden' |
'specialist-ladybug' | 'specialist-beetle' | 'specialist-snail' | 'specialist-scorpion' | 'specialist-spider';

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
    eagles: number;
    eggCount: number;
    herbicidePlanes: number;
    herbicideSmokes: number;
    corpses: number;
    cockroaches: number;
    caterpillars: number;
    butterflies: number;
    cocoons: number;
    beetles: number;
    ladybugs: number;
    snails: number;
    bees: number;
    scorpionCount: number;
    antCount: number;
    spiderCount: number;
    hiveCount: number;
    colonyCount: number;
    totalHoney: number;
    totalAntFood: number;
    reproductions: number;
    insectsEaten: number;
    eggsLaid: number;
    insectsBorn: number;
    eggsEaten: number;
    cocoonsEaten: number;
    insectsDiedOfOldAge: number;
    totalBirdsHunted: number;
    totalHerbicidePlanesSpawned: number;
    nutrientCount: number;
    flowerDensity: number;
    avgHealth: number;
    maxHealth: number;
    maxToxicity: number;
    maxHealingRate: number;
    avgStamina: number;
    maxStamina: number;
    avgNutrientEfficiency: number;
    avgMaturationPeriod: number;
    avgVitality: number;
    avgAgility: number;
    avgStrength: number;
    avgIntelligence: number;
    avgLuck: number;
    tickTimeMs: number;
    renderTimeMs: number;
    currentTemperature?: number;
    currentHumidity?: number;
    season?: Season;
    weatherEvent?: WeatherEventType;
    pendingFlowerRequests: number;
    healingFlowerCount: number;
    toxicFlowerCount: number;
}

export interface AnalyticsState {
    history: AnalyticsDataPoint[];
    addDataPoint: (data: { summary: TickSummary; renderTimeMs: number }) => void;
    reset: () => void;
}

// --- Seed Bank ---

export type SeedBankCategory = 'longestLived' | 'mostToxic' | 'mostHealing';

export interface SeedBankEntry {
    category: SeedBankCategory;
    genome: string;
    value: number;
    imageData: string;
    sex: 'male' | 'female' | 'both';
}
