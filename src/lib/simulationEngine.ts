import type { Grid, SimulationParams, CellContent, Flower, Bird, Insect, Egg, Nutrient, FEService, AppEvent, TickSummary, Coord, Eagle, HerbicidePlane, HerbicideSmoke, PopulationTrend, ActorDelta, FlowerSeed, EnvironmentState, Season, WeatherEventType } from '../types';
import { INSECT_REPRODUCTION_CHANCE, EGG_HATCH_TIME, INSECT_LIFESPAN, POPULATION_TREND_WINDOW, POPULATION_GROWTH_THRESHOLD_INSECT, POPULATION_DECLINE_THRESHOLD_INSECT, BIRD_SPAWN_COOLDOWN, EAGLE_SPAWN_COOLDOWN, DEFAULT_SIM_PARAMS, SEED_HEALTH, INSECT_REPRODUCTION_COOLDOWN } from '../constants';
import { getInsectEmoji } from '../utils';
import { Quadtree, Rectangle } from './Quadtree';
import { findCellForStationaryActor, cloneActor, calculatePopulationTrend, buildQuadtrees, findCellForFlowerSpawn, findEmptyCell } from './simulationUtils';
import { processBirdTick } from './behaviors/birdBehavior';
import { processEggTick } from './behaviors/eggBehavior';
import { processFlowerTick } from './behaviors/flowerBehavior';
import { processInsectTick } from './behaviors/insectBehavior';
import { processNutrientTick } from './behaviors/nutrientBehavior';
import { processEagleTick } from './behaviors/eagleBehavior';
import { processHerbicidePlaneTick } from './behaviors/herbicidePlaneBehavior';
import { processHerbicideSmokeTick } from './behaviors/herbicideSmokeBehavior';
import { FLOWER_NUTRIENT_HEAL } from '../constants';

const shallowObjectEquals = (o1: any, o2: any): boolean => {
    if (o1 === o2) return true;
    if (o1 == null || o2 == null) return o1 === o2;
    if (typeof o1 !== 'object' || typeof o2 !== 'object') return o1 === o2;

    const keys1 = Object.keys(o1);
    const keys2 = Object.keys(o2);

    if (keys1.length !== keys2.length) return false;

    for (const key of keys1) {
        if (!Object.prototype.hasOwnProperty.call(o2, key) || o1[key] !== o2[key]) {
            return false;
        }
    }
    return true;
};

interface CompletedFlowerPayload {
    requestId: string;
    flower: Flower;
}

export class SimulationEngine {
    private tick = 0;
    private grid: Grid = [];
    private params: SimulationParams;
    private flowerService: FEService;
    private totalInsectsEaten = 0;
    private totalBirdsHunted = 0;
    private totalHerbicidePlanesSpawned = 0;
    
    // Environment state
    private environmentState: EnvironmentState;
    
    private flowerWorkerPort: MessagePort | null = null;
    private completedFlowersQueue: CompletedFlowerPayload[] = [];
    private stemImageData: string | null = null;
    
    // Properties for population control
    private insectCountHistory: number[] = [];
    private birdCountHistory: number[] = [];
    private birdSpawnCooldown = 0;
    private eagleSpawnCooldown = 0;
    private herbicideCooldown = 0;
    private lastInsectTrend: PopulationTrend = 'stable';

    // Tick-specific counters
    private insectsEatenThisTick = 0;
    private eggsEatenThisTick = 0;
    private insectsDiedOfOldAgeThisTick = 0;
    private eggsLaidThisTick = 0;
    private insectsBornThisTick = 0;
    private birdsHuntedThisTick = 0;

    constructor(params: SimulationParams, flowerService: FEService) {
        this.params = params;
        this.flowerService = flowerService;
        this.environmentState = {
            currentTemperature: params.temperature,
            currentHumidity: params.humidity,
            season: 'Summer',
            currentWeatherEvent: { type: 'none', duration: 0 },
        };
    }
    
    public setFlowerWorkerPort(port: MessagePort, params: SimulationParams) {
        this.flowerWorkerPort = port;
        this.flowerWorkerPort.onmessage = (e: MessageEvent) => {
            this.handleFlowerWorkerMessage(e.data);
        };
        this.flowerWorkerPort.postMessage({ type: 'update-params', payload: params });
    }

    public setStemImage(imageData: string) {
        this.stemImageData = imageData;
    }

    public handleFlowerWorkerMessage(data: { type: string, payload: any }) {
        const { type, payload } = data;
        if (type === 'flower-created' || type === 'flower-creation-failed') {
            this.completedFlowersQueue.push(payload);
        }
    }

