// @vitest-environment node
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { FEService } from '@cristianglezm/flower-evolver-wasm';
import { createSpeciesClassifier } from '../services/speciesClassifier';
import { createMemorySpeciesStore } from '../test/speciesStores';
import { SpeciesJobs, championRequest, MIGRATION_CHUNK } from './speciesJobs';
import { SpeciesRepository, type SpeciesLimits } from './speciesRepository';
import { speciesName } from './species';
import type { SeedBankEntry, SpeciesClassifier, SpeciesMatch, SpeciesRecordRequest, SpeciesRequest, SpeciesStore } from '../types';

// The real classifier on real flowers. Where a test needs a cell it can choose, only the answer
// of `classify` is replaced.
const service = new FEService();
const real = createSpeciesClassifier(service);
let genomes: string[] = [];

beforeAll(async () => {
    await service.init();
    for (let i = 0; i < 3; i++) genomes.push((await service.makeFlower()).genome);
}, 60_000);

afterEach(() => {
    vi.restoreAllMocks();
});

const request = (flowerId: string, genome: string, extra: Partial<SpeciesRequest> = {}): SpeciesRequest =>
    ({ flowerId, genome, image: 'png', sex: 'female', age: 70, toxicity: 0.3, tick: 120, ...extra });

const answering = (match: SpeciesMatch | null): SpeciesClassifier => ({
    get fingerprint() { return real.fingerprint; },
    classifierJson: real.classifierJson,
    version: real.version,
    classify: async () => match,
    classifyBatch: async genomes => genomes.map(() => match),
});

function setup(classifier: SpeciesClassifier = real, limits: Partial<SpeciesLimits> = {}, store: SpeciesStore = createMemorySpeciesStore()) {
    const repository = new SpeciesRepository(store, limits);
    return { jobs: new SpeciesJobs(classifier, repository), repository, store };
}

describe('the queue', () => {
    it('has no work until a flower is queued, and nothing to run', async () => {
        const { jobs } = setup();
        expect(jobs.hasWork()).toBe(false);
        await expect(jobs.runNext()).resolves.toBeNull();
        jobs.enqueue(request('a', genomes[0]));
        expect(jobs.hasWork()).toBe(true);
    });

    it('runs the flowers in the order they came', async () => {
        const { jobs } = setup(answering({ x: 1, y: 1, distance: 1 }));
        jobs.enqueue(request('a', genomes[0]));
        jobs.enqueue(request('b', genomes[1]));
        expect((await jobs.runNext())!.flowerId).toBe('a');
        expect((await jobs.runNext())!.flowerId).toBe('b');
        expect(jobs.hasWork()).toBe(false);
    });

    it('keeps a flower once while it waits', async () => {
        const { jobs } = setup(answering({ x: 1, y: 1, distance: 1 }));
        jobs.enqueue(request('a', genomes[0]));
        jobs.enqueue(request('a', genomes[0]));
        expect((await jobs.runNext())!.flowerId).toBe('a');
        await expect(jobs.runNext()).resolves.toBeNull();
    });

    it('keeps two flowers that have the same id, flower ids being "flower-x-y" and a cell used again', async () => {
        const { jobs } = setup(answering({ x: 1, y: 1, distance: 1 }));
        jobs.enqueue(request('flower-3-4', genomes[0]));
        jobs.enqueue(request('flower-3-4', genomes[1]));
        expect((await jobs.runNext())!.flowerId).toBe('flower-3-4');
        expect((await jobs.runNext())!.flowerId).toBe('flower-3-4');
        await expect(jobs.runNext()).resolves.toBeNull();
    });

    it('forgets everything that waits when cancelled, and can queue the same flower again', async () => {
        const { jobs } = setup(answering({ x: 1, y: 1, distance: 1 }));
        jobs.enqueue(request('a', genomes[0]));
        jobs.enqueue(request('b', genomes[1]));
        jobs.cancelAll();
        expect(jobs.hasWork()).toBe(false);
        jobs.enqueue(request('a', genomes[0]));
        expect((await jobs.runNext())!.flowerId).toBe('a');
    });
});

