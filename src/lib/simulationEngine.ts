import type { Grid, SimulationParams, CellContent, Flower, Bird, Insect, Egg, Nutrient, FEService, AppEvent, TickSummary, Coord, Eagle, HerbicidePlane, HerbicideSmoke, PopulationTrend, ActorDelta } from '../types';
import { INSECT_REPRODUCTION_CHANCE, EGG_HATCH_TIME, INSECT_LIFESPAN, POPULATION_TREND_WINDOW, POPULATION_GROWTH_THRESHOLD_INSECT, POPULATION_DECLINE_THRESHOLD_INSECT, BIRD_SPAWN_COOLDOWN, EAGLE_SPAWN_COOLDOWN, DEFAULT_SIM_PARAMS } from '../constants';
import { getInsectEmoji } from '../utils';
import { Quadtree, Rectangle } from './Quadtree';
import { initializeGridState, createNewFlower } from './simulationInitializer';
import { findCellForStationaryActor, cloneActor, calculatePopulationTrend, buildQuadtrees } from './simulationUtils';
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

export class SimulationEngine {
    private tick = 0;
    private grid: Grid = [];
    private params: SimulationParams;
    private flowerService: FEService;
    private totalInsectsEaten = 0;
    
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

    constructor(params: SimulationParams, flowerService: FEService) {
        this.params = params;
        this.flowerService = flowerService;
        this.flowerService.setParams({ radius: this.params.flowerDetailRadius, numLayers: 2, P: 6.0, bias: 1.0 });
    }

    public async initializeGrid() {
        this.grid = await initializeGridState(this.params, this.flowerService);
    }

