import type { SavedCellActor, CellContent } from './actors';
import type { SpeciesStatus } from './species';

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
    simulationSpeed: number;
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
    // Hive Parameters
    hiveGridArea: number;
    beeDormancyTemp: number;
    beeWinterHoneyConsumption: number;
    hivePollenToHoneyRatio: number;
    hiveSpawnThreshold: number;
    hiveSpawnCost: number;
    territoryMarkLifespan: number;
    signalTTL: number;
    beePollinationWanderChance: number;
    // Ant Colony Parameters
    colonyGridArea: number;
    antDormancyTemp: number;
    antColonySpawnThreshold: number;
    antColonySpawnCost: number;
    pheromoneLifespan: number;
    pheromoneStrengthDecay: number;
    // Spider Parameters
    spiderGridArea: number;
    spiderWebStamina: number;
    spiderWebStaminaRegen: number;
    spiderWebBuildCost: number;
    spiderMaxWebs: number;
    spiderWebLifespan: number;
    spiderWebStrength: number;
    spiderWebTrapChance: number;
    spiderEscapeChanceModifier: number;
    // Permitted Actors
    allowedActors: string[];
}

export interface Coord {
    x: number;
    y: number;
}

export type Grid = CellContent[][][];
export type SavedGrid = SavedCellActor[][][];

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

/** What one worker that makes flowers has done since the game started or was loaded. */
export interface FlowerWorkerStat {
    name: string;
    /** requests it was given and has not answered */
    inFlight: number;
    produced: number;
    failed: number;
    /** average milliseconds the worker itself took per flower (image included), over the last 50; null before the first */
    avgMs: number | null;
}

/** What the workers are doing: for the bar the player reads and for the performance review. */
export interface WorkersSummary {
    flowerWorkers: FlowerWorkerStat[];
    /** the worker that does the species work: 'Species worker', the first flower worker, or nobody */
    speciesWorker: string | null;
    /** `dropped`: classifications the bounded queue let go (not in `waiting`); `avgMs`: milliseconds per flower that was classified (a share of its batch), over the last 50; null before the first */
    species: { waiting: number; answered: number; dropped: number; byStatus: Partial<Record<SpeciesStatus, number>>; avgMs: number | null };
    produced: number;
    failed: number;
    /** flowers produced per second over the last 10 seconds */
    flowersPerSecond: number;
    /** requests that wait in the simulation for a worker with a free place (they count as pending) */
    queued: number;
    /** flowers made for a seed that was gone, and thrown away */
    seedsDiscarded: number;
    /** requests the engine cancelled because their seed died (in time or too late) */
    seedsCancelled: number;
    /** of the flowers thrown away, the ones whose seed had been cancelled: the flower was already made when the cancel came */
    discardedAfterCancel: number;
}

export interface TickSummary {
    tick: number;
    /** The species of the map that the collection has a flower of, and the atypical flowers it holds. They are read by the page from the collection, which outlives the game, not counted by the simulation. */
    speciesDiscovered?: number;
    atypicalFound?: number;
    /** The different species alive in the garden now, among the flowers that were classified: the simulation does count this one. */
    speciesAlive?: number;
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
    beetleCount: number;
    ladybugCount: number;
    snailCount: number;
    beeCount: number;
    scorpionCount: number;
    antCount: number;
    spiderCount: number;
    hiveCount: number;
    colonyCount: number;
    totalHoney: number;
    totalAntFood: number;
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
    cocoonsEaten: number;
    insectsDiedOfOldAge: number;
    avgHealth: number;
    avgStamina: number;
    maxHealth: number;
    maxToxicity: number;
    maxHealingRate: number;
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
    workers?: WorkersSummary;
    healingFlowerCount: number;
    toxicFlowerCount: number;
}

export interface FlowerCreationRequest {
    requestId: string;
    flowerId: string;
    x: number;
    y: number;
    parentGenome1?: string;
    parentGenome2?: string;
}