describe('a flower that is run', () => {
    it('discovers its species, named for its cell, and is kept with what is known of it', async () => {
        const { jobs, store } = setup();
        jobs.enqueue(request('a', genomes[0]));
        const result = (await jobs.runNext())!;

        expect(result).toMatchObject({ flowerId: 'a', status: 'discovered' });
        const { x, y } = result.species!;
        expect(result.species!.name).toBe(speciesName(x, y, 12));

        const [row] = await store.transaction(tx => tx.inCell(`${x},${y}`));
        expect(row).toMatchObject({ founder: true, fp: real.fingerprint, sex: 'female', age: 70, toxicity: 0.3, tick: 120 });
        expect(await store.transaction(tx => tx.genome(row.id))).toEqual({ id: row.id, genome: genomes[0], image: 'png' });
    });

    it('is "stored" when its species is known, and keeps no image', async () => {
        const { jobs, store } = setup(answering({ x: 4, y: 2, distance: 1 }));
        jobs.enqueue(request('a', genomes[0]));
        jobs.enqueue(request('b', genomes[1]));
        await jobs.runNext();
        const second = (await jobs.runNext())!;

        expect(second).toMatchObject({ flowerId: 'b', status: 'stored', species: { x: 4, y: 2 } });
        const rows = await store.transaction(tx => tx.inCell('4,2'));
        const added = rows.find(r => !r.founder)!;
        expect(await store.transaction(tx => tx.genome(added.id))).toEqual({ id: added.id, genome: genomes[1] });
    });

    it('is "skipped", and not classified, when its genome is already in the collection', async () => {
        const { jobs } = setup();
        jobs.enqueue(request('a', genomes[0]));
        await jobs.runNext();

        const classify = vi.spyOn(real, 'classify');
        jobs.enqueue(request('b', genomes[0]));
        expect(await jobs.runNext()).toEqual({ flowerId: 'b', status: 'skipped' });
        expect(classify).not.toHaveBeenCalled();
    });

    it('is "dropped" when the collection has no room for it', async () => {
        const { jobs } = setup(answering({ x: 0, y: 0, distance: 1 }), { cap: 1 });
        jobs.enqueue(request('a', genomes[0]));
        jobs.enqueue(request('b', genomes[1]));
        await jobs.runNext();
        expect(await jobs.runNext()).toMatchObject({ flowerId: 'b', status: 'dropped', species: { x: 0, y: 0 } });
    });

    it('is "unclassified" when it has no species, and the answer has none', async () => {
        const { jobs } = setup();
        jobs.enqueue(request('a', '{"Flower":{}}'));
        const { durationMs, tick: _tick, ...answer } = (await jobs.runNext())!;
        expect(answer).toEqual({ flowerId: 'a', status: 'unclassified' });
        expect(durationMs).toBeGreaterThanOrEqual(0);
    });
});

describe('a flower that fails', () => {
    it('is "failed" when the classifier throws, and the next one is run', async () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        vi.spyOn(real, 'classify').mockRejectedValueOnce(new Error('wasm trap'));
        const { jobs } = setup();
        jobs.enqueue(request('a', genomes[0]));
        jobs.enqueue(request('b', genomes[1]));

        expect(await jobs.runNext()).toEqual({ flowerId: 'a', status: 'failed' });
        expect(error).toHaveBeenCalled();
        expect((await jobs.runNext())!.status).toBe('discovered');
    });

    it('is "failed" when the storage throws', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const broken: SpeciesStore = { transaction: () => Promise.reject(new Error('quota exceeded')) };
        const { jobs } = setup(real, {}, broken);
        jobs.enqueue(request('a', genomes[0]));
        expect(await jobs.runNext()).toEqual({ flowerId: 'a', status: 'failed' });
    });
});

const death = (flowerId: string, genome: string, extra: Partial<SpeciesRecordRequest> = {}): SpeciesRecordRequest =>
    ({ flowerId, genome, image: 'png', sex: 'female', tick: 900, age: 120, toxicity: 0.5, ...extra });

