import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SimulationEngine } from './simulationEngine';
import { DEFAULT_SIM_PARAMS, POPULATION_TREND_WINDOW } from '../constants';
import type { FEService, Flower, FlowerGenomeStats, Grid, CellContent, Insect, Bird, ActorUpdateDelta, ActorAddDelta } from '../types';

// Mock the flower service, a dependency of the engine
const mockFlowerService: FEService = {
    initialize: vi.fn().mockResolvedValue(undefined),
    setParams: vi.fn(),
    makeFlower: vi.fn(),
    reproduce: vi.fn(),
    mutate: vi.fn(),
    getFlowerStats: vi.fn(),
    draw3DFlower: vi.fn(),
    drawFlower: vi.fn(),
};

// Default mock data
const mockFlowerData = { genome: 'test-genome', image: 'test-image-data' };
const mockFlowerStats: FlowerGenomeStats = {
    health: 100, stamina: 100, maturationPeriod: 50, sex: 'both',
    minTemperature: 10, maxTemperature: 30, toxicityRate: 0.1,
    effects: { vitality: 10, agility: 5, strength: 5, intelligence: 5, luck: 5 },
};

describe('SimulationEngine', () => {
    let engine: SimulationEngine;

    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(mockFlowerService.makeFlower).mockResolvedValue(mockFlowerData);
        vi.mocked(mockFlowerService.getFlowerStats).mockResolvedValue(mockFlowerStats);
        vi.mocked(mockFlowerService.drawFlower).mockResolvedValue({ genome: 'loaded-genome', image: 'loaded-image' });
        engine = new SimulationEngine(DEFAULT_SIM_PARAMS, mockFlowerService);
    });

    describe('Initialization and Setup', () => {
        it('should initialize with correct parameters', async () => {
            await engine.initializeGrid();
            const { grid } = engine.getGridState();
            const flowers = grid.flat(2).filter((c : CellContent) => c.type === 'flower');
            const insects = grid.flat(2).filter((c : CellContent) => c.type === 'insect');
            const birds = grid.flat(2).filter((c : CellContent) => c.type === 'bird');
            expect(flowers.length).toBe(DEFAULT_SIM_PARAMS.initialFlowers);
            expect(insects.length).toBe(DEFAULT_SIM_PARAMS.initialInsects);
            expect(birds.length).toBe(DEFAULT_SIM_PARAMS.initialBirds);
            expect(mockFlowerService.setParams).toHaveBeenCalledWith(expect.any(Object));
        });

        it('setParams should update parameters and reset tick count', async () => {
            await engine.calculateNextTick();
            expect(engine.getGridState().tick).toBe(1);
            const newParams = { ...DEFAULT_SIM_PARAMS, gridWidth: 5 };
            engine.setParams(newParams);
            expect(engine.getGridState().tick).toBe(0);
            await engine.initializeGrid();
            expect(engine.getGridState().grid[0].length).toBe(5);
        });
    });

    describe('State Persistence', () => {
        it('getStateForSave should return state with stripped image data', async () => {
            await engine.initializeGrid();
            const state = engine.getStateForSave();
            expect(state.params).toEqual(DEFAULT_SIM_PARAMS);
            expect(state.tick).toBe(0);
            const flower = state.grid.flat(2).find((c : CellContent) => c.type === 'flower') as Flower | undefined;
            expect(flower).toBeDefined();
            expect(flower?.imageData).toBe('');
        });

        it('loadState should restore state and regenerate flower images', async () => {
            const savedGrid: Grid = Array.from({ length: DEFAULT_SIM_PARAMS.gridHeight }, (_, y) =>
                Array.from({ length: DEFAULT_SIM_PARAMS.gridWidth }, (_, x) => {
                    if (x === 0 && y === 0) {
                        return [{
                            id: 'flower-saved-1', type: 'flower', x: 0, y: 0,
                            genome: 'saved-genome', imageData: '',
                            health: 50, stamina: 50, age: 10, isMature: false,
                            maxHealth: 100, maxStamina: 100, maturationPeriod: 50, nutrientEfficiency: 1,
                            sex: 'both', toxicityRate: 0, effects: { vitality: 0, agility: 0, strength: 0, intelligence: 0, luck: 0 },
                            minTemperature: 0, maxTemperature: 30
                        }];
                    }
                    return [];
                })
            );
            const savedState = { params: DEFAULT_SIM_PARAMS, grid: savedGrid, tick: 123 };
            await engine.loadState(savedState);
            const { grid, tick } = engine.getGridState();
            expect(tick).toBe(123);
            expect(mockFlowerService.drawFlower).toHaveBeenCalledWith('saved-genome');
            const loadedFlower = grid[0][0][0] as Flower;
            expect(loadedFlower.imageData).toBe('loaded-image');
        });
    });

    describe('Core Simulation Logic', () => {
        it('a flower should generate update deltas for stamina and health', async () => {
            engine.setParams({ ...DEFAULT_SIM_PARAMS, initialInsects: 0, initialBirds: 0, initialFlowers: 1 });
            await engine.initializeGrid();
            const initialFlower = engine.getGridState().grid.flat(2)[0] as Flower;
            const initialStamina = initialFlower.stamina;

            const { deltas: deltas1 } = await engine.calculateNextTick();
            const updateDelta1 = deltas1.find(d => d.type === 'update' && d.id === initialFlower.id) as ActorUpdateDelta;
            expect(updateDelta1).toBeDefined();
            expect((updateDelta1.changes as Partial<Flower>).stamina).toBeLessThan(initialStamina);
            expect((updateDelta1.changes as Partial<Flower>).health).toBeUndefined();

            // Manually set stamina to 0 to test health decrease
            (engine as any).grid.flat(2).forEach((c: CellContent) => { if(c.type === 'flower') (c as Flower).stamina = 0 });
            
            const { deltas: deltas2 } = await engine.calculateNextTick();
            const updateDelta2 = deltas2.find(d => d.type === 'update' && d.id === initialFlower.id) as ActorUpdateDelta;
            expect(updateDelta2).toBeDefined();
            expect((updateDelta2.changes as Partial<Flower>).health).toBeLessThan(initialFlower.health);
        });


        it('a bird should generate an update delta when moving towards an insect', async () => {
            engine.setParams({ ...DEFAULT_SIM_PARAMS, initialFlowers: 0, initialInsects: 2, initialBirds: 1 });
            await engine.initializeGrid();

            const bird = (engine as any).grid.flat(2).find((c: CellContent) => c.type === 'bird') as Bird;
            const insects = (engine as any).grid.flat(2).filter((c: CellContent) => c.type === 'insect') as Insect[];
            const farInsect = insects[0];
            const closeInsect = insects[1];

            bird.x = 5; bird.y = 5;
            farInsect.x = 14; farInsect.y = 9;
            closeInsect.x = 7; closeInsect.y = 7;

            const newGrid: Grid = Array.from({ length: DEFAULT_SIM_PARAMS.gridHeight }, () => Array.from({ length: DEFAULT_SIM_PARAMS.gridWidth }, () => []));
            newGrid[5][5].push(bird);
            newGrid[9][14].push(farInsect);
            newGrid[7][7].push(closeInsect);
            (engine as any).grid = newGrid;

            const { deltas } = await engine.calculateNextTick();
            
            const birdUpdateDelta = deltas.find(d => d.type === 'update' && d.id === bird.id) as ActorUpdateDelta;
            expect(birdUpdateDelta).toBeDefined();
            expect(birdUpdateDelta.changes.x).toBe(6);
            expect(birdUpdateDelta.changes.y).toBe(6);
        });

        it('a bird should eat an insect, generating correct deltas', async () => {
            engine.setParams({ ...DEFAULT_SIM_PARAMS, initialFlowers: 0, initialInsects: 1, initialBirds: 1 });
            await engine.initializeGrid();

            const bird = (engine as any).grid.flat(2).find((c: CellContent) => c.type === 'bird') as Bird;
            const insect = (engine as any).grid.flat(2).find((c: CellContent) => c.type === 'insect') as Insect;
            bird.x = 5; bird.y = 5;
            insect.x = 6; insect.y = 6;

            const newGrid: Grid = Array.from({ length: DEFAULT_SIM_PARAMS.gridHeight }, () => Array.from({ length: DEFAULT_SIM_PARAMS.gridWidth }, () => []));
            newGrid[5][5].push(bird);
            newGrid[6][6].push(insect);
            (engine as any).grid = newGrid;

            const { deltas } = await engine.calculateNextTick();

            const removeDelta = deltas.find(d => d.type === 'remove' && d.id === insect.id);
            expect(removeDelta).toBeDefined();

            const addDelta = deltas.find(d => d.type === 'add' && d.actor.type === 'nutrient') as ActorAddDelta | undefined;
            expect(addDelta).toBeDefined();
            expect(addDelta?.actor.x).toBe(insect.x);
            expect(addDelta?.actor.y).toBe(insect.y);
            
            const updateDelta = deltas.find(d => d.type === 'update' && d.id === bird.id) as ActorUpdateDelta | undefined;
            expect(updateDelta).toBeDefined();
            expect(updateDelta?.changes.x).toBe(insect.x);
            expect(updateDelta?.changes.y).toBe(insect.y);
        });
    });

    describe('Insect Reproduction', () => {
        it('should generate an add delta for an egg when two insects reproduce', async () => {
            engine.setParams({ ...DEFAULT_SIM_PARAMS, initialFlowers: 0, initialInsects: 2, initialBirds: 0 });
            await engine.initializeGrid();

            const insects = (engine as any).grid.flat(2).filter((c: CellContent) => c.type === 'insect') as Insect[];
            const insect1 = insects[0];
            const insect2 = insects[1];

            insect1.emoji = '🦋';
            insect2.emoji = '🦋';

            const newGrid: Grid = Array.from({ length: DEFAULT_SIM_PARAMS.gridHeight }, () => Array.from({ length: DEFAULT_SIM_PARAMS.gridWidth }, () => []));

            insect1.x = 5; insect1.y = 5;
            insect2.x = 5; insect2.y = 5;
            newGrid[5][5].push(insect1, insect2);

            (engine as any).grid = newGrid;

            const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.1);

            const { deltas, events } = await engine.calculateNextTick();
            
            const addDelta = deltas.find(d => d.type === 'add' && d.actor.type === 'egg');
            expect(addDelta).toBeDefined();
            expect(events.some(e => e.message === `${insect1.emoji} laid an egg!`)).toBe(true);

            randomSpy.mockRestore();
        });
    });

    describe('Population Control', () => {
        it('should generate an add delta for a new bird when insect population grows rapidly', async () => {
            // Set params for a controlled test
            engine.setParams({ ...DEFAULT_SIM_PARAMS, initialFlowers: 0, initialInsects: 20, initialBirds: 1 });
            await engine.initializeGrid();
    
            // Manually simulate population growth for POPULATION_TREND_WINDOW ticks
            for (let i = 0; i < POPULATION_TREND_WINDOW; i++) {
                const { grid } = engine.getGridState();
                const newInsect1: Insect = { id: `new-insect-${i}-a`, type: 'insect', x: 0, y: 0, emoji: '🐛', lifespan: 100, pollen: null };
                const newInsect2: Insect = { id: `new-insect-${i}-b`, type: 'insect', x: 4, y: 4, emoji: '🐛', lifespan: 100, pollen: null };
                const newInsect3: Insect = { id: `new-insect-${i}-c`, type: 'insect', x: 2, y: 2, emoji: '🐛', lifespan: 100, pollen: null };
                const newInsect4: Insect = { id: `new-insect-${i}-d`, type: 'insect', x: 3, y: 9, emoji: '🐛', lifespan: 100, pollen: null };
                grid[0][0].push(newInsect1);
                grid[1][4].push(newInsect2);
                grid[2][2].push(newInsect3);
                grid[3][9].push(newInsect4);
                await engine.calculateNextTick();
            }
    
            const { deltas, events } = await engine.calculateNextTick();
            const birdAddDelta = deltas.find(d => d.type === 'add' && d.actor.type === 'bird');

            expect(birdAddDelta).toBeDefined();
            expect(events.some(e => e.message === '🐦 A new bird has arrived to hunt!')).toBe(true);
            expect((engine as any).birdSpawnCooldown).toBeGreaterThan(0);
        });
    
        it('should generate an add delta for an eagle when insect population declines', async () => {
            engine.setParams({ ...DEFAULT_SIM_PARAMS, initialFlowers: 0, initialInsects: 250, initialBirds: 10 });
            await engine.initializeGrid();
    
            for (let i = 0; i < POPULATION_TREND_WINDOW; i++) {
                const { grid } = engine.getGridState();
                let removedCount = 0;
                for (const row of grid) {
                    for (const cell of row) {
                        const insectIndex = cell.findIndex(c => c.type === 'insect');
                        if (insectIndex !== -1 && removedCount < 100) {
                            cell.splice(insectIndex, 1);
                            removedCount++;
                        }
                    }
                }
                await engine.calculateNextTick();
            }
    
            const { deltas, events } = await engine.calculateNextTick();
            const eagleAddDelta = deltas.find(d => d.type === 'add' && d.actor.type === 'eagle');
    
            expect(eagleAddDelta).toBeDefined();
            expect(events.some(e => e.message === '🦅 An eagle has appeared in the skies!')).toBe(true);
            expect((engine as any).eagleSpawnCooldown).toBeGreaterThan(0);
        });
    });

    describe('Herbicide Control', () => {
        it('should generate an add delta for a herbicide plane when flower density threshold is met', async () => {
            const testParams = { 
                ...DEFAULT_SIM_PARAMS, 
                gridWidth: 10, 
                gridHeight: 10, 
                initialFlowers: 50, 
                herbicideFlowerDensityThreshold: 0.49
            };
            engine.setParams(testParams);
            await engine.initializeGrid();

            const { deltas, events } = await engine.calculateNextTick();
            
            const planeAddDelta = deltas.find(d => d.type === 'add' && d.actor.type === 'herbicidePlane');
            
            expect(planeAddDelta).toBeDefined();
            expect(events.some(e => e.message.includes('Herbicide plane deployed'))).toBe(true);
            expect((engine as any).herbicideCooldown).toBeGreaterThan(0);
        });
    });
});