    public initializeGridWithActors(actors: CellContent[]) {
        const { gridWidth, gridHeight } = this.params;
        this.grid = Array.from({ length: gridHeight }, () => Array.from({ length: gridWidth }, () => []));

        for (const actor of actors) {
            // Use the actor's own coordinates. This is crucial for predictable test setups.
            const { x, y } = actor;

            if (x >= 0 && x < gridWidth && y >= 0 && y < gridHeight) {
                this.grid[y][x].push(actor);
            } else {
                console.warn(`Actor with ID ${actor.id} has out-of-bounds coordinates (${x}, ${y}) and was not placed.`);
            }
        }
    }


    private _requestNewFlower(nextActorState: Map<string, CellContent>, x: number, y: number, parentGenome1?: string, parentGenome2?: string): FlowerSeed | null {
        if (!this.flowerWorkerPort || !this.stemImageData) {
            console.error("Flower worker port or stem image not available to request a new flower.");
            return null;
        }
        
        // Calculate average flower health from the current tick's state
        let totalHealth = 0;
        let flowerCount = 0;
        for (const actor of nextActorState.values()) {
            if (actor.type === 'flower') {
                totalHealth += (actor as Flower).health;
                flowerCount++;
            }
        }
        
        const avgHealth = flowerCount > 0 ? totalHealth / flowerCount : SEED_HEALTH;
        const seedHealth = Math.max(1, Math.round(avgHealth)); // Ensure seed has at least 1 health

        const requestId = `seed-${x}-${y}-${Date.now()}-${Math.random()}`;
        this.flowerWorkerPort.postMessage({
            type: 'request-flower',
            payload: { requestId, x, y, parentGenome1, parentGenome2 }
        });
        return { id: requestId, type: 'flowerSeed', x, y, imageData: this.stemImageData, health: seedHealth, maxHealth: seedHealth, age: 0 };
    }

    private _resetTickCounters() {
        this.insectsEatenThisTick = 0;
        this.eggsEatenThisTick = 0;
        this.insectsDiedOfOldAgeThisTick = 0;
        this.eggsLaidThisTick = 0;
        this.insectsBornThisTick = 0;
        this.birdsHuntedThisTick = 0;
    }

    private _processCooldowns() {
        if (this.birdSpawnCooldown > 0) this.birdSpawnCooldown--;
        if (this.eagleSpawnCooldown > 0) this.eagleSpawnCooldown--;
        if (this.herbicideCooldown > 0) this.herbicideCooldown--;
    }
    
    private _handlePopulationControl(nextActorState: Map<string, CellContent>, events: AppEvent[]): void {
        const { gridWidth, gridHeight } = this.params;
        const insectTrend = calculatePopulationTrend(this.insectCountHistory, POPULATION_GROWTH_THRESHOLD_INSECT, POPULATION_DECLINE_THRESHOLD_INSECT);

        if (insectTrend !== this.lastInsectTrend) {
            events.push({ message: `Insect population is now ${insectTrend}.`, type: 'info', importance: 'low' });
            this.lastInsectTrend = insectTrend;
        }

        if (insectTrend === 'growing' && this.birdSpawnCooldown === 0) {
            const spot = findCellForStationaryActor(this.grid, this.params, 'bird');
            if (spot) {
                const birdId = `bird-dyn-${Date.now()}`;
                const newBird: Bird = { id: birdId, type: 'bird', x: spot.x, y: spot.y, target: null, patrolTarget: null };
                nextActorState.set(birdId, newBird);
                events.push({ message: '🐦 A new bird has arrived to hunt!', type: 'info', importance: 'high' });
                this.birdSpawnCooldown = BIRD_SPAWN_COOLDOWN;
            }
        } else if (insectTrend === 'declining') {
            const birdCount = Array.from(nextActorState.values()).filter(a => a.type === 'bird').length;
            if (this.eagleSpawnCooldown === 0 && birdCount > 2) {
                const spot = findCellForStationaryActor(this.grid, this.params, 'eagle');
                if (spot) {
                    const eagleId = `eagle-dyn-${Date.now()}`;
                    const newEagle: Eagle = { id: eagleId, type: 'eagle', x: spot.x, y: spot.y, target: null };
                    nextActorState.set(eagleId, newEagle);
                    events.push({ message: '🦅 An eagle has appeared in the skies!', type: 'info', importance: 'high' });
                    this.eagleSpawnCooldown = EAGLE_SPAWN_COOLDOWN;
                }
            }
        }
        
        const flowerCountForDensity = Array.from(nextActorState.values()).filter(a => a.type === 'flower' || a.type === 'flowerSeed').length;
        const totalCells = gridWidth * gridHeight;
        const flowerDensityThresholdCount = totalCells * this.params.herbicideFlowerDensityThreshold;
        const hasPlane = Array.from(nextActorState.values()).some(a => a.type === 'herbicidePlane');
        
        if (this.herbicideCooldown === 0 && !hasPlane && flowerCountForDensity >= flowerDensityThresholdCount) {
            this.totalHerbicidePlanesSpawned++;
            const STRIDE = 3;
            const pattern = Math.floor(Math.random() * 4);

            let start: Coord = { x: 1, y: 1 };
            let dx = 0, dy = 0, turnDx = 0, turnDy = 0;

            const minX = 1, maxX = gridWidth - 2, minY = 1, maxY = gridHeight - 2;

            switch (pattern) {
                case 0: start = { x: minX, y: minY }; dx = 1; dy = 0; turnDx = 0; turnDy = STRIDE; break;
                case 1: start = { x: maxX, y: maxY - (STRIDE - 1) }; dx = -1; dy = 0; turnDx = 0; turnDy = -STRIDE; break;
                case 2: start = { x: minX, y: minY }; dx = 0; dy = 1; turnDx = STRIDE; turnDy = 0; break;
                case 3: start = { x: maxX - (STRIDE - 1), y: maxY }; dx = 0; dy = -1; turnDx = -STRIDE; turnDy = 0; break;
            }
            
            const planeId = `plane-${Date.now()}`;
            const newPlane: HerbicidePlane = { id: planeId, type: 'herbicidePlane', ...start, dx, dy, turnDx, turnDy, stride: STRIDE };
            nextActorState.set(planeId, newPlane);
            events.push({ message: '✈️ Herbicide plane deployed to control flower overgrowth!', type: 'info', importance: 'high' });
            this.herbicideCooldown = this.params.herbicideCooldown;
        }
    }
    
