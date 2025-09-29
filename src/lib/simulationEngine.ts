import type { Grid, SimulationParams, CellContent, Flower, Bird, Insect, Egg, Nutrient, FEService, AppEvent, TickSummary, Eagle, HerbicidePlane, HerbicideSmoke, ActorDelta, FlowerSeed, EnvironmentState, Season, Corpse, Cockroach } from '../types';
import { getInsectEmoji, generateRandomInsectGenome } from '../utils';
import { buildQuadtrees, cloneActor, findEmptyCell, findCellForFlowerSpawn } from './simulationUtils';
import { processBirdTick } from './behaviors/birdBehavior';
import { processEggTick } from './behaviors/eggBehavior';
import { processFlowerTick, processFlowerSeedTick } from './behaviors/flowerBehavior';
import { processInsectTick } from './behaviors/insectBehavior';
import { processNutrientTick } from './behaviors/nutrientBehavior';
import { processEagleTick } from './behaviors/eagleBehavior';
import { processHerbicidePlaneTick } from './behaviors/herbicidePlaneBehavior';
import { processHerbicideSmokeTick } from './behaviors/herbicideSmokeBehavior';
import { processCorpseTick } from './behaviors/corpseBehavior';
import { processCockroachTick } from './behaviors/cockroachBehavior';
import { db } from '../services/db';
import { PopulationManager } from './populationManager';
import { AsyncFlowerFactory } from './asyncFlowerFactory';
import * as ecosystemManager from './ecosystemManager';
import { DEFAULT_SIM_PARAMS, INSECT_DATA } from '../constants';
import { Quadtree } from './Quadtree';
import { updateEnvironment } from './environmentManager';

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

export class SimulationEngine {
    private tick = 0;
    private grid: Grid = [];
    private params: SimulationParams;
    private flowerService: FEService;
    private totalInsectsEaten = 0;
    
    // Environment state
    private environmentState: EnvironmentState;
    
    // Managers and Factories
    private populationManager: PopulationManager;
    private asyncFlowerFactory: AsyncFlowerFactory;
    
