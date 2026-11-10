import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SimulationEngine } from './simulationEngine';
import { DEFAULT_SIM_PARAMS } from '../constants';
import type { FEService, Flower, AppEvent } from '../types';

const { get, put, toArray } = vi.hoisted(() => ({
    get: vi.fn(),
    put: vi.fn(),
    toArray: vi.fn(),
}));

vi.mock('../services/db', () => ({ db: { seedBank: { get, put, toArray } } }));

const service = {
    initialize: vi.fn().mockResolvedValue(undefined),
    setParams: vi.fn(),
    drawFlower: vi.fn().mockResolvedValue({ genome: 'g', image: 'img' }),
} as unknown as FEService;

const flower = (over: Partial<Flower> = {}): Flower => ({
    id: 'flower-1-1', type: 'flower', x: 1, y: 1, genome: 'g', imageData: '', health: 100, stamina: 100,
    age: 10, isMature: true, maxHealth: 100, maxStamina: 100, maturationPeriod: 5, nutrientEfficiency: 1,
    sex: 'both', minTemperature: 10, maxTemperature: 30, toxicityRate: 0, effects: { vitality: 1, agility: 1, strength: 1, intelligence: 1, luck: 1 },
    ...over,
});

/** What is stored in the bank, as the engine reads it: the three records. */
const stored = (records: Record<string, number>) =>
    get.mockImplementation(async (category: string) => (category in records ? { category, value: records[category] } : undefined));

const die = async (engine: SimulationEngine, f: Flower) => {
    const events: AppEvent[] = [];
    await (engine as any)._checkAndSaveChampion(f, events);
    return events;
};

const savedCategories = () => put.mock.calls.map(([entry]) => entry.category);

describe('SimulationEngine: the champions it compares a dying flower with', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        stored({});
        toArray.mockResolvedValue([]);
    });

    it('keeps a flower that beats the records of the seed bank', async () => {
        stored({ longestLived: 100 });
        const engine = new SimulationEngine(DEFAULT_SIM_PARAMS, service);
        await engine.reloadChampions();
        await die(engine, flower({ age: 150 }));
        expect(savedCategories()).toEqual(['longestLived']);
    });

    it('does not keep a flower that does not beat them', async () => {
        stored({ longestLived: 100, mostToxic: 0.5, mostHealing: -0.5 });
        const engine = new SimulationEngine(DEFAULT_SIM_PARAMS, service);
        await engine.reloadChampions();
        await die(engine, flower({ age: 50, toxicityRate: 0.2 }));
        expect(put).not.toHaveBeenCalled();
    });

    it('compares with an empty bank after the player cleared it', async () => {
        stored({ longestLived: 100, mostToxic: 0.5, mostHealing: -0.5 });
        const engine = new SimulationEngine(DEFAULT_SIM_PARAMS, service);
        await engine.reloadChampions();
        stored({});
        await engine.reloadChampions();
        await die(engine, flower({ age: 50, toxicityRate: 0.2 }));
        expect(savedCategories().sort()).toEqual(['longestLived', 'mostToxic']);
    });

    it('compares with an empty bank when a new game starts after the bank was cleared', async () => {
        stored({ longestLived: 100 });
        const engine = new SimulationEngine(DEFAULT_SIM_PARAMS, service);
        await engine.reloadChampions();
        stored({});
        engine.setParams(DEFAULT_SIM_PARAMS);
        await vi.waitFor(async () => {
            put.mockClear();
            await die(engine, flower({ age: 50 }));
            expect(savedCategories()).toEqual(['longestLived']);
        });
    });

    it('keeps the records it knew when the bank cannot be read', async () => {
        stored({ longestLived: 100 });
        const engine = new SimulationEngine(DEFAULT_SIM_PARAMS, service);
        await engine.reloadChampions();
        get.mockRejectedValue(new Error('IndexedDB is closed'));
        const log = vi.spyOn(console, 'error').mockImplementation(() => {});
        await engine.reloadChampions();
        await die(engine, flower({ age: 50 }));
        expect(put).not.toHaveBeenCalled();
        expect(log).toHaveBeenCalled();
        log.mockRestore();
    });
});