describe('a flower that died', () => {
    it('takes the records of its species, and is "recorded"', async () => {
        const { jobs, store } = setup();
        jobs.enqueue(request('a', genomes[0]));
        const { species } = (await jobs.runNext())!;

        jobs.enqueueRecord(death('a', genomes[0]));
        expect(await jobs.runNext()).toMatchObject({ flowerId: 'a', status: 'recorded' });
        const [row] = await store.transaction(tx => tx.inCell(`${species!.x},${species!.y}`));
        expect(row).toMatchObject({ records: ['longestLived', 'mostToxic'], age: 120, toxicity: 0.5, tick: 900 });
    });

    it('is a discovery if its species had no flower yet, and is classified for that', async () => {
        const { jobs } = setup();
        jobs.enqueueRecord(death('a', genomes[0]));
        const result = (await jobs.runNext())!;
        expect(result.status).toBe('discovered');
        expect(result.species!.name).toBe(speciesName(result.species!.x, result.species!.y, 12));
    });

    it('is "unchanged" when it beats nobody', async () => {
        const { jobs } = setup(answering({ x: 1, y: 1, distance: 1 }));
        jobs.enqueueRecord(death('a', genomes[0], { age: 200 }));
        jobs.enqueueRecord(death('b', genomes[1], { age: 10, toxicity: 0.1 }));
        await jobs.runNext();
        expect(await jobs.runNext()).toMatchObject({ flowerId: 'b', status: 'unchanged' });
    });

    it('is "unchanged" when it has no species, and the answer has none', async () => {
        const { jobs } = setup();
        jobs.enqueueRecord(death('a', '{"Flower":{}}'));
        const { durationMs, ...answer } = (await jobs.runNext())!;
        expect(answer).toEqual({ flowerId: 'a', status: 'unchanged' });
        expect(durationMs).toBeGreaterThanOrEqual(0);
    });

    it('is not classified again when it was just classified, even if it was not kept', async () => {
        const classify = vi.fn(async () => ({ x: 0, y: 0, distance: 1 }));
        const { jobs } = setup({ ...answering(null), classify }, { cap: 1 });
        jobs.enqueue(request('founder', genomes[0]));
        jobs.enqueue(request('a', genomes[1]));
        jobs.enqueueRecord(death('a', genomes[1]));
        await jobs.runNext();
        expect(await jobs.runNext()).toMatchObject({ flowerId: 'a', status: 'dropped' });
        expect(classify).toHaveBeenCalledTimes(2);

        expect(await jobs.runNext()).toMatchObject({ flowerId: 'a', status: 'recorded' });
        expect(classify).toHaveBeenCalledTimes(2);
    });

    it('is not classified at all when its genome is in the collection', async () => {
        const { jobs } = setup();
        jobs.enqueue(request('a', genomes[0]));
        await jobs.runNext();
        const classify = vi.spyOn(real, 'classify');
        jobs.enqueueRecord(death('a', genomes[0]));
        await jobs.runNext();
        expect(classify).not.toHaveBeenCalled();
    });

    it('is queued once, and two flowers with the same id are both queued', async () => {
        const { jobs } = setup(answering({ x: 1, y: 1, distance: 1 }));
        jobs.enqueueRecord(death('flower-3-4', genomes[0]));
        jobs.enqueueRecord(death('flower-3-4', genomes[0]));
        jobs.enqueueRecord(death('flower-3-4', genomes[1]));
        expect((await jobs.runNext())!.flowerId).toBe('flower-3-4');
        expect((await jobs.runNext())!.flowerId).toBe('flower-3-4');
        await expect(jobs.runNext()).resolves.toBeNull();
    });

    it('is a different job from the classification of the same flower', async () => {
        const { jobs } = setup(answering({ x: 1, y: 1, distance: 1 }));
        jobs.enqueue(request('a', genomes[0]));
        jobs.enqueueRecord(death('a', genomes[0]));
        await jobs.runNext();
        expect(jobs.hasWork()).toBe(true);
    });

    it('is "failed" when the storage throws, and the queue goes on', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const broken: SpeciesStore = { transaction: () => Promise.reject(new Error('quota exceeded')) };
        const { jobs } = setup(real, {}, broken);
        jobs.enqueueRecord(death('a', genomes[0]));
        jobs.enqueueRecord(death('b', genomes[1]));
        expect(await jobs.runNext()).toEqual({ flowerId: 'a', status: 'failed' });
        expect((await jobs.runNext())!.flowerId).toBe('b');
    });

    it('is dropped from the queue with everything else when cancelled', async () => {
        const { jobs } = setup();
        jobs.enqueue(request('a', genomes[0]));
        jobs.enqueueRecord(death('a', genomes[0]));
        jobs.cancelAll();
        expect(jobs.hasWork()).toBe(false);
    });
});

describe('the champions of the seed bank', () => {
    const entry = (category: SeedBankEntry['category'], value: number, genome = genomes[0]): SeedBankEntry =>
        ({ category, genome, value, imageData: 'champion-png', sex: 'male' });

    it('are asked for as flowers that know one value and may take one record', () => {
        expect(championRequest(entry('longestLived', 321))).toEqual({
            flowerId: 'champion-longestLived', genome: genomes[0], image: 'champion-png', sex: 'male', tick: 0, only: ['longestLived'], age: 321,
        });
        expect(championRequest(entry('mostToxic', 0.9))).toMatchObject({ toxicity: 0.9, only: ['mostToxic'] });
        expect(championRequest(entry('mostHealing', -0.4))).toMatchObject({ toxicity: -0.4, only: ['mostHealing'] });
        expect(championRequest(entry('mostToxic', 0.9))).not.toHaveProperty('age');
    });

    it('end up in the collection, holding the record of their species they won with and no other', async () => {
        const { jobs, store } = setup();
        jobs.enqueueRecord(championRequest(entry('longestLived', 321)));
        const result = (await jobs.runNext())!;
        expect(result.status).toBe('discovered');

        const [row] = await store.transaction(tx => tx.inCell(`${result.species!.x},${result.species!.y}`));
        expect(row).toMatchObject({ records: ['longestLived'], age: 321, sex: 'male' });
        expect(row.toxicity).toBeUndefined();
        expect(await store.transaction(tx => tx.genome(row.id))).toMatchObject({ genome: genomes[0], image: 'champion-png' });
    });

    it('are found by their genome once they are there', async () => {
        const { jobs, repository } = setup();
        jobs.enqueueRecord(championRequest(entry('mostToxic', 0.9, genomes[1])));
        await jobs.runNext();
        expect(await repository.isStored(genomes[1])).toBe(true);
    });
});