    private _processNutrientHealing(nextActorState: Map<string, CellContent>, qtree: Quadtree<CellContent>): void {
        const nutrientsToProcess = Array.from(nextActorState.values()).filter(a => a.type === 'nutrient') as Nutrient[];
        for (const nutrient of nutrientsToProcess) {
            if (!nextActorState.has(nutrient.id)) continue;

            const healArea = new Rectangle(nutrient.x, nutrient.y, 1.5, 1.5);
            const flowersToHeal = qtree.query(healArea).map(p => p.data).filter(a => a.type === 'flower' && nextActorState.has(a.id)) as Flower[];

            if (flowersToHeal.length > 0) {
                for (const flowerPoint of flowersToHeal) {
                    const flower = nextActorState.get(flowerPoint.id) as Flower;
                    const healAmount = FLOWER_NUTRIENT_HEAL * flower.nutrientEfficiency;
                    flower.health = Math.min(flower.maxHealth, flower.health + healAmount);
                    flower.stamina = Math.min(flower.maxStamina, flower.stamina + healAmount);
                }
                nextActorState.delete(nutrient.id);
            }
        }
    }
    
    private _processActorTicks(
        actorsToProcess: CellContent[],
        nextActorState: Map<string, CellContent>,
        qtree: Quadtree<CellContent>,
        flowerQtree: Quadtree<CellContent>,
        events: AppEvent[],
        newActorQueue: CellContent[]
    ): void {
        const requestFlowerCallback = this._requestNewFlower.bind(this, nextActorState);
        
        for (const currentActor of actorsToProcess) {
            if (!nextActorState.has(currentActor.id)) continue;
            const actor = nextActorState.get(currentActor.id)!;

            switch (actor.type) {
                case 'bird':
                    processBirdTick(actor as Bird, { grid: this.grid, params: this.params, qtree, flowerQtree, nextActorState, events,
                        incrementInsectsEaten: () => { this.insectsEatenThisTick++; this.totalInsectsEaten++; },
                        incrementEggsEaten: () => { this.eggsEatenThisTick++; }
                    });
                    break;
                case 'eagle':
                    if (processEagleTick(actor as Eagle, { grid: this.grid, params: this.params, qtree, nextActorState, events })) {
                        this.birdsHuntedThisTick++;
                    }
                    break;
                case 'herbicidePlane':
                    processHerbicidePlaneTick(actor as HerbicidePlane, { grid: this.grid, params: this.params, nextActorState });
                    break;
                case 'herbicideSmoke':
                    processHerbicideSmokeTick(actor as HerbicideSmoke, { grid: this.grid, params: this.params, nextActorState });
                    break;
                case 'insect':
                    processInsectTick(actor as Insect, { grid: this.grid, params: this.params, nextActorState, requestNewFlower: requestFlowerCallback, flowerQtree, events,
                        incrementInsectsDiedOfOldAge: () => { this.insectsDiedOfOldAgeThisTick++; },
                        currentTemperature: this.environmentState.currentTemperature,
                    }, newActorQueue);
                    break;
                case 'flower': {
                    const flower = actor as Flower;
                    processFlowerTick(flower, { grid: this.grid, params: this.params, requestNewFlower: requestFlowerCallback, currentTemperature: this.environmentState.currentTemperature }, newActorQueue);
                    if (flower.health <= 0) nextActorState.delete(flower.id);
                    break;
                }
                case 'flowerSeed': {
                    const seed = actor as FlowerSeed;
                    seed.age++;
                    break;
                }
                case 'egg':
                    processEggTick(actor as Egg, { nextActorState, events, incrementInsectsBorn: () => { this.insectsBornThisTick++; }, params: this.params });
                    break;
                case 'nutrient':
                    processNutrientTick(actor as Nutrient, { nextActorState });
                    break;
            }
        }
    }
    
