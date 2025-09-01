import type { Grid, SimulationParams, CellContent, Flower, Bird, Insect, Egg, Nutrient, FEService, ToastMessage, TickSummary, Coord } from '../types';
import { INSECT_REPRODUCTION_CHANCE, EGG_HATCH_TIME, INSECT_LIFESPAN } from '../constants';
import { getInsectEmoji } from '../utils';
import { Quadtree, Rectangle } from './Quadtree';
import { initializeGridState, createNewFlower } from './simulationInitializer';
import { findCellForStationaryActor, cloneActor } from './simulationUtils';
import { processBirdTick } from './behaviors/birdBehavior';
import { processEggTick } from './behaviors/eggBehavior';
import { processFlowerTick } from './behaviors/flowerBehavior';
import { processInsectTick } from './behaviors/insectBehavior';
import { processNutrientTick } from './behaviors/nutrientBehavior';
import { FLOWER_NUTRIENT_HEAL } from '../constants';

export class SimulationEngine {
    private tick = 0;
    private grid: Grid = [];
    private params: SimulationParams;
    private flowerService: FEService;
    private totalInsectsEaten = 0;

    constructor(params: SimulationParams, flowerService: FEService) {
        this.params = params;
        this.flowerService = flowerService;
        this.flowerService.setParams({ radius: this.params.flowerDetailRadius, numLayers: 2, P: 6.0, bias: 1.0 });
    }

    public async initializeGrid() {
        this.grid = await initializeGridState(this.params, this.flowerService);
    }
    
    public async calculateNextTick(): Promise<{ toasts: Omit<ToastMessage, 'id'>[]; summary: TickSummary }> {
        const { gridWidth, gridHeight } = this.params;
        const currentActors = this.grid.flat(2);
        const toasts: Omit<ToastMessage, 'id'>[] = [];
        let insectsEatenThisTick = 0;
        let eggsEatenThisTick = 0;
        let insectsDiedOfOldAgeThisTick = 0;
        let eggsLaidThisTick = 0;
        let insectsBornThisTick = 0;

        const nextActorState = new Map<string, CellContent>(
            currentActors.map(actor => [actor.id, cloneActor(actor)])
        );

        const newFlowerPromises: Promise<Flower | null>[] = [];
        const newFlowerPositions: Coord[] = [];

        // --- Quadtree Setup Phase ---
        const boundary = new Rectangle(gridWidth / 2, gridHeight / 2, gridWidth / 2, gridHeight / 2);
        const qtree = new Quadtree<CellContent>(boundary, 4);
        const flowerQtree = new Quadtree<CellContent>(boundary, 4); // For insect AI
        
        for (const actor of currentActors) {
            qtree.insert({ x: actor.x, y: actor.y, data: actor });
            if (actor.type === 'flower') {
                flowerQtree.insert({ x: actor.x, y: actor.y, data: actor });
            }
        }
        
        // --- Nutrient Healing Phase ---
        const nutrientsToProcess = currentActors.filter(a => a.type === 'nutrient') as Nutrient[];
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

        // --- Actor Logic Phase ---
        const createFlowerCallback = (x: number, y: number, g1?: string, g2?: string) => createNewFlower(this.flowerService, this.params, x, y, g1, g2);

        for (const currentActor of currentActors) {
            if (!nextActorState.has(currentActor.id)) continue;

            const actor = nextActorState.get(currentActor.id)!;

            switch (actor.type) {
                case 'bird':
                    processBirdTick(actor as Bird, {
                        grid: this.grid,
                        params: this.params,
                        qtree,
                        nextActorState,
                        toasts,
                        incrementInsectsEaten: () => {
                            insectsEatenThisTick++;
                            this.totalInsectsEaten++;
                        },
                        incrementEggsEaten: () => {
                            eggsEatenThisTick++;
                        }
                    });
                    break;
                case 'insect':
                    processInsectTick(actor as Insect, {
                        grid: this.grid,
                        params: this.params,
                        nextActorState,
                        createNewFlower: createFlowerCallback,
                        flowerQtree,
                        toasts,
                        incrementInsectsDiedOfOldAge: () => {
                            insectsDiedOfOldAgeThisTick++;
                        }
                    }, newFlowerPromises, newFlowerPositions);
                    break;
                case 'flower': {
                    const flower = actor as Flower;
                    processFlowerTick(flower, {
                        grid: this.grid,
                        params: this.params,
                        createNewFlower: createFlowerCallback,
                    }, newFlowerPromises, newFlowerPositions);
                    if (flower.health <= 0) {
                        nextActorState.delete(flower.id);
                    }
                    break;
                }
                case 'egg':
                    processEggTick(actor as Egg, {
                        nextActorState,
                        toasts,
                        incrementInsectsBorn: () => {
                            insectsBornThisTick++;
                        }
                    });
                    break;
                case 'nutrient':
                    processNutrientTick(actor as Nutrient, { nextActorState });
                    break;
            }
        }
        
        // --- Insect Reproduction Phase ---
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
            const nearby = insectQtree.query(range).map(p => p.data as Insect);
            const partners = nearby.filter(other => other.id !== insect.id && other.emoji === insect.emoji && !reproducedInsects.has(other.id));

            if (partners.length > 0) {
                const partner = partners[0];
                if (Math.random() < INSECT_REPRODUCTION_CHANCE) {
                    const spot = findCellForStationaryActor(this.grid, this.params, 'egg', { x: insect.x, y: insect.y });
                    if (spot) {
                        const eggId = `egg-${spot.x}-${spot.y}-${Date.now()}`;
                        const newEgg: Egg = { id: eggId, type: 'egg', x: spot.x, y: spot.y, hatchTimer: EGG_HATCH_TIME, insectEmoji: insect.emoji };
                        nextActorState.set(eggId, newEgg);
                        eggsLaidThisTick++;
                        reproducedInsects.add(insect.id);
                        reproducedInsects.add(partner.id);
                        toasts.push({ message: `${insect.emoji} laid an egg!`, type: 'info' });
                    }
                }
            }
        }