describe('classifying the collection again', () => {
    // A collection made by another classifier: every flower in one species, under another fingerprint.
    const older = (): SpeciesClassifier => ({ ...answering({ x: 0, y: 0, distance: 1 }), fingerprint: 'old-classifier' });
    const rows = (store: SpeciesStore) => store.transaction(tx => tx.all());

    async function oldCollection(count: number) {
        const flowers = [...genomes];
        while (flowers.length < count) flowers.push((await service.makeFlower()).genome);
        const { jobs: oldJobs, store, repository } = setup(older());
        for (const [i, genome] of flowers.slice(0, count).entries()) {
            oldJobs.enqueue(request(`f${i}`, genome));
            await oldJobs.runNext();
        }
        return { store, repository, genomes: flowers.slice(0, count), jobs: new SpeciesJobs(real, repository) };
    }

    it('puts every sample where the classifier in use says, a few at a time', async () => {
        const { jobs, store, genomes: flowers } = await oldCollection(12);
        const classifyBatch = vi.spyOn(real, 'classifyBatch');
        expect((await rows(store)).every(r => r.fp === 'old-classifier')).toBe(true);

        jobs.startMigration();
        expect(jobs.hasWork()).toBe(true);
        let runs = 0;
        while (jobs.hasWork()) {
            expect(await jobs.runNext()).toBeNull();
            runs++;
        }

        // a few samples at a time, the ones that are left in the last chunk, which ends it
        const chunks = Array.from({ length: Math.ceil(12 / MIGRATION_CHUNK) }, (_, i) => Math.min(MIGRATION_CHUNK, 12 - i * MIGRATION_CHUNK));
        expect(classifyBatch.mock.calls.map(call => call[0].length)).toEqual(chunks);
        expect(runs).toBe(chunks.length);
        expect(MIGRATION_CHUNK).toBeLessThanOrEqual(5);

        const now = await real.classifyBatch(flowers);
        const stored = await rows(store);
        expect(stored).toHaveLength(12);
        expect(stored.every(r => r.fp === real.fingerprint)).toBe(true);
        for (const match of now) {
            expect(stored.some(r => r.cell === `${match!.x},${match!.y}`)).toBe(true);
        }
        // each species has one founder, whatever the old classifier thought
        const cells = new Set(stored.map(r => r.cell));
        expect(stored.filter(r => r.founder)).toHaveLength(cells.size);
    }, 60_000);

    it('goes before the other jobs, which wait for it', async () => {
        const { jobs } = await oldCollection(2);
        jobs.enqueue(request('new-flower', genomes[2]));
        jobs.startMigration();

        expect(await jobs.runNext()).toBeNull();
        expect(jobs.hasWork()).toBe(true);
        expect(await jobs.runNext()).toMatchObject({ flowerId: 'new-flower' });
    }, 60_000);

    it('is not stopped by cancelling the flowers that wait', async () => {
        const { jobs } = await oldCollection(2);
        jobs.startMigration();
        jobs.cancelAll();
        expect(jobs.hasWork()).toBe(true);
    }, 60_000);

    it('has nothing to do, and classifies nothing, when no sample is from another classifier', async () => {
        const { jobs, repository } = setup();
        jobs.enqueue(request('a', genomes[0]));
        await jobs.runNext();
        const classifyBatch = vi.spyOn(real, 'classifyBatch');
        const before = await rows(repository['store']);

        jobs.startMigration();
        expect(await jobs.runNext()).toBeNull();
        expect(jobs.hasWork()).toBe(false);
        expect(classifyBatch).not.toHaveBeenCalled();
        expect(await rows(repository['store'])).toEqual(before);
    }, 60_000);

    it('gives up for this run when the classifier fails, and leaves the samples as they were', async () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const { jobs, store } = await oldCollection(3);
        vi.spyOn(real, 'classifyBatch').mockRejectedValueOnce(new Error('wasm trap'));

        jobs.startMigration();
        await jobs.runNext();
        expect(error).toHaveBeenCalled();
        expect(jobs.hasWork()).toBe(false);
        expect((await rows(store)).every(r => r.fp === 'old-classifier')).toBe(true);
    }, 60_000);
});