    private _handleInsectReproduction(nextActorState: Map<string, CellContent>, events: AppEvent[]): void {
        const { gridWidth, gridHeight } = this.params;

        // Create a temporary grid based on the current state of this tick's actors
        const currentTickGrid: Grid = Array.from({ length: gridHeight }, () => Array.from({ length: gridWidth }, () => []));
        for (const actor of nextActorState.values()) {
            if (actor.x >= 0 && actor.x < gridWidth && actor.y >= 0 && actor.y < gridHeight) {
                currentTickGrid[actor.y][actor.x].push(actor);
            }
        }

        const boundary = new Rectangle(gridWidth / 2, gridHeight / 2, gridWidth / 2, gridHeight / 2);
        const insectQtree = new Quadtree<CellContent>(boundary, 4);
        const allInsects: Insect[] = [];
        
        for (const actor of nextActorState.values()) {
            if (actor.type === 'insect') {
                const insect = actor as Insect;
                insectQtree.insert({ x: insect.x, y: insect.y, data: insect });
                allInsects.push(insect);
            }
        }
        
        const reproducedInsects = new Set<string>();
        for (const insect of allInsects) {
            if (reproducedInsects.has(insect.id) || insect.reproductionCooldown) continue;

            const range = new Rectangle(insect.x, insect.y, 0.5, 0.5);
            const partners = insectQtree.query(range).map(p => p.data as Insect).filter(other => other.id !== insect.id && other.emoji === insect.emoji && !reproducedInsects.has(other.id) && !other.reproductionCooldown);

            if (partners.length > 0 && Math.random() < INSECT_REPRODUCTION_CHANCE) {
                // Use the temporary, up-to-date grid for placement checks
                const spot = findCellForStationaryActor(currentTickGrid, this.params, 'egg', { x: insect.x, y: insect.y });
                const partner = partners[0];
                if (spot) {
                    const eggId = `egg-${spot.x}-${spot.y}-${Date.now()}`;
                    nextActorState.set(eggId, { id: eggId, type: 'egg', x: spot.x, y: spot.y, hatchTimer: EGG_HATCH_TIME, insectEmoji: insect.emoji });
                    
                    insect.reproductionCooldown = INSECT_REPRODUCTION_COOLDOWN;
                    partner.reproductionCooldown = INSECT_REPRODUCTION_COOLDOWN;

                    this.eggsLaidThisTick++;
                    reproducedInsects.add(insect.id).add(partner.id);
                    events.push({ message: `${insect.emoji} laid an egg!`, type: 'info', importance: 'low' });
                }
            }
        }
    }
    
    private _processCompletedFlowers(nextActorState: Map<string, CellContent>, events: AppEvent[]): number {
        let newFlowerCount = 0;
        if (this.completedFlowersQueue.length > 0) {
            for (const { requestId, flower } of this.completedFlowersQueue) {
                const seed = nextActorState.get(requestId);
                if (seed && seed.type === 'flowerSeed') {
                    nextActorState.delete(requestId);
                    if (flower) { // flower is null on creation failure
                        flower.age += seed.age;
                        if (flower.age >= flower.maturationPeriod) {
                            flower.isMature = true;
                        }
                        nextActorState.set(flower.id, flower);
                        newFlowerCount++;
                        events.push({ message: '🌸 A new flower has bloomed!', type: 'success', importance: 'low' });
                    }
                }
            }
            this.completedFlowersQueue = [];
        }
        return newFlowerCount;
    }
    
