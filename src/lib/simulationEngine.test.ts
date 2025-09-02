import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SimulationEngine } from './simulationEngine';
import { DEFAULT_SIM_PARAMS } from '../constants';
import type { FEService, Flower, Nutrient, FlowerGenomeStats, Grid, CellContent, Insect, Bird } from '../types';

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
        it('a flower should lose stamina and then health each tick', async () => {
            engine.setParams({ ...DEFAULT_SIM_PARAMS, initialInsects: 0, initialBirds: 0, initialFlowers: 1 });
            await engine.initializeGrid();
            const initialFlower = engine.getGridState().grid.flat(2)[0] as Flower;
            const initialStamina = initialFlower.stamina;

            await engine.calculateNextTick();
            const flowerAfterTick1 = engine.getGridState().grid.flat(2)[0] as Flower;
            expect(flowerAfterTick1.stamina).toBeLessThan(initialStamina);
            expect(flowerAfterTick1.health).toBe(initialFlower.maxHealth);

            (engine as any).grid.flat(2).forEach((c: CellContent) => { if(c.type === 'flower') (c as Flower).stamina = 0 });
            const initialHealth = flowerAfterTick1.health;

            await engine.calculateNextTick();
            const flowerAfterTick2 = engine.getGridState().grid.flat(2)[0] as Flower;
            expect(flowerAfterTick2.health).toBeLessThan(initialHealth);
        });

        it('a bird should find and move towards the closest insect', async () => {
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
            
            await engine.calculateNextTick();

            const birdAfterTick = engine.getGridState().grid.flat(2).find((c: CellContent) => c.type === 'bird');
            expect(birdAfterTick?.x).toBe(6);
            expect(birdAfterTick?.y).toBe(6);
        });

        it('a bird should eat an insect and create a nutrient', async () => {
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

            await engine.calculateNextTick();
            
            const finalGrid = engine.getGridState().grid;
            const finalInsects = finalGrid.flat(2).filter(c => c.type === 'insect');
            const nutrient = finalGrid.flat(2).find(c => c.type === 'nutrient') as Nutrient | undefined;

            expect(finalInsects.length).toBe(0);
            expect(nutrient).toBeDefined();
            expect(nutrient?.x).toBe(6);
            expect(nutrient?.y).toBe(6);
        });
    });

    describe('Insect Reproduction', () => {
        it('should lay an egg when two insects of the same type are on the same cell', async () => {
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

            const { toasts } = await engine.calculateNextTick();

            const finalGrid = engine.getGridState().grid;
            const egg = finalGrid.flat(2).find(c => c.type === 'egg');
            
            expect(egg).toBeDefined();
            expect(toasts.some(t => t.message === `${insect1.emoji} laid an egg!`)).toBe(true);

            randomSpy.mockRestore();
        });
    });
});
