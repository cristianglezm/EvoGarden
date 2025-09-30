import type { SavedCellActor, CellContent } from './actors';

export type WindDirection = 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW';

export type NotificationMode = 'toasts' | 'log' | 'both';

export type Season = 'Spring' | 'Summer' | 'Autumn' | 'Winter';
export type WeatherEventType = 'heatwave' | 'coldsnap' | 'heavyrain' | 'drought' | 'none';

export interface WeatherEvent {
    type: WeatherEventType;
    duration: number; // Ticks remaining
}

export interface EnvironmentState {
    currentTemperature: number;
    currentHumidity: number;
    season: Season;
    currentWeatherEvent: WeatherEvent;
}
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
    herbicideFlowerDensityThreshold: number;
    herbicideDamage: number;
    herbicideSmokeLifespan: number;
    herbicideCooldown: number;
    herbicideSmokeExpansionCount: number;
    notificationMode: NotificationMode;
    // Seasonal Cycle Parameters
    seasonLengthInTicks: number;
    temperatureAmplitude: number;
    humidityAmplitude: number;
    // Weather Event Parameters
    weatherEventChance: number;
    heatwaveTempIncrease: number;
    coldsnapTempDecrease: number;
    heavyRainHumidityIncrease: number;
    droughtHumidityDecrease: number;
    weatherEventMinDuration: number;
    weatherEventMaxDuration: number;
    // Insect Evolution
    reproductionCooldown: number;
    mutationChance: number;
    mutationAmount: number;
}

export interface Coord {
    x: number;
    y: number;
}

export type Grid = (CellContent[])[][];
export type SavedGrid = (SavedCellActor[])[][];

// Represents the data structure stored in localStorage (metadata).
// The full actor data for flowers and insects is in IndexedDB.
export interface SavedStateMetadata {
    params: SimulationParams;
    grid: SavedGrid;
    tick: number;
    totalInsectsEaten: number;
    totalBirdsHunted: number;
    totalHerbicidePlanesSpawned: number;
    environmentState: EnvironmentState;
}

export type PopulationTrend = 'growing' | 'declining' | 'stable';

export interface TickSummary {
    tick: number;
    flowerCount: number;
    insectCount: number;
    birdCount: number;
    eagleCount: number;
    eggCount: number;
    herbicidePlaneCount: number;
    herbicideSmokeCount: number;
    corpseCount: number;
    cockroachCount: number;
    caterpillarCount: number;
    butterflyCount: number;
    cocoonCount: number;
    reproductions: number;
    insectsEaten: number; // In this tick
    totalInsectsEaten: number; // Cumulative
    totalBirdsHunted: number; // Cumulative
    totalHerbicidePlanesSpawned: number; // Cumulative
    nutrientCount: number; // Current tick
    flowerDensity: number; // Current tick
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
    tickTimeMs: number;
    currentTemperature: number;
    currentHumidity: number;
    season: Season;
    weatherEvent: WeatherEventType;
    pendingFlowerRequests: number;
    healingFlowerCount: number;
    toxicFlowerCount: number;
}

export interface FlowerCreationRequest {
    requestId: string;
    x: number;
    y: number;
    parentGenome1?: string;
    parentGenome2?: string;
}