    private _calculateTickSummary(nextActorState: Map<string, CellContent>, newFlowerCount: number, tickTimeMs: number): TickSummary {
        let flowerCountForStats = 0, seedCount = 0, insectCount = 0, birdCount = 0, eagleCount = 0, eggCount = 0;
        let herbicidePlaneCount = 0, herbicideSmokeCount = 0, maxFlowerAge = 0, nutrientCount = 0;
        let totalHealth = 0, totalStamina = 0, totalNutrientEfficiency = 0, totalMaturationPeriod = 0;
        let maxHealthSoFar = 0, maxStaminaSoFar = 0, maxToxicitySoFar = 0;
        let totalVitality = 0, totalAgility = 0, totalStrength = 0, totalIntelligence = 0, totalLuck = 0;

        for (const actor of nextActorState.values()) {
            if (actor.type === 'flower') {
                const f = actor as Flower;
                flowerCountForStats++; maxFlowerAge = Math.max(maxFlowerAge, f.age); totalHealth += f.health; totalStamina += f.stamina;
                totalNutrientEfficiency += f.nutrientEfficiency; totalMaturationPeriod += f.maturationPeriod;
                maxHealthSoFar = Math.max(maxHealthSoFar, f.maxHealth); maxStaminaSoFar = Math.max(maxStaminaSoFar, f.maxStamina);
                maxToxicitySoFar = Math.max(maxToxicitySoFar, f.toxicityRate);
                totalVitality += f.effects.vitality; totalAgility += f.effects.agility; totalStrength += f.effects.strength;
                totalIntelligence += f.effects.intelligence; totalLuck += f.effects.luck;
            } else if (actor.type === 'flowerSeed') {
                seedCount++;
            } else if (actor.type === 'insect') {
                insectCount++;
            } else if (actor.type === 'bird') {
                birdCount++;
            } else if (actor.type === 'eagle') {
                eagleCount++;
            } else if (actor.type === 'egg') {
                eggCount++;
            } else if (actor.type === 'herbicidePlane') {
                herbicidePlaneCount++;
            } else if (actor.type === 'herbicideSmoke') {
                herbicideSmokeCount++;
            } else if (actor.type === 'nutrient') {
                nutrientCount++;
            }
        }

        this.insectCountHistory.push(insectCount);
        if (this.insectCountHistory.length > POPULATION_TREND_WINDOW) this.insectCountHistory.shift();
        this.birdCountHistory.push(birdCount);
        if (this.birdCountHistory.length > POPULATION_TREND_WINDOW) this.birdCountHistory.shift();

        const flowerDensity = (flowerCountForStats + seedCount) / (this.params.gridWidth * this.params.gridHeight);

        return {
            tick: this.tick,
            flowerCount: flowerCountForStats + seedCount,
            insectCount, birdCount, eagleCount, eggCount, herbicidePlaneCount, herbicideSmokeCount,
            reproductions: newFlowerCount,
            insectsEaten: this.insectsEatenThisTick, totalInsectsEaten: this.totalInsectsEaten, maxFlowerAge,
            totalBirdsHunted: this.totalBirdsHunted, totalHerbicidePlanesSpawned: this.totalHerbicidePlanesSpawned,
            nutrientCount, flowerDensity,
            eggsLaid: this.eggsLaidThisTick, insectsBorn: this.insectsBornThisTick, eggsEaten: this.eggsEatenThisTick,
            insectsDiedOfOldAge: this.insectsDiedOfOldAgeThisTick,
            avgHealth: flowerCountForStats > 0 ? totalHealth / flowerCountForStats : 0,
            avgStamina: flowerCountForStats > 0 ? totalStamina / flowerCountForStats : 0,
            maxHealth: maxHealthSoFar, maxStamina: maxStaminaSoFar, maxToxicity: maxToxicitySoFar,
            avgNutrientEfficiency: flowerCountForStats > 0 ? totalNutrientEfficiency / flowerCountForStats : 0,
            avgMaturationPeriod: flowerCountForStats > 0 ? totalMaturationPeriod / flowerCountForStats : 0,
            avgVitality: flowerCountForStats > 0 ? totalVitality / flowerCountForStats : 0,
            avgAgility: flowerCountForStats > 0 ? totalAgility / flowerCountForStats : 0,
            avgStrength: flowerCountForStats > 0 ? totalStrength / flowerCountForStats : 0,
            avgIntelligence: flowerCountForStats > 0 ? totalIntelligence / flowerCountForStats : 0,
            avgLuck: flowerCountForStats > 0 ? totalLuck / flowerCountForStats : 0,
            tickTimeMs,
            currentTemperature: this.environmentState.currentTemperature,
            currentHumidity: this.environmentState.currentHumidity,
            season: this.environmentState.season,
            weatherEvent: this.environmentState.currentWeatherEvent.type,
        };
    }
    