describe('the limits the player chose', () => {
    // built in each test: it reads the classifier, which exists once the wasm is initialised
    const match = () => answering({ x: 1, y: 1, distance: 1 });

    it('are read before each job, and applied to it', async () => {
        const readLimits = vi.fn().mockResolvedValueOnce({ cap: 1 }).mockResolvedValue({ cap: 1 });
        const repository = new SpeciesRepository(createMemorySpeciesStore());
        const jobs = new SpeciesJobs(match(), repository, readLimits);
        jobs.enqueue(request('a', genomes[0]));
        jobs.enqueue(request('b', genomes[1]));

        expect(repository.limits.cap).toBe(50);
        await jobs.runNext();
        expect(repository.limits.cap).toBe(1);
        expect((await jobs.runNext())!.status).toBe('dropped');
        expect(readLimits).toHaveBeenCalledTimes(2);
    });

    it('let go the samples over a cap that was lowered, and not for one that was raised', async () => {
        const store = createMemorySpeciesStore();
        const repository = new SpeciesRepository(store, { cap: 5 });
        for (const [i, genome] of [...genomes, 'x1', 'x2'].entries()) await repository.offer({ genome, match: { x: 1, y: 1, distance: i + 1 }, fp: real.fingerprint, sex: 'both' });
        let chosen = { cap: 3 };
        const trim = vi.spyOn(repository, 'trim');
        const jobs = new SpeciesJobs(match(), repository, async () => chosen);
        jobs.enqueue(request('z', genomes[0]));
        await jobs.runNext();
        expect((await store.transaction(tx => tx.inCell('1,1'))).length).toBe(3);
        expect(trim).toHaveBeenCalledTimes(1);

        chosen = { cap: 10 };
        jobs.enqueue(request('z2', genomes[0])); // the founder: still stored, so it adds nothing
        await jobs.runNext();
        expect((await store.transaction(tx => tx.inCell('1,1'))).length).toBe(3);
        expect(trim).toHaveBeenCalledTimes(1);
    });

    it('are ignored while nothing is chosen, and without a way to read them', async () => {
        const repository = new SpeciesRepository(createMemorySpeciesStore());
        const unchosen = new SpeciesJobs(match(), repository, async () => undefined);
        unchosen.enqueue(request('a', genomes[0]));
        await unchosen.runNext();
        const without = new SpeciesJobs(match(), repository);
        without.enqueue(request('b', genomes[1]));
        await without.runNext();
        expect(repository.limits).toEqual({ cap: 50, atypicalCap: 500, unclassifiedCap: 200 });
    });

    it('are kept as they were when what was chosen is not valid, which is said once for each choice', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const repository = new SpeciesRepository(createMemorySpeciesStore(), { cap: 7 });
        let chosen: { cap: number } = { cap: 0 };
        const jobs = new SpeciesJobs(match(), repository, async () => chosen);
        for (const id of ['a', 'b', 'c']) jobs.enqueue(request(id, genomes[id.charCodeAt(0) - 97]));

        await jobs.runNext();
        await jobs.runNext();
        expect(repository.limits.cap).toBe(7);
        expect(warn).toHaveBeenCalledTimes(1);

        chosen = { cap: 500 };
        expect((await jobs.runNext())!.flowerId).toBe('c');
        expect(warn).toHaveBeenCalledTimes(2);
        expect(repository.limits.cap).toBe(7);
    });

    it('do not stop the work when they cannot be read', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const jobs = new SpeciesJobs(match(), new SpeciesRepository(createMemorySpeciesStore()), async () => { throw new Error('disk'); });
        jobs.enqueue(request('a', genomes[0]));
        expect((await jobs.runNext())!.status).toBe('discovered');
    });
});