    private longestLivedChampion: { value: number } = { value: 0 };
    private mostToxicChampion: { value: number } = { value: 0 };
    private mostHealingChampion: { value: number } = { value: 0 };

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
        this.populationManager = new PopulationManager(params);
        this.asyncFlowerFactory = new AsyncFlowerFactory();
        this.environmentState = {
            currentTemperature: params.temperature,
            currentHumidity: params.humidity,
            season: 'Summer',
            currentWeatherEvent: { type: 'none', duration: 0 },
        };
        this.loadChampionsFromDb();
    }
    
    private async loadChampionsFromDb() {
        try {
            const longestLived = await db.seedBank.get('longestLived');
            if (longestLived) {
                this.longestLivedChampion.value = longestLived.value;
            }
            const mostToxic = await db.seedBank.get('mostToxic');
            if (mostToxic) {
                this.mostToxicChampion.value = mostToxic.value;
            }
            const mostHealing = await db.seedBank.get('mostHealing');
            if (mostHealing) {
                this.mostHealingChampion.value = mostHealing.value;
            }
        } catch (error) {
            console.error("Failed to load champions from DB:", error);
        }
    }

    private async _checkAndSaveChampion(flower: Flower, events: AppEvent[]) {
        let newChampion = false;
        if (flower.age > this.longestLivedChampion.value) {
            this.longestLivedChampion.value = flower.age;
            const imageData = await this.flowerService.drawFlower(flower.genome).then(r => r.image);
            await db.seedBank.put({
                category: 'longestLived',
                genome: flower.genome,
                value: flower.age,
                imageData: imageData,
                sex: flower.sex,
            });
            events.push({ message: `🏆 New champion saved! Longest Lived: ${flower.age} ticks.`, type: 'success', importance: 'high' });
            newChampion = true;
        }

        if (flower.toxicityRate > this.mostToxicChampion.value) {
            this.mostToxicChampion.value = flower.toxicityRate;
            const imageData = await this.flowerService.drawFlower(flower.genome).then(r => r.image);
            await db.seedBank.put({
                category: 'mostToxic',
                genome: flower.genome,
                value: flower.toxicityRate,
                imageData: imageData,
                sex: flower.sex,
            });
            events.push({ message: `☠️ New champion saved! Most Toxic: ${(flower.toxicityRate * 100).toFixed(0)}%.`, type: 'success', importance: 'high' });
            newChampion = true;
        }
        
        if (flower.toxicityRate < this.mostHealingChampion.value) {
            this.mostHealingChampion.value = flower.toxicityRate;
            const imageData = await this.flowerService.drawFlower(flower.genome).then(r => r.image);
            await db.seedBank.put({
                category: 'mostHealing',
                genome: flower.genome,
                value: flower.toxicityRate,
                imageData: imageData,
                sex: flower.sex,
            });
            events.push({ message: `🌿 New champion saved! Most Healing: ${(flower.toxicityRate * -100).toFixed(0)}%.`, type: 'success', importance: 'high' });
            newChampion = true;
        }

        return newChampion;
    }

    private async _checkDeceasedChampions(initialActors: CellContent[], nextActorState: Map<string, CellContent>, events: AppEvent[]) {
        const promises: Promise<any>[] = [];
        for (const actor of initialActors) {
            if (actor.type === 'flower' && !nextActorState.has(actor.id)) {
                // This flower died this tick.
                promises.push(this._checkAndSaveChampion(actor as Flower, events));
            }
        }
        await Promise.all(promises);
    }
    
    public setFlowerWorkerPort(port: MessagePort, params: SimulationParams) {
        this.asyncFlowerFactory.setFlowerWorkerPort(port, params);
    }

    public setStemImage(imageData: string) {
        this.asyncFlowerFactory.setStemImage(imageData);
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


    private _resetTickCounters() {
        this.insectsEatenThisTick = 0;
        this.eggsEatenThisTick = 0;
        this.insectsDiedOfOldAgeThisTick = 0;
        this.eggsLaidThisTick = 0;
        this.insectsBornThisTick = 0;
        this.birdsHuntedThisTick = 0;
    }
    
    private _processActorTicks(
        actorsToProcess: CellContent[],
        nextActorState: Map<string, CellContent>,
        qtree: Quadtree<CellContent>,
        flowerQtree: Quadtree<CellContent>,
        events: AppEvent[],
        newActorQueue: CellContent[],
        claimedCellsThisTick: Set<string>
    ): void {
        const flowerContext = {
            grid: this.grid,
            params: this.params,
            asyncFlowerFactory: this.asyncFlowerFactory,
            currentTemperature: this.environmentState.currentTemperature,
            nextActorState,
            claimedCellsThisTick,
        };
        const insectContext = {
            ...flowerContext,
            flowerQtree,
            events,
            incrementInsectsDiedOfOldAge: () => { this.insectsDiedOfOldAgeThisTick++; },
        };
        
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
                    processHerbicideSmokeTick(actor as HerbicideSmoke, { grid: this.grid, params: this.params, nextActorState, asyncFlowerFactory: this.asyncFlowerFactory });
                    break;
                case 'insect':
                    processInsectTick(actor as Insect, insectContext, newActorQueue);
                    break;
                case 'flower':
                    processFlowerTick(actor as Flower, flowerContext, newActorQueue);
                    break;
                case 'flowerSeed':
                    processFlowerSeedTick(actor as FlowerSeed, flowerContext);
                    break;
                case 'egg':
                    processEggTick(actor as Egg, { nextActorState, events, incrementInsectsBorn: () => { this.insectsBornThisTick++; }, params: this.params });
                    break;
                case 'nutrient':
                    processNutrientTick(actor as Nutrient, { nextActorState });
                    break;
                case 'corpse':
                    processCorpseTick(actor as Corpse, { nextActorState });
                    break;
                case 'cockroach':
                    processCockroachTick(actor as Cockroach, { params: this.params, qtree, flowerQtree, nextActorState });
                    break;
            }
        }
    }
    
    private _calculateTickSummary(nextActorState: Map<string, CellContent>, newFlowerCount: number, tickTimeMs: number): TickSummary {
        let flowerCountForStats = 0, seedCount = 0, insectCount = 0, birdCount = 0, eagleCount = 0, eggCount = 0;
        let herbicidePlaneCount = 0, herbicideSmokeCount = 0, maxFlowerAge = 0, nutrientCount = 0, corpseCount = 0, cockroachCount = 0;
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
            } else if (actor.type === 'corpse') {
                corpseCount++;
            } else if (actor.type === 'cockroach') {
                cockroachCount++;
            }
        }

        const flowerDensity = (flowerCountForStats + seedCount) / (this.params.gridWidth * this.params.gridHeight);
        const totalInsectCount = insectCount + cockroachCount;

        return {
            tick: this.tick,
            flowerCount: flowerCountForStats + seedCount,
            insectCount: totalInsectCount,
            birdCount, eagleCount, eggCount, herbicidePlaneCount, herbicideSmokeCount, corpseCount, cockroachCount,
            reproductions: newFlowerCount,
            insectsEaten: this.insectsEatenThisTick, totalInsectsEaten: this.totalInsectsEaten, maxFlowerAge,
            totalBirdsHunted: this.populationManager.totalBirdsHunted, totalHerbicidePlanesSpawned: this.populationManager.totalHerbicidePlanesSpawned,
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
            pendingFlowerRequests: this.asyncFlowerFactory.getPendingRequestCount(),
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
                    if(actor.type === 'flowerSeed') {
                        this.asyncFlowerFactory.cancelFlowerRequest(actor.id);
                    }
                } else {
                    // This is the first flower/seed in this cell, claim it.
                    occupiedCells.add(coordKey);
                }
            }
        }
    }

    private _updateEnvironment(events: AppEvent[]): Season {
        const previousSeason = this.environmentState.season;
        this.environmentState = updateEnvironment(this.tick, this.params, this.environmentState, events);
        return previousSeason;
    }

    public async calculateNextTick(): Promise<{ events: AppEvent[]; summary: TickSummary; deltas: ActorDelta[] }> {
        const tickStartTime = performance.now();
        this._resetTickCounters();
        const events: AppEvent[] = [];
        let newFlowerCount = 0;
        
        const previousSeason = this._updateEnvironment(events);
        
        const initialActors = this.grid.flat(2).map(cloneActor);
        const nextActorState = new Map<string, CellContent>(initialActors.map(actor => [actor.id, cloneActor(actor)]));
        const claimedCellsThisTick = new Set<string>();

        // Spring Repopulation Logic
        if (previousSeason === 'Winter' && this.environmentState.season === 'Spring') {
            const flowerCount = Array.from(nextActorState.values()).filter(a => a.type === 'flower' || a.type === 'flowerSeed').length;
            const insectCount = Array.from(nextActorState.values()).filter(a => a.type === 'insect').length;

            if (flowerCount <= this.params.initialFlowers || insectCount <= this.params.initialInsects) {
                events.push({ message: '🌱 Spring has arrived, and new life stirs in the garden!', type: 'success', importance: 'high' });                          
                const tempGridForPlacement = this.grid.map(row => row.map(cell => [...cell]));
                
                if (flowerCount <= this.params.initialFlowers) {
                    const seedsFromBank = await db.seedBank.toArray();
                    for (let i = 0; i < this.params.initialFlowers; i++) {
                        const pos = findCellForFlowerSpawn(tempGridForPlacement, this.params, undefined, claimedCellsThisTick);
                        if (pos) {
                            claimedCellsThisTick.add(`${pos.x},${pos.y}`);
                            let seed: FlowerSeed | null;
                            if (seedsFromBank.length > 0) {
                                const randomSeed = seedsFromBank[Math.floor(Math.random() * seedsFromBank.length)];
                                seed = this.asyncFlowerFactory.requestNewFlower(nextActorState, pos.x, pos.y, randomSeed.genome);
                            } else {
                                seed = this.asyncFlowerFactory.requestNewFlower(nextActorState, pos.x, pos.y);
                            }
                            if (seed) {
                               nextActorState.set(seed.id, seed);
                               tempGridForPlacement[pos.y][pos.x].push(seed);
                            }
                        }
                    }
                }
    
                if (insectCount <= this.params.initialInsects) {
                    for (let i = 0; i < this.params.initialInsects; i++) {
                         const pos = findEmptyCell(tempGridForPlacement, this.params);
                         if (pos) {
                            const id = `insect-repop-${i}-${Date.now()}`;
                            const emoji = getInsectEmoji(id);
                            const baseStats = INSECT_DATA.get(emoji);
                            if (baseStats) {
                                const newInsect: Insect = { 
                                    id, type: 'insect', x: pos.x, y: pos.y, 
                                    pollen: null, emoji, 
                                    genome: generateRandomInsectGenome(),
                                    health: baseStats.maxHealth,
                                    maxHealth: baseStats.maxHealth,
                                    stamina: baseStats.maxStamina,
                                    maxStamina: baseStats.maxStamina
                                };
                                nextActorState.set(id, newInsect);
                                tempGridForPlacement[pos.y][pos.x].push(newInsect);
                            }
                         }
                    }
                }
            }
        }
        
        // Process flowers that were created in the background
        const { flowersToAdd, seedsToRemove } = this.asyncFlowerFactory.getCompletedFlowers(nextActorState);
        for (const seedId of seedsToRemove) {
            nextActorState.delete(seedId);
        }
        for (const flower of flowersToAdd) {
            nextActorState.set(flower.id, flower);
            newFlowerCount++;
            events.push({ message: '🌱 A new flower has bloomed!', type: 'success', importance: 'low' });
        }
        
        const { qtree, flowerQtree } = buildQuadtrees(Array.from(nextActorState.values()), this.params);
        
        ecosystemManager.processNutrientHealing(nextActorState, qtree);

        const newActorQueue: CellContent[] = [];
        this._processActorTicks(initialActors, nextActorState, qtree, flowerQtree, events, newActorQueue, claimedCellsThisTick);
        
        await this._checkDeceasedChampions(initialActors, nextActorState, events);

        this.populationManager.totalBirdsHunted += this.birdsHuntedThisTick;

        // --- Safeguard for Queued Actors ---
        const newActorQueueOccupiedCells = new Set<string>();
        const finalNewActorQueue = newActorQueue.filter(actor => {
            const coordKey = `${actor.x},${actor.y}`;
            if (newActorQueueOccupiedCells.has(coordKey) || claimedCellsThisTick.has(coordKey)) {
                // If a cell is already claimed by another new actor, discard this one and cancel its request.
                if(actor.type === 'flowerSeed') {
                    this.asyncFlowerFactory.cancelFlowerRequest(actor.id);
                }
                return false;
            }
            newActorQueueOccupiedCells.add(coordKey);
            return true;
        });
        
        for (const actor of finalNewActorQueue) {
            nextActorState.set(actor.id, actor);
        }

        this.eggsLaidThisTick += ecosystemManager.handleInsectReproduction(nextActorState, this.params, events);
        
        // Enforce one flower/seed per cell rule before summarizing and creating deltas
        this._resolveFlowerAndSeedConflicts(nextActorState);
        
        const tickEndTime = performance.now();
        const tickTimeMs = tickEndTime - tickStartTime;
        const summary = this._calculateTickSummary(nextActorState, newFlowerCount, tickTimeMs);

        const newPopulationActors = this.populationManager.processTick(nextActorState, this.grid, summary, events);
        for (const actor of newPopulationActors) {
            nextActorState.set(actor.id, actor);
        }
        
        const deltas = this._calculateDeltas(initialActors, nextActorState);
        
        this._updateGrid(nextActorState);
        
        this.tick++;

        return { events, summary, deltas };
    }

    public getGridState() { return { grid: this.grid, tick: this.tick, params: this.params }; }

    public getStateForSave() {
        const stateToSave = JSON.parse(JSON.stringify({ 
            params: this.params, grid: this.grid, tick: this.tick, 
            totalInsectsEaten: this.totalInsectsEaten,
            totalBirdsHunted: this.populationManager.totalBirdsHunted, 
            totalHerbicidePlanesSpawned: this.populationManager.totalHerbicidePlanesSpawned,
            environmentState: this.environmentState,
        }));
        stateToSave.grid.flat(2).forEach((entity: CellContent) => {
            if (entity.type === 'flower') (entity as Flower).imageData = '';
            else if (entity.type === 'flowerSeed') { /* Seeds have no image data to strip */ }
        });
        return stateToSave;
    }

    public async loadState(savedPayload: {params: SimulationParams, grid: Grid, tick: number, totalInsectsEaten?: number, totalBirdsHunted?: number, totalHerbicidePlanesSpawned?: number, environmentState?: EnvironmentState}) {
        const { params: loadedParams, grid: loadedGrid, tick: loadedTick, totalInsectsEaten: loadedTotalInsectsEaten, environmentState: loadedEnvState } = savedPayload;
        if (!loadedGrid || !loadedParams) {
            console.error("Aborting load: Invalid state.", savedPayload);
            return;
        }

        this.params = { ...DEFAULT_SIM_PARAMS, ...loadedParams };
        this.tick = loadedTick; 
        this.totalInsectsEaten = loadedTotalInsectsEaten || 0;
        this.populationManager.loadState(savedPayload);
        this.grid = loadedGrid;
        this.asyncFlowerFactory.updateParams(this.params);
        
        this.environmentState = loadedEnvState || {
            currentTemperature: this.params.temperature,
            currentHumidity: this.params.humidity,
            season: 'Summer',
            currentWeatherEvent: { type: 'none', duration: 0 },
        };
        
        this.loadChampionsFromDb();

        const regenerationPromises = this.grid.flat(2).map(entity => {
            if (entity.type === 'flower' && entity.genome) {
                return this.flowerService.drawFlower(entity.genome)
                    .then(result => { if (result?.image) entity.imageData = result.image; })
                    .catch(err => console.error(`Failed to regenerate image for flower ${entity.id}`, err));
            }
            if (entity.type === 'insect' || entity.type === 'cockroach') {
                const insect = entity as Insect | Cockroach;
                if (!insect.emoji) {
                     insect.emoji = entity.type === 'cockroach' ? '🪳' : getInsectEmoji(insect.id);
                }
                
                // Backward compatibility for saves from before the health/stamina update
                if ((insect as any).lifespan !== undefined && insect.health === undefined) {
                    const baseStats = INSECT_DATA.get(insect.emoji);
                    if (baseStats) {
                        insect.maxHealth = baseStats.maxHealth;
                        insect.health = ((insect as any).lifespan / 100) * baseStats.maxHealth;
                        insect.maxStamina = baseStats.maxStamina;
                        insect.stamina = baseStats.maxStamina;
                        insect.genome = generateRandomInsectGenome();
                        delete (insect as any).lifespan;
                    }
                }
            }
            return Promise.resolve();
        });
        await Promise.all(regenerationPromises);
    }

    public setParams(newParams: SimulationParams) {
        this.params = newParams;
        this.tick = 0;
        this.totalInsectsEaten = 0;
        this.populationManager.updateParams(newParams);
        this.asyncFlowerFactory.reset();
        this.asyncFlowerFactory.updateParams(this.params);
        this.environmentState = {
            currentTemperature: newParams.temperature,
            currentHumidity: newParams.humidity,
            season: 'Summer',
            currentWeatherEvent: { type: 'none', duration: 0 },
        };
        this.loadChampionsFromDb();
    }
}