    private _updateGrid(nextActorState: Map<string, CellContent>): void {
        const { gridWidth, gridHeight } = this.params;
        const nextGrid: Grid = Array.from({ length: gridHeight }, () => Array.from({ length: gridWidth }, () => []));
        for (const actor of nextActorState.values()) {
            if(actor.x >= 0 && actor.x < gridWidth && actor.y >= 0 && actor.y < gridHeight) {
                nextGrid[actor.y][actor.x].push(actor);
            }
        }
        this.grid = nextGrid;
    }

    private _calculateDeltas(initialActors: CellContent[], finalActorState: Map<string, CellContent>): ActorDelta[] {
        const deltas: ActorDelta[] = [];
        const initialActorMap = new Map(initialActors.map(actor => [actor.id, actor]));

        // Check for updates and removals
        for (const [id, initialActor] of initialActorMap.entries()) {
            const finalActor = finalActorState.get(id);
            if (!finalActor) {
                deltas.push({ type: 'remove', id });
            } else {
                const changes: Partial<CellContent> = {};
                let hasChanged = false;

                for (const key in finalActor) {
                    if (key === 'id') continue;
                    
                    const initialValue = (initialActor as any)[key];
                    const finalValue = (finalActor as any)[key];
                    
                    if (typeof finalValue === 'object' && finalValue !== null) {
                        if (!shallowObjectEquals(initialValue, finalValue)) {
                            (changes as any)[key] = finalValue;
                            hasChanged = true;
                        }
                    } else if (initialValue !== finalValue) {
                        (changes as any)[key] = finalValue;
                        hasChanged = true;
                    }
                }
                if (hasChanged) {
                    deltas.push({ type: 'update', id, changes });
                }
            }
        }

        // Check for additions
        for (const [id, finalActor] of finalActorState.entries()) {
            if (!initialActorMap.has(id)) {
                deltas.push({ type: 'add', actor: finalActor });
            }
        }
        
        return deltas;
    }
    
    /**
     * Enforces the rule that only one flower or seed can exist per cell.
     * Iterates through the actor state and removes duplicates, keeping the first one encountered.
     */
    private _resolveFlowerAndSeedConflicts(nextActorState: Map<string, CellContent>): void {
        const occupiedCells = new Set<string>(); // Stores "x,y" coordinates
        const actorIds = [...nextActorState.keys()]; // Use a copy of keys for safe iteration

        for (const actorId of actorIds) {
            const actor = nextActorState.get(actorId);
            if (actor && (actor.type === 'flower' || actor.type === 'flowerSeed')) {
                const coordKey = `${actor.x},${actor.y}`;
                if (occupiedCells.has(coordKey)) {
                    // This cell is already claimed by another flower or seed this tick.
                    // The first one encountered wins, this one is removed.
                    nextActorState.delete(actorId);
                } else {
                    // This is the first flower/seed in this cell, claim it.
                    occupiedCells.add(coordKey);
                }
            }
        }
    }