describe('classifying the waiting flowers in batches', () => {
    const many: string[] = [];
    beforeAll(async () => {
        for (let i = 0; i < 8; i++) many.push((await service.makeFlower()).genome);
    }, 60_000);

    // The answer depends on the genome, so batch and single give the same ones and a test can tell them apart.
    const cellOf = (genome: string): SpeciesMatch => {
        const n = many.indexOf(genome) + genomes.indexOf(genome) + 1;
        return { x: n % 12, y: n % 8, distance: n / 10 };
    };
    const byGenome = (calls: { single: string[]; batch: string[][] }): SpeciesClassifier => ({
        get fingerprint() { return real.fingerprint; },
        classifierJson: real.classifierJson,
        version: real.version,
        classify: async genome => { calls.single.push(genome); return cellOf(genome); },
        classifyBatch: async list => { calls.batch.push(list); return list.map(cellOf); },
    });
    const batched = (classifier: SpeciesClassifier, batchSize: number, now?: () => number) => {
        const repository = new SpeciesRepository(createMemorySpeciesStore());
        return { jobs: new SpeciesJobs(classifier, repository, undefined, { batchSize, now }), repository };
    };
    const runAll = async (jobs: SpeciesJobs) => {
        const results = [];
        while (jobs.hasWork()) results.push(await jobs.runNext());
        return results;
    };

    it('does not use a batch by default, so the flower worker, which makes flowers between two jobs, is as it was', async () => {
        const calls = { single: [] as string[], batch: [] as string[][] };
        const { jobs } = setup(byGenome(calls));
        many.slice(0, 3).forEach((g, i) => jobs.enqueue(request(`f${i}`, g)));
        await runAll(jobs);
        expect(calls.batch).toEqual([]);
        expect(calls.single).toHaveLength(3);
    });

    it('classifies the flowers that wait in one call, as many as it was told at a time, and never one by one', async () => {
        const calls = { single: [] as string[], batch: [] as string[][] };
        const { jobs } = batched(byGenome(calls), 4);
        many.slice(0, 6).forEach((g, i) => jobs.enqueue(request(`f${i}`, g)));
        await runAll(jobs);
        expect(calls.batch.map(b => b.length)).toEqual([4, 2]);
        expect(calls.single).toEqual([]);
    });

    it('gives the same answers, in the same order, as one by one', async () => {
        const singleCalls = { single: [] as string[], batch: [] as string[][] };
        const batchCalls = { single: [] as string[], batch: [] as string[][] };
        const one = setup(byGenome(singleCalls));
        const many4 = batched(byGenome(batchCalls), 4);
        for (const { jobs } of [one, many4]) {
            many.slice(0, 6).forEach((g, i) => jobs.enqueue(request(`f${i}`, g)));
            jobs.enqueueRecord({ flowerId: 'd', genome: many[6], image: 'png', sex: 'female', age: 900, toxicity: 0.1, tick: 5 });
        }
        const strip = (results: any[]) => results.map(r => ({ ...r, durationMs: undefined }));
        expect(strip(await runAll(many4.jobs))).toEqual(strip(await runAll(one.jobs)));
        // and kept the same flowers: every genome is stored, or is not, in both
        for (const genome of many.slice(0, 7)) {
            expect(await many4.repository.isStored(genome)).toBe(await one.repository.isStored(genome));
        }
    });

    it('leaves out of the batch what needs no classifying: a genome that is stored, one just classified, and a repeat', async () => {
        const calls = { single: [] as string[], batch: [] as string[][] };
        const { jobs, repository } = batched(byGenome(calls), 8);
        await repository.offer({ genome: many[0], match: cellOf(many[0]), fp: real.fingerprint, sex: 'both', tick: 1 });
        // classified a moment ago, by a batch of its own
        jobs.enqueue(request('seen', many[2]));
        await jobs.runNext();
        calls.batch.length = 0;

        jobs.enqueue(request('stored', many[0]));
        jobs.enqueue(request('a', many[1]));
        jobs.enqueue(request('a-again', many[1], { tick: 121 }));
        jobs.enqueue(request('seen-again', many[2], { tick: 121 }));
        jobs.enqueue(request('b', many[3]));
        await runAll(jobs);
        expect(calls.batch).toEqual([[many[1], many[3]]]);
    });

    it('classifies the flowers that died together with the flowers that matured', async () => {
        const calls = { single: [] as string[], batch: [] as string[][] };
        const { jobs } = batched(byGenome(calls), 8);
        jobs.enqueue(request('a', many[0]));
        jobs.enqueueRecord({ flowerId: 'd', genome: many[1], image: 'png', sex: 'male', age: 300, toxicity: 0.2, tick: 9 });
        await runAll(jobs);
        expect(calls.batch).toEqual([[many[0], many[1]]]);
    });

    it('finishes the job in hand when everything is cancelled while the batch is classified, and drops the rest', async () => {
        let open!: () => void;
        const gate = new Promise<void>(resolve => { open = resolve; });
        const calls = { single: [] as string[], batch: [] as string[][] };
        const classifier = byGenome(calls);
        const classifyBatch = classifier.classifyBatch.bind(classifier);
        classifier.classifyBatch = async list => { await gate; return classifyBatch(list); };
        const { jobs } = batched(classifier, 8);
        many.slice(0, 3).forEach((g, i) => jobs.enqueue(request(`f${i}`, g)));

        const first = jobs.runNext();
        await new Promise(resolve => setTimeout(resolve, 20));
        jobs.cancelAll();
        open();
        expect((await first)!.flowerId).toBe('f0');
        expect(jobs.hasWork()).toBe(false);
    });

    it('goes on one by one when the batch fails, and says so', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const calls = { single: [] as string[], batch: [] as string[][] };
        const classifier = byGenome(calls);
        classifier.classifyBatch = async () => { throw new Error('wasm trap'); };
        const { jobs } = batched(classifier, 4);
        many.slice(0, 3).forEach((g, i) => jobs.enqueue(request(`f${i}`, g)));
        const results = await runAll(jobs);
        expect(results.map(r => r!.status)).toEqual(['discovered', 'discovered', 'discovered']);
        expect(calls.single).toHaveLength(3);
        expect(warn).toHaveBeenCalled();
    });

    it('goes on one by one when the batch answers for a different number of flowers than it was asked', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const calls = { single: [] as string[], batch: [] as string[][] };
        const classifier = byGenome(calls);
        classifier.classifyBatch = async list => list.slice(1).map(cellOf);
        const { jobs } = batched(classifier, 4);
        many.slice(0, 3).forEach((g, i) => jobs.enqueue(request(`f${i}`, g)));
        const results = await runAll(jobs);
        expect(results.map(r => r!.status)).toEqual(['discovered', 'discovered', 'discovered']);
        expect(calls.single).toHaveLength(3);
    });

    describe('the time it takes, per flower that was classified', () => {
        let clock = 0;
        const timed = (calls: { single: string[]; batch: string[][] }, batchMs: number, singleMs: number) => {
            const classifier = byGenome(calls);
            const classify = classifier.classify.bind(classifier);
            const classifyBatch = classifier.classifyBatch.bind(classifier);
            classifier.classify = async g => { clock += singleMs; return classify(g); };
            classifier.classifyBatch = async l => { clock += batchMs; return classifyBatch(l); };
            return classifier;
        };

        it('is the time of the batch divided by the flowers in it', async () => {
            clock = 0;
            const calls = { single: [] as string[], batch: [] as string[][] };
            const { jobs } = batched(timed(calls, 300, 0), 3, () => clock);
            many.slice(0, 3).forEach((g, i) => jobs.enqueue(request(`f${i}`, g)));
            const results = await runAll(jobs);
            expect(results.map(r => r!.durationMs)).toEqual([100, 100, 100]);
        });

        it('is the time of the call when it is not in a batch', async () => {
            clock = 0;
            const calls = { single: [] as string[], batch: [] as string[][] };
            const jobs = new SpeciesJobs(timed(calls, 0, 40), new SpeciesRepository(createMemorySpeciesStore()), undefined, { now: () => clock });
            jobs.enqueue(request('a', many[0]));
            expect((await jobs.runNext())!.durationMs).toBe(40);
        });

        it('is not given for a flower that needed no classifying', async () => {
            clock = 0;
            const calls = { single: [] as string[], batch: [] as string[][] };
            const { jobs, repository } = batched(timed(calls, 300, 0), 3, () => clock);
            await repository.offer({ genome: many[0], match: cellOf(many[0]), fp: real.fingerprint, sex: 'both', tick: 1 });
            jobs.enqueue(request('stored', many[0]));
            const [skipped] = await runAll(jobs);
            expect(skipped!.status).toBe('skipped');
            expect(skipped!.durationMs).toBeUndefined();
        });

        it('is not given for a flower that failed', async () => {
            vi.spyOn(console, 'error').mockImplementation(() => undefined);
            const calls = { single: [] as string[], batch: [] as string[][] };
            const classifier = byGenome(calls);
            classifier.classify = async () => { throw new Error('boom'); };
            const { jobs } = setup(classifier);
            jobs.enqueue(request('a', many[0]));
            const result = (await jobs.runNext())!;
            expect(result.status).toBe('failed');
            expect(result.durationMs).toBeUndefined();
        });
    });

    it('takes the migration in the chunks it was told', async () => {
        const calls = { single: [] as string[], batch: [] as string[][] };
        const repository = new SpeciesRepository(createMemorySpeciesStore());
        const staleChunk = vi.spyOn(repository, 'staleChunk').mockResolvedValue([]);
        const jobs = new SpeciesJobs(byGenome(calls), repository, undefined, { migrationChunk: 17 });
        jobs.startMigration();
        await jobs.runNext();
        expect(staleChunk).toHaveBeenCalledWith(real.fingerprint, 17);
    });
});

