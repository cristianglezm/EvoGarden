import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SimulationEngine } from './simulationEngine';
import type { EnvironmentState } from '../types';
import { DEFAULT_SIM_PARAMS, INSECT_DATA, SEED_HEALTH } from '../constants';
import type { FEService, Flower, Grid, CellContent, ActorUpdateDelta, ActorAddDelta, FlowerSeed } from '../types';

vi.mock('../services/db', () => ({
  db: {
    seedBank: {
      get: vi.fn().mockResolvedValue(undefined),
      put: vi.fn().mockResolvedValue(undefined),
      toArray: vi.fn().mockResolvedValue([]),
    },
  },
}));

const mockFlowerService: FEService = {
    initialize: vi.fn().mockResolvedValue(undefined),
    setParams: vi.fn(),
    getParams: vi.fn(),
    makeFlower: vi.fn(),
    makePetals: vi.fn(),
    makePetalLayer: vi.fn(),
    makeStem: vi.fn(),
    reproduce: vi.fn(),
    mutate: vi.fn(),
    getFlowerStats: vi.fn(),
    drawFlower: vi.fn(),
    drawPetals: vi.fn(),
    drawPetalLayer: vi.fn(),
    draw3DFlower: vi.fn(),
    drawEmissive3DFlower: vi.fn(),
};

const mockFlower: Flower = {
    id: 'flower1', type: 'flower', x: 5, y: 5,
    genome: 'g1', imageData: '', health: 100, stamina: 100,
    age: 51, isMature: true, maxHealth: 100, maxStamina: 100,
    maturationPeriod: 50, nutrientEfficiency: 1.0, sex: 'both',
    minTemperature: 10, maxTemperature: 30, toxicityRate: 0.1,
    effects: { vitality: 1, agility: 1, strength: 1, intelligence: 1, luck: 1 }
};