    private _updateEnvironment(events: AppEvent[]) {
        const { seasonLengthInTicks, temperature, temperatureAmplitude, humidity, humidityAmplitude } = this.params;
        const { weatherEventChance, weatherEventMinDuration, weatherEventMaxDuration, heatwaveTempIncrease, coldsnapTempDecrease, heavyRainHumidityIncrease, droughtHumidityDecrease } = this.params;
        
        // 1. Update seasonal cycle
        const seasonalProgress = (this.tick % seasonLengthInTicks) / seasonLengthInTicks;
        const angle = seasonalProgress * 2 * Math.PI;

        let seasonalTemp = temperature + Math.sin(angle) * temperatureAmplitude;
        let seasonalHumidity = humidity + Math.sin(angle) * humidityAmplitude;
        
        let season: Season;
        if (seasonalProgress < 0.25) season = 'Spring';
        else if (seasonalProgress < 0.5) season = 'Summer';
        else if (seasonalProgress < 0.75) season = 'Autumn';
        else season = 'Winter';
        
        this.environmentState.season = season;

        // 2. Update weather events
        const { currentWeatherEvent } = this.environmentState;
        if (currentWeatherEvent.duration > 0) {
            currentWeatherEvent.duration--;
            if (currentWeatherEvent.duration === 0) {
                events.push({ message: `The ${currentWeatherEvent.type} has ended.`, type: 'info', importance: 'low' });
                currentWeatherEvent.type = 'none';
            }
        } else {
            if (Math.random() < weatherEventChance) {
                const eventTypes: WeatherEventType[] = ['heatwave', 'coldsnap', 'heavyrain', 'drought'];
                currentWeatherEvent.type = eventTypes[Math.floor(Math.random() * eventTypes.length)];
                currentWeatherEvent.duration = Math.floor(Math.random() * (weatherEventMaxDuration - weatherEventMinDuration + 1)) + weatherEventMinDuration;
                events.push({ message: `A ${currentWeatherEvent.type} has begun!`, type: 'info', importance: 'high' });
            }
        }

        // 3. Apply event modifiers
        switch (currentWeatherEvent.type) {
            case 'heatwave':
                seasonalTemp += heatwaveTempIncrease;
                break;
            case 'coldsnap':
                seasonalTemp -= coldsnapTempDecrease;
                break;
            case 'heavyrain':
                seasonalHumidity += heavyRainHumidityIncrease;
                break;
            case 'drought':
                seasonalHumidity -= droughtHumidityDecrease;
                break;
        }

        // 4. Finalize and clamp values
        this.environmentState.currentTemperature = seasonalTemp;
        this.environmentState.currentHumidity = Math.max(0, Math.min(1, seasonalHumidity));
    }

    public async calculateNextTick(): Promise<{ events: AppEvent[]; summary: TickSummary; deltas: ActorDelta[] }> {
        const tickStartTime = performance.now();
        this._resetTickCounters();
        const events: AppEvent[] = [];
        
        const previousSeason = this.environmentState.season;
        this._updateEnvironment(events);
        
        const initialActors = this.grid.flat(2).map(cloneActor);
        const nextActorState = new Map<string, CellContent>(initialActors.map(actor => [actor.id, cloneActor(actor)]));

        // Spring Repopulation Logic
        if (previousSeason === 'Winter' && this.environmentState.season === 'Spring') {
            const flowerCount = Array.from(nextActorState.values()).filter(a => a.type === 'flower' || a.type === 'flowerSeed').length;
            const insectCount = Array.from(nextActorState.values()).filter(a => a.type === 'insect').length;

            if (flowerCount === 0 || insectCount === 0) {
                events.push({ message: '🌱 Spring has arrived, and new life stirs in the garden!', type: 'success', importance: 'high' });                          
                const tempGridForPlacement = this.grid.map(row => row.map(cell => [...cell]));

                if (flowerCount === 0) {
                    for (let i = 0; i < this.params.initialFlowers; i++) {
                        const pos = findCellForFlowerSpawn(tempGridForPlacement, this.params);
                        if (pos) {
                            const seed = this._requestNewFlower(nextActorState, pos.x, pos.y);
                            if (seed) {
                               nextActorState.set(seed.id, seed);
                               tempGridForPlacement[pos.y][pos.x].push(seed);
                            }
                        }
                    }
                }
    
                if (insectCount === 0) {
                    for (let i = 0; i < this.params.initialInsects; i++) {
                         const pos = findEmptyCell(tempGridForPlacement, this.params);
                         if (pos) {
                            const id = `insect-repop-${i}-${Date.now()}`;
                            const emoji = getInsectEmoji(id);
                            const newInsect: Insect = { id, type: 'insect', x: pos.x, y: pos.y, pollen: null, emoji, lifespan: INSECT_LIFESPAN };
                            nextActorState.set(id, newInsect);
                            tempGridForPlacement[pos.y][pos.x].push(newInsect);
                         }
                    }
                }
            }
        }

        // Process flowers that were created in the background
        const newFlowerCount = this._processCompletedFlowers(nextActorState, events);

        this._processCooldowns();
        this._handlePopulationControl(nextActorState, events);
        
        const { qtree, flowerQtree } = buildQuadtrees(Array.from(nextActorState.values()), this.params);
        
        this._processNutrientHealing(nextActorState, qtree);

        const newActorQueue: CellContent[] = [];
        this._processActorTicks(initialActors, nextActorState, qtree, flowerQtree, events, newActorQueue);

        this.totalBirdsHunted += this.birdsHuntedThisTick;

        // Add newly requested actors (e.g., seeds from behaviors) to the state
        for (const actor of newActorQueue) {
            nextActorState.set(actor.id, actor);
        }

        this._handleInsectReproduction(nextActorState, events);
        
        // Enforce one flower/seed per cell rule before summarizing and creating deltas
        this._resolveFlowerAndSeedConflicts(nextActorState);
        
        const tickEndTime = performance.now();
        const tickTimeMs = tickEndTime - tickStartTime;
        const summary = this._calculateTickSummary(nextActorState, newFlowerCount, tickTimeMs);
        
        const deltas = this._calculateDeltas(initialActors, nextActorState);
        
        this._updateGrid(nextActorState);
        
        this.tick++;

        return { events, summary, deltas };
    }