    private _resetTickCounters() {
        this.insectsEatenThisTick = 0;
        this.eggsEatenThisTick = 0;
        this.insectsDiedOfOldAgeThisTick = 0;
        this.eggsLaidThisTick = 0;
        this.insectsBornThisTick = 0;
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
        
        const flowerCountForDensity = Array.from(nextActorState.values()).filter(a => a.type === 'flower').length;
        const totalCells = gridWidth * gridHeight;
        const flowerDensityThresholdCount = totalCells * this.params.herbicideFlowerDensityThreshold;
        const hasPlane = Array.from(nextActorState.values()).some(a => a.type === 'herbicidePlane');
        
        if (this.herbicideCooldown === 0 && !hasPlane && flowerCountForDensity >= flowerDensityThresholdCount) {
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
        events: AppEvent[]
    ): { newFlowerPromises: Promise<Flower | null>[], newFlowerPositions: Coord[] } {
        const newFlowerPromises: Promise<Flower | null>[] = [];
        const newFlowerPositions: Coord[] = [];
        const createFlowerCallback = (x: number, y: number, g1?: string, g2?: string) => createNewFlower(this.flowerService, this.params, x, y, g1, g2);
        
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
                    processEagleTick(actor as Eagle, { grid: this.grid, params: this.params, qtree, nextActorState, events });
                    break;
                case 'herbicidePlane':
                    processHerbicidePlaneTick(actor as HerbicidePlane, { grid: this.grid, params: this.params, nextActorState });
                    break;
                case 'herbicideSmoke':
                    processHerbicideSmokeTick(actor as HerbicideSmoke, { grid: this.grid, params: this.params, nextActorState });
                    break;
                case 'insect':
                    processInsectTick(actor as Insect, { grid: this.grid, params: this.params, nextActorState, createNewFlower: createFlowerCallback, flowerQtree, events,
                        incrementInsectsDiedOfOldAge: () => { this.insectsDiedOfOldAgeThisTick++; }
                    }, newFlowerPromises, newFlowerPositions);
                    break;
                case 'flower': {
                    const flower = actor as Flower;
                    processFlowerTick(flower, { grid: this.grid, params: this.params, createNewFlower: createFlowerCallback }, newFlowerPromises, newFlowerPositions);
                    if (flower.health <= 0) nextActorState.delete(flower.id);
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
        return { newFlowerPromises, newFlowerPositions };
    }
    
    private _handleInsectReproduction(nextActorState: Map<string, CellContent>, events: AppEvent[]): void {
        const { gridWidth, gridHeight } = this.params;
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
            if (reproducedInsects.has(insect.id)) continue;

            const range = new Rectangle(insect.x, insect.y, 0.5, 0.5);
            const partners = insectQtree.query(range).map(p => p.data as Insect).filter(other => other.id !== insect.id && other.emoji === insect.emoji && !reproducedInsects.has(other.id));

            if (partners.length > 0 && Math.random() < INSECT_REPRODUCTION_CHANCE) {
                const spot = findCellForStationaryActor(this.grid, this.params, 'egg', { x: insect.x, y: insect.y });
                if (spot) {
                    const eggId = `egg-${spot.x}-${spot.y}-${Date.now()}`;
                    nextActorState.set(eggId, { id: eggId, type: 'egg', x: spot.x, y: spot.y, hatchTimer: EGG_HATCH_TIME, insectEmoji: insect.emoji });
                    this.eggsLaidThisTick++;
                    reproducedInsects.add(insect.id).add(partners[0].id);
                    events.push({ message: `${insect.emoji} laid an egg!`, type: 'info', importance: 'low' });
                }
            }
        }
    }
    
    private async _finalizeNewFlowers(
        newFlowerPromises: Promise<Flower | null>[], 
        newFlowerPositions: Coord[], 
        nextActorState: Map<string, CellContent>
    ): Promise<number> {
        const newFlowers = await Promise.all(newFlowerPromises);
        let newFlowerCount = 0;
        newFlowers.forEach((flower, i) => {
            if (flower) {
                const pos = newFlowerPositions[i];
                const isOccupied = Array.from(nextActorState.values()).some(a => a.x === pos.x && a.y === pos.y && a.type === 'flower');
                if (!isOccupied) {
                    nextActorState.set(flower.id, flower);
                    newFlowerCount++;
                }
            }
        });
        return newFlowerCount;
    }
    
    private _calculateTickSummary(nextActorState: Map<string, CellContent>, newFlowerCount: number): TickSummary {
        let flowerCount = 0, insectCount = 0, birdCount = 0, eagleCount = 0, herbicidePlaneCount = 0, herbicideSmokeCount = 0, maxFlowerAge = 0;
        let totalHealth = 0, totalStamina = 0, totalNutrientEfficiency = 0, totalMaturationPeriod = 0;
        let maxHealthSoFar = 0, maxStaminaSoFar = 0, maxToxicitySoFar = 0;
        let totalVitality = 0, totalAgility = 0, totalStrength = 0, totalIntelligence = 0, totalLuck = 0;

        for (const actor of nextActorState.values()) {
            if (actor.type === 'flower') {
                const f = actor as Flower;
                flowerCount++; maxFlowerAge = Math.max(maxFlowerAge, f.age); totalHealth += f.health; totalStamina += f.stamina;
                totalNutrientEfficiency += f.nutrientEfficiency; totalMaturationPeriod += f.maturationPeriod;
                maxHealthSoFar = Math.max(maxHealthSoFar, f.maxHealth); maxStaminaSoFar = Math.max(maxStaminaSoFar, f.maxStamina);
                maxToxicitySoFar = Math.max(maxToxicitySoFar, f.toxicityRate);
                totalVitality += f.effects.vitality; totalAgility += f.effects.agility; totalStrength += f.effects.strength;
                totalIntelligence += f.effects.intelligence; totalLuck += f.effects.luck;
            } else if (actor.type === 'insect') insectCount++;
            else if (actor.type === 'bird') birdCount++;
            else if (actor.type === 'eagle') eagleCount++;
            else if (actor.type === 'herbicidePlane') herbicidePlaneCount++;
            else if (actor.type === 'herbicideSmoke') herbicideSmokeCount++;
        }

        this.insectCountHistory.push(insectCount);
        if (this.insectCountHistory.length > POPULATION_TREND_WINDOW) this.insectCountHistory.shift();
        this.birdCountHistory.push(birdCount);
        if (this.birdCountHistory.length > POPULATION_TREND_WINDOW) this.birdCountHistory.shift();

        return {
            tick: this.tick, flowerCount, insectCount, birdCount, eagleCount, herbicidePlaneCount, herbicideSmokeCount,
            reproductions: newFlowerCount,
            insectsEaten: this.insectsEatenThisTick, totalInsectsEaten: this.totalInsectsEaten, maxFlowerAge,
            eggsLaid: this.eggsLaidThisTick, insectsBorn: this.insectsBornThisTick, eggsEaten: this.eggsEatenThisTick,
            insectsDiedOfOldAge: this.insectsDiedOfOldAgeThisTick,
            avgHealth: flowerCount > 0 ? totalHealth / flowerCount : 0, avgStamina: flowerCount > 0 ? totalStamina / flowerCount : 0,
            maxHealth: maxHealthSoFar, maxStamina: maxStaminaSoFar, maxToxicity: maxToxicitySoFar,
            avgNutrientEfficiency: flowerCount > 0 ? totalNutrientEfficiency / flowerCount : 0,
            avgMaturationPeriod: flowerCount > 0 ? totalMaturationPeriod / flowerCount : 0,
            avgVitality: flowerCount > 0 ? totalVitality / flowerCount : 0, avgAgility: flowerCount > 0 ? totalAgility / flowerCount : 0,
            avgStrength: flowerCount > 0 ? totalStrength / flowerCount : 0, avgIntelligence: flowerCount > 0 ? totalIntelligence / flowerCount : 0,
            avgLuck: flowerCount > 0 ? totalLuck / flowerCount : 0,
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

    public async calculateNextTick(): Promise<{ events: AppEvent[]; summary: TickSummary; deltas: ActorDelta[] }> {
        this._resetTickCounters();
        const events: AppEvent[] = [];
        
        // Create a definitive list of actors that exist at the start of this tick.
        const actorsToProcess = this.grid.flat(2).map(cloneActor);
        const nextActorState = new Map<string, CellContent>(actorsToProcess.map(actor => [actor.id, cloneActor(actor)]));

        this._processCooldowns();

        // Population control now adds new actors directly to the state for the *next* tick.
        // These new actors will NOT be processed in the current tick loop.
        this._handlePopulationControl(nextActorState, events);
        
        const { qtree, flowerQtree } = buildQuadtrees(Array.from(nextActorState.values()), this.params);
        
        this._processNutrientHealing(nextActorState, qtree);

        // CRITICAL: Iterate over the original list of actors, not the potentially modified state.
        const { newFlowerPromises, newFlowerPositions } = this._processActorTicks(
            actorsToProcess, nextActorState, qtree, flowerQtree, events
        );

        this._handleInsectReproduction(nextActorState, events);

        const newFlowerCount = await this._finalizeNewFlowers(newFlowerPromises, newFlowerPositions, nextActorState);
        
        const summary = this._calculateTickSummary(nextActorState, newFlowerCount);
        
        // Deltas are calculated against the initial state and the final state.
        const deltas = this._calculateDeltas(actorsToProcess, nextActorState);
        
        this._updateGrid(nextActorState);
        
        this.tick++;

        return { events, summary, deltas };
    }

    public getGridState() { return { grid: this.grid, tick: this.tick, params: this.params }; }

    public getStateForSave() {
        const stateToSave = JSON.parse(JSON.stringify({ 
            params: this.params, grid: this.grid, tick: this.tick, totalInsectsEaten: this.totalInsectsEaten,
        }));
        stateToSave.grid.flat(2).forEach((entity: CellContent) => {
            if (entity.type === 'flower') (entity as Flower).imageData = '';
        });
        return stateToSave;
    }

    public async loadState(savedPayload: {params: SimulationParams, grid: Grid, tick: number, totalInsectsEaten?: number}) {
        const { params: loadedParams, grid: loadedGrid, tick: loadedTick, totalInsectsEaten: loadedTotalInsectsEaten } = savedPayload;
        if (!loadedGrid || !loadedParams) {
            console.error("Aborting load: Invalid state.", savedPayload);
            return;
        }

        this.params = { ...DEFAULT_SIM_PARAMS, ...loadedParams };
        this.tick = loadedTick; 
        this.totalInsectsEaten = loadedTotalInsectsEaten || 0;
        this.grid = loadedGrid;
        this.flowerService.setParams({ radius: this.params.flowerDetailRadius, numLayers: 2, P: 6.0, bias: 1.0 });
        
        // Reset transient state
        this.insectCountHistory = [];
        this.birdCountHistory = [];
        this.birdSpawnCooldown = 0;
        this.eagleSpawnCooldown = 0;
        this.herbicideCooldown = 0;
        this.lastInsectTrend = 'stable';

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
        this.insectCountHistory = [];
        this.birdCountHistory = [];
        this.birdSpawnCooldown = 0;
        this.eagleSpawnCooldown = 0;
        this.herbicideCooldown = 0;
        this.lastInsectTrend = 'stable';
        this.flowerService.setParams({ radius: this.params.flowerDetailRadius, numLayers: 2, P: 6.0, bias: 1.0 });
    }
}