        // --- Finalization Phase ---
        const newFlowers = await Promise.all(newFlowerPromises);
        newFlowers.forEach((flower, i) => {
            if (flower) {
                const pos = newFlowerPositions[i];
                const isOccupied = Array.from(nextActorState.values()).some(a => a.x === pos.x && a.y === pos.y && a.type === 'flower');
                if (!isOccupied) nextActorState.set(flower.id, flower);
            }
        });

        const nextGrid: Grid = Array.from({ length: gridHeight }, () => Array.from({ length: gridWidth }, () => []));
        for (const actor of nextActorState.values()) {
            if(actor.x >= 0 && actor.x < gridWidth && actor.y >= 0 && actor.y < gridHeight) {
                nextGrid[actor.y][actor.x].push(actor);
            }
        }
        
        // --- Summary Calculation ---
        let flowerCount = 0, insectCount = 0, birdCount = 0, maxFlowerAge = 0;
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
        }

        const summary: TickSummary = {
            tick: this.tick, flowerCount, insectCount, birdCount,
            reproductions: newFlowers.filter(Boolean).length,
            insectsEaten: insectsEatenThisTick, totalInsectsEaten: this.totalInsectsEaten, maxFlowerAge,
            eggsLaid: eggsLaidThisTick,
            insectsBorn: insectsBornThisTick,
            eggsEaten: eggsEatenThisTick,
            insectsDiedOfOldAge: insectsDiedOfOldAgeThisTick,
            avgHealth: flowerCount > 0 ? totalHealth / flowerCount : 0, avgStamina: flowerCount > 0 ? totalStamina / flowerCount : 0,
            maxHealth: maxHealthSoFar, maxStamina: maxStaminaSoFar, maxToxicity: maxToxicitySoFar,
            avgNutrientEfficiency: flowerCount > 0 ? totalNutrientEfficiency / flowerCount : 0,
            avgMaturationPeriod: flowerCount > 0 ? totalMaturationPeriod / flowerCount : 0,
            avgVitality: flowerCount > 0 ? totalVitality / flowerCount : 0, avgAgility: flowerCount > 0 ? totalAgility / flowerCount : 0,
            avgStrength: flowerCount > 0 ? totalStrength / flowerCount : 0, avgIntelligence: flowerCount > 0 ? totalIntelligence / flowerCount : 0,
            avgLuck: flowerCount > 0 ? totalLuck / flowerCount : 0,
        };
        
        this.grid = nextGrid;
        this.tick++;

        return { toasts, summary };
    }

    public getGridState() { return { grid: this.grid, tick: this.tick }; }

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

        this.params = loadedParams; this.tick = loadedTick; this.totalInsectsEaten = loadedTotalInsectsEaten || 0;
        this.grid = loadedGrid;
        this.flowerService.setParams({ radius: this.params.flowerDetailRadius, numLayers: 2, P: 6.0, bias: 1.0 });

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
        this.flowerService.setParams({ radius: this.params.flowerDetailRadius, numLayers: 2, P: 6.0, bias: 1.0 });
    }
}