    public getGridState() { return { grid: this.grid, tick: this.tick, params: this.params }; }

    public getStateForSave() {
        const stateToSave = JSON.parse(JSON.stringify({ 
            params: this.params, grid: this.grid, tick: this.tick, totalInsectsEaten: this.totalInsectsEaten,
            totalBirdsHunted: this.totalBirdsHunted, totalHerbicidePlanesSpawned: this.totalHerbicidePlanesSpawned,
            environmentState: this.environmentState,
        }));
        stateToSave.grid.flat(2).forEach((entity: CellContent) => {
            if (entity.type === 'flower') (entity as Flower).imageData = '';
            else if (entity.type === 'flowerSeed') { /* Seeds have no image data to strip */ }
        });
        return stateToSave;
    }

    public async loadState(savedPayload: {params: SimulationParams, grid: Grid, tick: number, totalInsectsEaten?: number, totalBirdsHunted?: number, totalHerbicidePlanesSpawned?: number, environmentState?: EnvironmentState}) {
        const { params: loadedParams, grid: loadedGrid, tick: loadedTick, totalInsectsEaten: loadedTotalInsectsEaten, totalBirdsHunted: loadedTotalBirdsHunted, totalHerbicidePlanesSpawned: loadedTotalHerbicidePlanes, environmentState: loadedEnvState } = savedPayload;
        if (!loadedGrid || !loadedParams) {
            console.error("Aborting load: Invalid state.", savedPayload);
            return;
        }

        this.params = { ...DEFAULT_SIM_PARAMS, ...loadedParams };
        this.tick = loadedTick; 
        this.totalInsectsEaten = loadedTotalInsectsEaten || 0;
        this.totalBirdsHunted = loadedTotalBirdsHunted || 0;
        this.totalHerbicidePlanesSpawned = loadedTotalHerbicidePlanes || 0;
        this.grid = loadedGrid;
        this.flowerWorkerPort?.postMessage({ type: 'update-params', payload: this.params });
        
        // Restore environment state, with fallback for older saves
        this.environmentState = loadedEnvState || {
            currentTemperature: this.params.temperature,
            currentHumidity: this.params.humidity,
            season: 'Summer',
            currentWeatherEvent: { type: 'none', duration: 0 },
        };
        
        // Reset transient state
        this.insectCountHistory = [];
        this.birdCountHistory = [];
        this.birdSpawnCooldown = 0;
        this.eagleSpawnCooldown = 0;
        this.herbicideCooldown = 0;
        this.lastInsectTrend = 'stable';
        this.completedFlowersQueue = [];

        const regenerationPromises = this.grid.flat(2).map(entity => {
            if (entity.type === 'flower' && entity.genome) {
                return this.flowerService.drawFlower(entity.genome)
                    .then(result => { if (result?.image) entity.imageData = result.image; })
                    .catch(err => console.error(`Failed to regenerate image for flower ${entity.id}`, err));
            }
            if (entity.type === 'insect') {
                if (!entity.emoji) entity.emoji = getInsectEmoji(entity.id);
                if (entity.lifespan === undefined) entity.lifespan = INSECT_LIFESPAN; // Backwards compatibility
            }
            return Promise.resolve();
        });
        await Promise.all(regenerationPromises);
    }

    public setParams(newParams: SimulationParams) {
        this.params = newParams;
        this.tick = 0;
        this.totalInsectsEaten = 0;
        this.totalBirdsHunted = 0;
        this.totalHerbicidePlanesSpawned = 0;
        this.insectCountHistory = [];
        this.birdCountHistory = [];
        this.birdSpawnCooldown = 0;
        this.eagleSpawnCooldown = 0;
        this.herbicideCooldown = 0;
        this.lastInsectTrend = 'stable';
        this.completedFlowersQueue = [];
        this.environmentState = {
            currentTemperature: newParams.temperature,
            currentHumidity: newParams.humidity,
            season: 'Summer',
            currentWeatherEvent: { type: 'none', duration: 0 },
        };
        this.flowerWorkerPort?.postMessage({ type: 'update-params', payload: this.params });
    }
}
