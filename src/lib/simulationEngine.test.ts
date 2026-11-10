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
    id: 'flower1',
    type: 'flower',
    x: 5,
    y: 5,
    genome: 'g1',
    imageData: '',
    health: 100,
    stamina: 100,
    age: 51,
    isMature: true,
    maxHealth: 100,
    maxStamina: 100,
    maturationPeriod: 50,
    nutrientEfficiency: 1.0,
    sex: 'both',
    minTemperature: 10,
    maxTemperature: 30,
    toxicityRate: 0.1,
    effects: { vitality: 1, agility: 1, strength: 1, intelligence: 1, luck: 1 },
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
                    id: 'insect-1',
                    type: 'insect',
                    x: 0,
                    y: 0,
                    emoji: '🦋',
                    pollen: null,
                    health: baseInsectStats.maxHealth,
                    maxHealth: baseInsectStats.maxHealth,
                    stamina: baseInsectStats.maxStamina,
                    maxStamina: baseInsectStats.maxStamina,
                    genome: [],
                },
                { ...mockFlower, id: 'flower-1', x: 2, y: 3 },
            ];

            engine.initializeGridWithActors(mockActors);
            const { grid } = engine.getGridState();

            const insects = grid.flat(2).filter((c: CellContent) => c.type === 'insect');
            const flowers = grid.flat(2).filter((c: CellContent) => c.type === 'flower');

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
            const seed: FlowerSeed = {
                id: 'seed-1',
                type: 'flowerSeed',
                x: 1,
                y: 1,
                imageData: 'stem-data',
                health: SEED_HEALTH,
                maxHealth: SEED_HEALTH,
                age: 0,
            };
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
                        return [
                            {
                                ...mockFlower,
                                id: 'flower-saved-1',
                                x: 0,
                                y: 0,
                                genome: 'saved-genome',
                                imageData: '', // Image data is empty in saved state
                                health: 50,
                                stamina: 50,
                                age: 10,
                                isMature: false,
                            },
                        ];
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
            (
                engine
                    .getGridState()
                    .grid.flat(2)
                    .find(f => f.id === flower.id) as Flower
            ).stamina = 0;

            const { deltas: deltas2 } = await engine.calculateNextTick();
            const updateDelta2 = deltas2.find(d => d.type === 'update' && d.id === flower.id) as ActorUpdateDelta;
            expect(updateDelta2).toBeDefined();
            expect((updateDelta2.changes as Partial<Flower>).health).toBeLessThan(flower.health);
        });
    });

    describe('Asynchronous Flower Creation', () => {
        it('should process completed flowers from the queue and generate deltas', async () => {
            const seed: FlowerSeed = {
                id: 'seed-to-replace',
                type: 'flowerSeed',
                x: 2,
                y: 2,
                imageData: 'stem-img',
                health: SEED_HEALTH,
                maxHealth: SEED_HEALTH,
                age: 10,
            };
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

        it('gives the new flower the age of its seed and nothing else, even if another actor has the id the flower will have', async () => {
            const seed: FlowerSeed = {
                id: 'seed-2-2',
                type: 'flowerSeed',
                x: 2,
                y: 2,
                imageData: 'stem-img',
                health: SEED_HEALTH,
                maxHealth: SEED_HEALTH,
                age: 10,
            };
            // flower ids are `flower-x-y`: nothing says another actor cannot carry the one the new flower arrives with
            const same: Flower = { ...mockFlower, id: 'flower-2-2', x: 2, y: 2, age: 100, maturationPeriod: 1000 };
            engine.initializeGridWithActors([seed, same]);
            const completed: Flower = {
                ...mockFlower,
                id: 'flower-2-2',
                x: 2,
                y: 2,
                genome: 'completed-genome',
                age: 0,
                maturationPeriod: 1000,
                isMature: false,
            };
            ((engine as any).asyncFlowerFactory as any).completedFlowersQueue.push({ requestId: 'seed-2-2', flower: completed });

            await engine.calculateNextTick();

            const { grid } = engine.getGridState();
            const flower = grid[2][2].find(a => a.id === 'flower-2-2') as Flower;
            expect(flower.genome).toBe('completed-genome');
            // 10 of the seed, plus the tick it was added in: not the 100 of the other one
            expect(flower.age).toBeLessThan(20);
        });

        it.each([
            ['is mature when the seed was old enough to bring it to its maturation age exactly', 30, 30, true],
            ['is mature when the seed was older than that', 40, 30, true],
            ['is not mature when the seed was younger than that', 29, 30, false],
        ])('a flower that arrives %s', async (_name, seedAge, maturationPeriod, mature) => {
            const seed: FlowerSeed = {
                id: 'seed-6-6',
                type: 'flowerSeed',
                x: 6,
                y: 6,
                imageData: 'stem-img',
                health: SEED_HEALTH,
                maxHealth: SEED_HEALTH,
                age: seedAge - 10,
            };
            engine.initializeGridWithActors([seed]);
            const completed: Flower = { ...mockFlower, id: 'flower-6-6', x: 6, y: 6, age: 10, maturationPeriod, isMature: false };
            ((engine as any).asyncFlowerFactory as any).completedFlowersQueue.push({ requestId: 'seed-6-6', flower: completed });
            await engine.calculateNextTick();
            const flower = engine.getGridState().grid[6][6].find(a => a.id === 'flower-6-6') as Flower;
            // the tick it arrives in adds one more
            expect(flower.age).toBeGreaterThanOrEqual(seedAge);
            expect(flower.isMature).toBe(mature);
        });

        it('should correctly handle failed flower creation by removing the seed', async () => {
            const seed: FlowerSeed = {
                id: 'seed-to-remove',
                type: 'flowerSeed',
                x: 3,
                y: 3,
                imageData: 'stem-img',
                health: SEED_HEALTH,
                maxHealth: SEED_HEALTH,
                age: 5,
            };
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
                currentWeatherEvent: { type: 'none', duration: 0 },
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
            asyncFactory.requestNewFlower = vi.fn((_nextState: any, x: number, y: number, _genome?: string, _unused?: any, getNextId?: () => string) => {
                // Use engine-provided id generator if available, otherwise fallback to random
                const seedId = typeof getNextId === 'function' ? getNextId() : `seed-${Math.random().toString(36).slice(2, 8)}`;
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

describe('SimulationEngine species collection', () => {
    let engine: SimulationEngine;
    let port: { postMessage: ReturnType<typeof vi.fn>; onmessage: ((e: { data: unknown }) => void) | null };
    const classifyRequests = () => port.postMessage.mock.calls.map(c => c[0]).filter(m => m.type === 'classify-flower');

    beforeEach(() => {
        engine = new SimulationEngine(DEFAULT_SIM_PARAMS, mockFlowerService);
        port = { postMessage: vi.fn(), onmessage: null };
        engine.setFlowerWorkerPort(port as unknown as MessagePort, DEFAULT_SIM_PARAMS);
    });

    it('asks the flower worker to classify a mature flower, once', async () => {
        engine.initializeGridWithActors([{ ...mockFlower, id: 'bloom', genome: 'bloom-genome', imageData: 'bloom-image' }]);
        await engine.calculateNextTick();
        await engine.calculateNextTick();
        expect(classifyRequests()).toHaveLength(1);
        expect(classifyRequests()[0].payload).toMatchObject({ flowerId: 'bloom', genome: 'bloom-genome', image: 'bloom-image', sex: 'both', toxicity: 0.1 });
    });

    it('does not ask for a flower that is not mature yet', async () => {
        engine.initializeGridWithActors([{ ...mockFlower, id: 'bud', isMature: false, age: 0 }]);
        await engine.calculateNextTick();
        expect(classifyRequests()).toHaveLength(0);
    });

    it('reports a flower that was asked for when it dies, with its final age', async () => {
        engine.initializeGridWithActors([{ ...mockFlower, id: 'bloom', genome: 'bloom-genome', age: 80 }]);
        await engine.calculateNextTick();
        const recordsOf = () => port.postMessage.mock.calls.map(c => c[0]).filter(m => m.type === 'record-flower');
        expect(recordsOf()).toHaveLength(0);

        // out of stamina and almost out of health: it dies on the next tick
        engine.initializeGridWithActors([{ ...mockFlower, id: 'bloom', genome: 'bloom-genome', age: 90, stamina: 0, health: 0.0001 }]);
        await engine.calculateNextTick();
        expect(recordsOf()).toHaveLength(1);
        expect(recordsOf()[0].payload).toMatchObject({ flowerId: 'bloom', genome: 'bloom-genome', toxicity: 0.1 });
    });

    it('does not report a flower that dies before it matured', async () => {
        engine.initializeGridWithActors([{ ...mockFlower, id: 'bud', isMature: false, age: 0, stamina: 0, health: 0.0001 }]);
        await engine.calculateNextTick();
        expect(port.postMessage.mock.calls.map(c => c[0]).filter(m => m.type === 'record-flower')).toHaveLength(0);
    });

    it('tells the player about a discovery on the next tick', async () => {
        engine.initializeGridWithActors([{ ...mockFlower }]);
        await engine.calculateNextTick();
        port.onmessage!({
            data: { type: 'species-classified', payload: { flowerId: 'flower1', status: 'discovered', species: { x: 3, y: 5, name: 'Stout Lotus' } } },
        });

        const { events } = await engine.calculateNextTick();
        expect(events).toContainEqual({ message: '🌸 New species discovered: Stout Lotus!', type: 'success', importance: 'high' });
        expect((await engine.calculateNextTick()).events.some(e => e.message.includes('Stout Lotus'))).toBe(false);
    });

    it('says in the tick summary how many different species are alive, among the flowers that were classified', async () => {
        engine.initializeGridWithActors([{ ...mockFlower }]);
        expect((await engine.calculateNextTick()).summary.speciesAlive).toBe(0);
        const asked = classifyRequests()[0].payload;
        port.onmessage!({
            data: {
                type: 'species-classified',
                payload: { flowerId: asked.flowerId, tick: asked.tick, status: 'stored', match: { x: 3, y: 5, distance: 1 }, fp: 'fp' },
            },
        });
        expect((await engine.calculateNextTick()).summary.speciesAlive).toBe(1);
    });

    it('asks again for the flowers of a new game', async () => {
        engine.initializeGridWithActors([{ ...mockFlower }]);
        await engine.calculateNextTick();
        engine.setParams({ ...DEFAULT_SIM_PARAMS });
        engine.initializeGridWithActors([{ ...mockFlower }]);
        await engine.calculateNextTick();
        expect(classifyRequests()).toHaveLength(2);
    });
});

describe('SimulationEngine with a species worker', () => {
    it('asks the species worker, not the flower worker, to classify a mature flower', async () => {
        const engine = new SimulationEngine(DEFAULT_SIM_PARAMS, mockFlowerService);
        const flowerPort = { postMessage: vi.fn(), onmessage: null };
        const speciesPort = { postMessage: vi.fn(), onmessage: null };
        engine.setWorkerPorts(
            [
                { port: flowerPort as unknown as MessagePort, roles: ['creation'] },
                { port: speciesPort as unknown as MessagePort, roles: ['species'] },
            ],
            DEFAULT_SIM_PARAMS
        );
        engine.initializeGridWithActors([{ ...mockFlower, id: 'bloom', genome: 'bloom-genome' }]);
        await engine.calculateNextTick();
        const types = (port: { postMessage: ReturnType<typeof vi.fn> }) => port.postMessage.mock.calls.map(c => c[0].type);
        // the species worker is given what waits as a batch of jobs, the flower worker none of it
        expect(types(speciesPort)).toContain('species-batch');
        const jobs = speciesPort.postMessage.mock.calls
            .map((c: any) => c[0])
            .filter((m: any) => m.type === 'species-batch')
            .flatMap((m: any) => m.payload.jobs);
        expect(jobs.map((j: any) => j.type)).toContain('classify-flower');
        expect(types(flowerPort)).not.toContain('classify-flower');
        expect(types(flowerPort)).not.toContain('species-batch');
    });
});

describe('SimulationEngine: a species queue that is full', () => {
    it('does not wait for the classifications it let go, and counts them as dropped', async () => {
        const params = { ...DEFAULT_SIM_PARAMS, gridWidth: 20, gridHeight: 20 };
        // the flowers reproduce, and there is no worker that makes flowers here
        const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
        const engine = new SimulationEngine(params, mockFlowerService);
        const speciesPort = { postMessage: vi.fn(), onmessage: null as any };
        engine.setWorkerPorts([{ port: speciesPort as unknown as MessagePort, roles: ['species'] }], params);
        // a species worker that does not answer: 32 go to it, 200 may wait, the rest are let go
        const flowers = Array.from({ length: 240 }, (_, i) => ({ ...mockFlower, id: `bloom-${i}`, genome: `genome-${i}`, x: i % 20, y: Math.floor(i / 20) }));
        engine.initializeGridWithActors(flowers);
        await engine.calculateNextTick();
        // the queue is trimmed right after the batch goes out, so the next summary has it
        const { summary } = await engine.calculateNextTick();
        expect(summary.workers!.species).toMatchObject({ waiting: 232, dropped: 8, answered: 0 });
        quiet.mockRestore();
    });
});

describe('SimulationEngine: the workers in the tick summary', () => {
    it('tells what each worker is doing, and counts the species work asked for and answered', async () => {
        const engine = new SimulationEngine(DEFAULT_SIM_PARAMS, mockFlowerService);
        const flowerPort = { postMessage: vi.fn(), onmessage: null as any };
        const speciesPort = { postMessage: vi.fn(), onmessage: null as any };
        engine.setWorkerPorts(
            [
                { port: flowerPort as unknown as MessagePort, roles: ['creation'] },
                { port: speciesPort as unknown as MessagePort, roles: ['species'] },
            ],
            DEFAULT_SIM_PARAMS
        );
        engine.initializeGridWithActors([{ ...mockFlower, id: 'bloom', genome: 'bloom-genome' }]);

        const first = await engine.calculateNextTick();
        expect(first.summary.workers).toMatchObject({
            flowerWorkers: [{ name: 'Flower worker 1', inFlight: 0, produced: 0 }],
            speciesWorker: 'Species worker',
            species: { waiting: 1, answered: 0 },
            produced: 0,
            seedsDiscarded: 0,
            queued: 0,
        });

        speciesPort.onmessage({ data: { type: 'species-classified', payload: { flowerId: 'bloom', status: 'stored' } } });
        const second = await engine.calculateNextTick();
        expect(second.summary.workers!.species).toEqual({ waiting: 0, answered: 1, dropped: 0, byStatus: { stored: 1 }, avgMs: null });
    });

    it('starts the counts again when a new game starts', async () => {
        const engine = new SimulationEngine(DEFAULT_SIM_PARAMS, mockFlowerService);
        const speciesPort = { postMessage: vi.fn(), onmessage: null as any };
        engine.setWorkerPorts([{ port: speciesPort as unknown as MessagePort, roles: ['species'] }], DEFAULT_SIM_PARAMS);
        engine.initializeGridWithActors([{ ...mockFlower, id: 'bloom', genome: 'bloom-genome' }]);
        await engine.calculateNextTick();
        engine.setParams(DEFAULT_SIM_PARAMS, true);
        engine.initializeGridWithActors([]);
        const { summary } = await engine.calculateNextTick();
        expect(summary.workers!.species.waiting).toBe(0);
    });
});

describe('SimulationEngine: the counts of the workers and a game that is loaded', () => {
    it('start again when a game is loaded, like when one is started', async () => {
        const engine = new SimulationEngine(DEFAULT_SIM_PARAMS, mockFlowerService);
        const flowerPort = { postMessage: vi.fn(), onmessage: null as any };
        engine.setWorkerPorts([{ port: flowerPort as unknown as MessagePort, roles: ['creation', 'species'] }], DEFAULT_SIM_PARAMS);
        engine.initializeGridWithActors([{ ...mockFlower, id: 'bloom', genome: 'bloom-genome' }]);
        const before = await engine.calculateNextTick();
        expect(before.summary.workers!.species.waiting).toBe(1);
        // a flower arrives for a seed that is not there: it is thrown away and counted
        flowerPort.onmessage({
            data: { type: 'flower-created', payload: { requestId: 'seed-gone', flower: { ...mockFlower, id: 'flower-gone' }, durationMs: 12 } },
        });
        const second = await engine.calculateNextTick();
        expect(second.summary.workers).toMatchObject({ seedsDiscarded: 1, produced: 1 });

        const grid = Array.from({ length: DEFAULT_SIM_PARAMS.gridHeight }, () => Array.from({ length: DEFAULT_SIM_PARAMS.gridWidth }, () => [] as any[]));
        await engine.loadState({ params: DEFAULT_SIM_PARAMS, grid, tick: 10 });
        const after = await engine.calculateNextTick();
        expect(after.summary.workers!.species).toEqual({ waiting: 0, answered: 0, dropped: 0, byStatus: {}, avgMs: null });
        expect(after.summary.workers!.seedsDiscarded).toBe(0);
    });
});

describe('SimulationEngine: planting a champion seed', () => {
    let engine: SimulationEngine;
    let request: ReturnType<typeof vi.spyOn>;
    const seedAt = (x: number, y: number, id = `seed-${x}-${y}`): FlowerSeed => ({
        id,
        type: 'flowerSeed',
        x,
        y,
        imageData: 'stem-img',
        health: SEED_HEALTH,
        maxHealth: SEED_HEALTH,
        age: 0,
    });
    const insectAt = (x: number, y: number): CellContent => {
        const stats = INSECT_DATA.get('🦋')!;
        return {
            id: `insect-${x}-${y}`,
            type: 'insect',
            x,
            y,
            emoji: '🦋',
            pollen: null,
            health: stats.maxHealth,
            maxHealth: stats.maxHealth,
            stamina: stats.maxStamina,
            maxStamina: stats.maxStamina,
            genome: [],
        } as CellContent;
    };
    const messages = (events: { message: string }[]) => events.map(e => e.message);
    const planted = (deltas: { type: string; actor?: { id: string; type: string } }[]) =>
        deltas.filter(d => d.type === 'add' && d.actor?.type === 'flowerSeed');

    beforeEach(() => {
        engine = new SimulationEngine(DEFAULT_SIM_PARAMS, mockFlowerService);
        // the flower worker is not what is tested: a request for a flower gives a seed
        request = vi
            .spyOn((engine as any).asyncFlowerFactory, 'requestNewFlower')
            .mockImplementation(((_state: unknown, x: number, y: number) => seedAt(x, y)) as never);
    });

    it('plants in an empty cell, and tells the player once it did', async () => {
        engine.initializeGridWithActors([]);
        engine.plantChampionSeed('champion-genome', 'both', { x: 4, y: 5 });
        const { deltas, events } = await engine.calculateNextTick();
        expect(request).toHaveBeenCalledWith(expect.anything(), 4, 5, 'champion-genome', undefined, expect.any(Function));
        expect(planted(deltas)).toHaveLength(1);
        expect(messages(events)).toContain('Champion seed planted!');
    });

    it.each([
        ['a flower', (x: number, y: number) => ({ ...mockFlower, id: `flower-${x}-${y}`, x, y })],
        ['a flower seed, which a player cannot see', (x: number, y: number) => seedAt(x, y, 'seed-hidden')],
    ])('does not plant on %s, and says why instead of saying it planted', async (_name, make) => {
        engine.initializeGridWithActors([make(4, 5) as CellContent]);
        engine.plantChampionSeed('champion-genome', 'both', { x: 4, y: 5 });
        const { deltas, events } = await engine.calculateNextTick();
        expect(request).not.toHaveBeenCalled();
        expect(planted(deltas).filter(d => d.actor!.id !== 'seed-hidden')).toHaveLength(0);
        expect(messages(events)).not.toContain('Champion seed planted!');
        expect(events.find(e => /Can't plant there/.test(e.message))).toMatchObject({ type: 'error', importance: 'high' });
    });

    it('plants where an insect is: only another plant is in the way', async () => {
        engine.initializeGridWithActors([insectAt(4, 5)]);
        engine.plantChampionSeed('champion-genome', 'both', { x: 4, y: 5 });
        const { deltas, events } = await engine.calculateNextTick();
        expect(request).toHaveBeenCalledTimes(1);
        expect(planted(deltas)).toHaveLength(1);
        expect(messages(events)).toContain('Champion seed planted!');
    });

    it.each(['nutrient', 'corpse', 'slimeTrail', 'herbicideSmoke'])('plants where there is a %s', async type => {
        const other = {
            id: `${type}-1`,
            type,
            x: 4,
            y: 5,
            age: 0,
            lifespan: 100,
            duration: 100,
            value: 1,
            health: 1,
            maxHealth: 1,
            imageData: '',
            timer: 100,
            ownerId: 'x',
        } as unknown as CellContent;
        engine.initializeGridWithActors([other]);
        engine.plantChampionSeed('champion-genome', 'both', { x: 4, y: 5 });
        const { events } = await engine.calculateNextTick();
        expect(request).toHaveBeenCalledTimes(1);
        expect(messages(events)).toContain('Champion seed planted!');
    });

    it('does not plant on a plant that is only on a cell next to it', async () => {
        engine.initializeGridWithActors([{ ...mockFlower, id: 'flower-5-5', x: 5, y: 5 }]);
        engine.plantChampionSeed('champion-genome', 'both', { x: 4, y: 5 });
        await engine.calculateNextTick();
        expect(request).toHaveBeenCalledTimes(1);
    });

    it('plants once when it is asked twice for the same cell in a tick: the first seed is a plant', async () => {
        engine.initializeGridWithActors([]);
        engine.plantChampionSeed('first', 'both', { x: 4, y: 5 });
        engine.plantChampionSeed('second', 'both', { x: 4, y: 5 });
        const { events } = await engine.calculateNextTick();
        expect(request).toHaveBeenCalledTimes(1);
        expect(messages(events).filter(m => m === 'Champion seed planted!')).toHaveLength(1);
        expect(messages(events).filter(m => /Can't plant there/.test(m))).toHaveLength(1);
    });

    it('says so when the flower workers cannot make a seed yet, and not that it planted', async () => {
        request.mockImplementation((() => null) as never);
        engine.initializeGridWithActors([]);
        engine.plantChampionSeed('champion-genome', 'both', { x: 4, y: 5 });
        const { deltas, events } = await engine.calculateNextTick();
        expect(planted(deltas)).toHaveLength(0);
        expect(messages(events)).not.toContain('Champion seed planted!');
        expect(events.find(e => /not ready to grow a seed/.test(e.message))).toMatchObject({ type: 'error', importance: 'high' });
    });
});