describe('record jobs that carry the match of their flower', () => {
    const flowers: string[] = [];
    beforeAll(async () => {
        for (let i = 0; i < 4; i++) flowers.push((await service.makeFlower()).genome);
    }, 60_000);

    const cell = (n: number): SpeciesMatch => ({ x: 3 + n, y: 2, distance: 0.4 });
    const counting = () => {
        const calls = { single: [] as string[], batch: [] as string[][] };
        const classifier: SpeciesClassifier = {
            get fingerprint() { return real.fingerprint; },
            classifierJson: real.classifierJson,
            version: real.version,
            classify: async genome => { calls.single.push(genome); return cell(9); },
            classifyBatch: async list => { calls.batch.push(list); return list.map(() => cell(9)); },
        };
        return { calls, classifier };
    };
    const death = (flowerId: string, genome: string, extra: Partial<SpeciesRecordRequest> = {}): SpeciesRecordRequest =>
        ({ flowerId, genome, image: 'png', sex: 'both', age: 400, toxicity: 0.1, tick: 50, ...extra });
    const make = (classifier: SpeciesClassifier, batchSize = 1) => {
        const repository = new SpeciesRepository(createMemorySpeciesStore());
        return { jobs: new SpeciesJobs(classifier, repository, undefined, { batchSize }), repository };
    };

    it('says which species a flower it classified is, with the classifier that said it and the tick it was asked at', async () => {
        const { classifier } = counting();
        const { jobs } = make(classifier);
        jobs.enqueue(request('a', flowers[0], { tick: 77 }));
        const result = (await jobs.runNext())!;
        expect(result).toMatchObject({ flowerId: 'a', status: 'discovered', tick: 77, fp: real.fingerprint, match: cell(9) });
    });

    it('does not say a match for a flower that has none, or that it did not classify', async () => {
        const noMatch = { ...counting().classifier, classify: async () => null, classifyBatch: async (l: string[]) => l.map(() => null) } as SpeciesClassifier;
        const { jobs, repository } = make(noMatch);
        jobs.enqueue(request('a', flowers[0], { tick: 5 }));
        const unclassified = (await jobs.runNext())!;
        expect(unclassified.match).toBeUndefined();
        expect(unclassified.tick).toBe(5);

        await repository.offer({ genome: flowers[1], match: cell(1), fp: real.fingerprint, sex: 'both', tick: 1 });
        jobs.enqueue(request('b', flowers[1], { tick: 6 }));
        const skipped = (await jobs.runNext())!;
        expect(skipped.status).toBe('skipped');
        expect(skipped.match).toBeUndefined();
    });

    it('does not classify a flower again when the death comes with the species it was given', async () => {
        const { classifier, calls } = counting();
        const { jobs } = make(classifier);
        jobs.enqueueRecord(death('a', flowers[0], { match: cell(4), fp: real.fingerprint }));
        const result = (await jobs.runNext())!;
        expect(calls.single).toEqual([]);
        expect(calls.batch).toEqual([]);
        expect(result.species).toMatchObject({ x: cell(4).x, y: cell(4).y });
    });

    it('classifies it when the match came from another classifier', async () => {
        const { classifier, calls } = counting();
        const { jobs } = make(classifier);
        jobs.enqueueRecord(death('a', flowers[0], { match: cell(4), fp: 'an-older-classifier' }));
        const result = (await jobs.runNext())!;
        expect(calls.single).toEqual([flowers[0]]);
        expect(result.species).toMatchObject({ x: cell(9).x, y: cell(9).y });
    });

    it('classifies it when no match came with the death', async () => {
        const { classifier, calls } = counting();
        const { jobs } = make(classifier);
        jobs.enqueueRecord(death('a', flowers[0]));
        await jobs.runNext();
        expect(calls.single).toEqual([flowers[0]]);
    });

    it('leaves a flower whose match came out of the batch that classifies the others', async () => {
        const { classifier, calls } = counting();
        const { jobs } = make(classifier, 8);
        jobs.enqueue(request('a', flowers[1]));
        jobs.enqueueRecord(death('d', flowers[2], { match: cell(5), fp: real.fingerprint }));
        jobs.enqueue(request('b', flowers[3]));
        while (jobs.hasWork()) await jobs.runNext();
        expect(calls.batch).toEqual([[flowers[1], flowers[3]]]);
        expect(calls.single).toEqual([]);
    });
});