describe('SimulationEngine', () => {
    let engine: SimulationEngine;
    let mockFlowerWorkerPort: { postMessage: ReturnType<typeof vi.fn>; onmessage: Function | null };

    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(mockFlowerService.drawFlower).mockResolvedValue({ genome: 'loaded-genome', image: 'loaded-image' });
        engine = new SimulationEngine(DEFAULT_SIM_PARAMS, mockFlowerService);
        mockFlowerWorkerPort = { postMessage: vi.fn(), onmessage: null };
        engine.setFlowerWorkerPort(mockFlowerWorkerPort as any, DEFAULT_SIM_PARAMS);
    });

    describe('Initialization and Setup', () => {
        it('initializeGridWithActors should correctly populate the grid', () => {
            const baseInsectStats = INSECT_DATA.get('🦋')!;
            const mockActors: CellContent[] = [
                {
                    id: 'insect-1', type: 'insect', x: 0, y: 0, emoji: '🦋', pollen: null,
                    health: baseInsectStats.maxHealth,
                    maxHealth: baseInsectStats.maxHealth,
                    stamina: baseInsectStats.maxStamina,
                    maxStamina: baseInsectStats.maxStamina,
                    genome: []
                },
                { ...mockFlower, id: 'flower-1', x: 2, y: 3 }
            ];
            
            engine.initializeGridWithActors(mockActors);
            const { grid } = engine.getGridState();
            
            const insects = grid.flat(2).filter((c : CellContent) => c.type === 'insect');
            const flowers = grid.flat(2).filter((c : CellContent) => c.type === 'flower');
            
            expect(insects.length).toBe(1);
            expect(flowers.length).toBe(1);
            expect(grid[0][0][0].id).toBe('insect-1');
            expect(grid[3][2][0].id).toBe('flower-1');
        });

        it('setParams should update parameters and reset tick count', async () => {
            engine.initializeGridWithActors([]);
            await engine.calculateNextTick();
            expect(engine.getGridState().tick).toBe(1);

            const newParams = { ...DEFAULT_SIM_PARAMS, gridWidth: 5 };
            engine.setParams(newParams);

            expect(engine.getGridState().tick).toBe(0);
            
            // Re-initialize to check new grid dimensions
            engine.initializeGridWithActors([]);
            expect(engine.getGridState().grid[0].length).toBe(5);
        });
    });

    describe('State Persistence', () => {
        it('getStateForSave should return state with stripped image data and seeds', async () => {
            const seed: FlowerSeed = { id: 'seed-1', type: 'flowerSeed', x: 1, y: 1, imageData: 'stem-data', health: SEED_HEALTH, maxHealth: SEED_HEALTH, age: 0 };
            const flower: Flower = { ...mockFlower, id: 'flower-save', x: 2, y: 2, imageData: 'flower-data' };
            engine.initializeGridWithActors([seed, flower]);
            
            const state = engine.getStateForSave();
            expect(state.params).toEqual(DEFAULT_SIM_PARAMS);
            expect(state.tick).toBe(0);
            
            const savedActors = state.grid.flat(2);
            const savedSeed = savedActors.find((c: CellContent) => c.type === 'flowerSeed') as FlowerSeed;
            const savedFlower = savedActors.find((c: CellContent) => c.type === 'flower') as Flower;

            expect(savedSeed).toBeDefined();
            expect(savedFlower).toBeDefined();
            expect(savedFlower.imageData).toBe(''); // Image data should be stripped
        });

        it('loadState should restore state and regenerate flower images', async () => {
            const savedGrid: Grid = Array.from({ length: DEFAULT_SIM_PARAMS.gridHeight }, (_, y) =>
                Array.from({ length: DEFAULT_SIM_PARAMS.gridWidth }, (_, x) => {
                    if (x === 0 && y === 0) {
                        return [{
                            ...mockFlower,
                            id: 'flower-saved-1', x: 0, y: 0,
                            genome: 'saved-genome', imageData: '', // Image data is empty in saved state
                            health: 50, stamina: 50, age: 10, isMature: false,
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
            const flower: Flower = { ...mockFlower, id: 'test-flower' };
            engine.initializeGridWithActors([flower]);

            const initialStamina = flower.stamina;

            const { deltas: deltas1 } = await engine.calculateNextTick();
            const updateDelta1 = deltas1.find(d => d.type === 'update' && d.id === flower.id) as ActorUpdateDelta;
            expect(updateDelta1).toBeDefined();
            expect((updateDelta1.changes as Partial<Flower>).stamina).toBeLessThan(initialStamina);
            expect((updateDelta1.changes as Partial<Flower>).health).toBeUndefined();

            // Manually set stamina to 0 to test health decrease
            (engine.getGridState().grid.flat(2).find(f => f.id === flower.id) as Flower).stamina = 0;
            
            const { deltas: deltas2 } = await engine.calculateNextTick();
            const updateDelta2 = deltas2.find(d => d.type === 'update' && d.id === flower.id) as ActorUpdateDelta;
            expect(updateDelta2).toBeDefined();
            expect((updateDelta2.changes as Partial<Flower>).health).toBeLessThan(flower.health);
        });
    });

    describe('Asynchronous Flower Creation', () => {
        it('should process completed flowers from the queue and generate deltas', async () => {
            const seed: FlowerSeed = { id: 'seed-to-replace', type: 'flowerSeed', x: 2, y: 2, imageData: 'stem-img', health: SEED_HEALTH, maxHealth: SEED_HEALTH, age: 10 };
            engine.initializeGridWithActors([seed]);

            const completedFlower: Flower = { ...mockFlower, id: 'flower-new', x: 2, y: 2, genome: 'completed-genome', age: 0 };
            ((engine as any).asyncFlowerFactory as any).completedFlowersQueue.push({ requestId: 'seed-to-replace', flower: completedFlower });

            const { deltas } = await engine.calculateNextTick();

            const removeDelta = deltas.find(d => d.type === 'remove' && d.id === 'seed-to-replace');
            expect(removeDelta).toBeDefined();

            const addDelta = deltas.find(d => d.type === 'add' && d.actor.id === 'flower-new') as ActorAddDelta | undefined;
            expect(addDelta).toBeDefined();
            expect(addDelta?.actor.type).toBe('flower');
            const addedFlower = addDelta?.actor as Flower;
            expect(addedFlower.genome).toBe('completed-genome');
            expect(addedFlower.age).toBe(10); // Check that age was transferred
            
            const { grid } = engine.getGridState();
            expect(grid[2][2].some(a => a.id === 'seed-to-replace')).toBe(false);
            const finalFlower = grid[2][2].find(a => a.id === 'flower-new') as Flower;
            expect(finalFlower).toBeDefined();
            expect(finalFlower.age).toBe(10);
        });

        it('should correctly handle failed flower creation by removing the seed', async () => {
            const seed: FlowerSeed = { id: 'seed-to-remove', type: 'flowerSeed', x: 3, y: 3, imageData: 'stem-img', health: SEED_HEALTH, maxHealth: SEED_HEALTH, age: 5 };
            engine.initializeGridWithActors([seed]);

            ((engine as any).asyncFlowerFactory as any).completedFlowersQueue.push({ requestId: 'seed-to-remove', flower: null! });

            const { deltas } = await engine.calculateNextTick();

            const removeDelta = deltas.find(d => d.type === 'remove' && d.id === 'seed-to-remove');
            expect(removeDelta).toBeDefined();
            
            const addDelta = deltas.find(d => d.type === 'add');
            expect(addDelta).toBeUndefined();

            const { grid } = engine.getGridState();
            expect(grid[3][3].length).toBe(0);
        });
    });
    describe('Seasonal Repopulation', () => {
        it('should repopulate insects and flowers when transitioning Winter → Spring (deterministic factory queue push)', async () => {
          const params = {
            ...DEFAULT_SIM_PARAMS,
            seasonLengthInTicks: 1,
            initialFlowers: 3,
            initialInsects: 3,
          };

          engine = new SimulationEngine(params, mockFlowerService);
          mockFlowerWorkerPort = {
            postMessage: vi.fn(),
            onmessage: null as any,
          };

          engine.setFlowerWorkerPort(mockFlowerWorkerPort as any, params);

          // Start in Winter so the next tick will transition to Spring
          engine.setEnvironmentState({
            season: 'Winter',
            currentHumidity: 23,
            currentTemperature: 20,
            currentWeatherEvent: { type: 'none', duration: 0 }
          } as EnvironmentState);

          // Make the AsyncFlowerFactory appear initialized and ready
          const asyncFactory = (engine as any).asyncFlowerFactory;
          asyncFactory.ready = true;

          // Helper to create a completed Flower object for a given requestId and position
          const makeCompletedFlower = (requestId: string, x: number, y: number): Flower => ({
            ...mockFlower,
            id: `flower-${requestId}`,
            x,
            y,
            genome: 'g',
            imageData: 'img',
            age: 0,
          });

          // Replace requestNewFlower so it:
          //  - returns a seed synchronously (engine expects this)
          //  - uses getNextId when provided to produce the seed id
          //  - immediately pushes a completed Flower into asyncFlowerFactory.completedFlowersQueue
          asyncFactory.requestNewFlower = vi.fn((
            _nextState: any,
            x: number,
            y: number,
            _genome?: string,
            _unused?: any,
            getNextId?: () => string
          ) => {
            // Use engine-provided id generator if available, otherwise fallback to random
            const seedId = typeof getNextId === 'function' ? getNextId() : `seed-${Math.random().toString(36).slice(2,8)}`;
            const seed: FlowerSeed = {
              id: seedId,
              type: 'flowerSeed',
              x,
              y,
              imageData: '',
              health: SEED_HEALTH,
              maxHealth: SEED_HEALTH,
              age: 0,
            };
            (asyncFactory as any).completedFlowersQueue = (asyncFactory as any).completedFlowersQueue || [];
            (asyncFactory as any).completedFlowersQueue.push({
              requestId: seedId,
              flower: makeCompletedFlower(seedId, x, y),
            });
            return seed;
          });
          engine.initializeGridWithActors([]);

          // Run multiple ticks to allow:
          //  - season transition (tick 1)
          //  - repopulation inserting seeds and pushing completed flowers into the queue
          //  - engine processing completedFlowersQueue and emitting add deltas for real flowers
          const collectedDeltas: any[] = [];
          const maxTicks = 8;
          for (let t = 0; t < maxTicks; t++) {
            // Explicitly type result as any to avoid 'never' inference
            const result: any = await engine.calculateNextTick();
            // Normalize possible shapes: either an array of deltas or { deltas: [...] }
            let deltas: any[] = [];
            if (Array.isArray(result)) {
              deltas = result;
            } else if (result && Array.isArray(result.deltas)) {
              deltas = result.deltas;
            }
            collectedDeltas.push(...deltas);

            // Early exit if we've observed at least one insect and one real flower added
            const added = collectedDeltas.filter(d => d.type === 'add') as ActorAddDelta[];
            const addedInsects = added.filter(a => a.actor.type === 'insect');
            const addedFlowers = added.filter(a => a.actor.type === 'flower');
            if (addedInsects.length > 0 && addedFlowers.length > 0) break;
          }

          const allAdded = collectedDeltas.filter(d => d.type === 'add') as ActorAddDelta[];

          const addedInsects = allAdded.filter(a => a.actor.type === 'insect');
          const addedFlowers = allAdded.filter(a => a.actor.type === 'flower');

          // Expect at least one insect and one flower to have been added during the Spring repopulation
          expect(addedInsects.length).toBeGreaterThan(0);
          expect(addedFlowers.length).toBeGreaterThan(0);

          const { grid } = engine.getGridState();
          const flat = grid.flat(2);

          const gridFlowers = flat.filter(a => a.type === 'flower');
          const gridInsects = flat.filter(a => a.type === 'insect');

          expect(gridFlowers.length).toBeGreaterThan(0);
          expect(gridInsects.length).toBeGreaterThan(0);
        });
    });
});
