// @vitest-environment node
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { FEService } from '@cristianglezm/flower-evolver-wasm';
import { DEFAULT_SIM_PARAMS } from './constants';
import type { SpeciesRequest } from './types';

// The real worker: its module is loaded as the browser would, wasm and IndexedDB included, and
// spoken to through a real MessageChannel as the simulation worker does.
type Message = { type: string; payload: any };
const messages: Message[] = [];
const types = () => messages.map(m => m.type);
let toWorker: MessagePort;
let genomes: string[] = [];
let classifier: { classify: (genome: string) => Promise<unknown> };
let database: typeof import('./services/db').db;

const classifyRequest = (flowerId: string, genome: string): { type: string; payload: SpeciesRequest } => ({
    type: 'classify-flower',
    payload: { flowerId, genome, image: 'png', sex: 'both', age: 60, toxicity: 0.1, tick: 7 },
});
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

beforeAll(async () => {
    const service = new FEService();
    await service.init();
    for (let i = 0; i < 12; i++) genomes.push((await service.makeFlower()).genome);

    (globalThis as any).self = globalThis;
    await import('./flower.worker');
    const { flowerService } = await import('./services/flowerService');
    ({ db: database } = await import('./services/db'));

    const channel = new MessageChannel();
    toWorker = channel.port2;
    channel.port2.onmessage = (e: MessageEvent) => {
        messages.push(e.data);
    };
    await (globalThis as any).onmessage({ data: { type: 'init-ports', payload: { simWorkerPort: channel.port1 } } });
    classifier = flowerService.speciesClassifier;
    toWorker.postMessage({ type: 'update-params', payload: DEFAULT_SIM_PARAMS });
    await wait(50);
}, 60_000);

afterEach(() => {
    vi.restoreAllMocks();
    messages.length = 0;
});

describe('the flower worker', () => {
    it('still creates flowers', async () => {
        toWorker.postMessage({ type: 'request-flower', payload: { requestId: 'r1', flowerId: 'f1', x: 1, y: 2 } });
        await vi.waitFor(() => expect(types()).toEqual(['flower-created']), { timeout: 15_000 });
        expect(messages[0].payload).toMatchObject({ requestId: 'r1', flower: { id: 'f1', x: 1, y: 2, type: 'flower' } });
    }, 30_000);

    it('says how long it took to make the flower and its image, from taking the request: not the time it was idle, nor the time since it started', async () => {
        await new Promise(resolve => setTimeout(resolve, 1200));
        toWorker.postMessage({ type: 'request-flower', payload: { requestId: 'd1', flowerId: 'fd1', x: 3, y: 2 } });
        await vi.waitFor(() => expect(types()).toEqual(['flower-created']), { timeout: 20_000 });
        const { durationMs } = messages[0].payload;
        expect(durationMs).toBeGreaterThan(0);
        expect(durationMs).toBeLessThan(1000);
    }, 40_000);

    it('classifies a flower and reports the discovery, keeping it in the collection', async () => {
        toWorker.postMessage(classifyRequest('a', genomes[0]));
        await vi.waitFor(() => expect(types()).toEqual(['species-classified']), { timeout: 15_000 });

        const { payload } = messages[0];
        expect(payload).toMatchObject({ flowerId: 'a', status: 'discovered' });
        expect(payload.species.name).toEqual(expect.any(String));
        const [row] = await database.speciesSamples.toArray();
        expect(row).toMatchObject({ founder: true, cell: `${payload.species.x},${payload.species.y}`, sex: 'both', age: 60, toxicity: 0.1, tick: 7 });
        expect(await database.speciesGenomes.get(row.id)).toMatchObject({ genome: genomes[0], image: 'png' });
    }, 30_000);

    it('does not classify a genome it already holds again', async () => {
        const classify = vi.spyOn(classifier, 'classify');
        toWorker.postMessage(classifyRequest('b', genomes[0]));
        await vi.waitFor(() => expect(types()).toEqual(['species-classified']), { timeout: 15_000 });
        expect(messages[0].payload).toEqual({ flowerId: 'b', status: 'skipped' });
        expect(classify).not.toHaveBeenCalled();
    }, 30_000);

    it('creates a flower before the next classification, once the job in hand is done', async () => {
        let open!: () => void;
        const gate = new Promise<void>(resolve => {
            open = resolve;
        });
        const classify = classifier.classify.bind(classifier);
        vi.spyOn(classifier, 'classify').mockImplementationOnce(async genome => {
            await gate;
            return classify(genome);
        });

        toWorker.postMessage(classifyRequest('c', genomes[1]));
        toWorker.postMessage({ type: 'request-flower', payload: { requestId: 'r2', flowerId: 'f2', x: 0, y: 0 } });
        toWorker.postMessage(classifyRequest('d', genomes[2]));
        await wait(100); // all three are in the worker, which is stuck in the first job
        open();

        await vi.waitFor(() => expect(types()).toHaveLength(3), { timeout: 15_000 });
        expect(messages.map(m => m.payload.flowerId ?? m.payload.requestId)).toEqual(['c', 'r2', 'd']);
        expect(types()).toEqual(['species-classified', 'flower-created', 'species-classified']);
    }, 30_000);

    it('does a flower and then a species, however many flowers are waiting, so species are not left for when there are none', async () => {
        let open!: () => void;
        const gate = new Promise<void>(resolve => {
            open = resolve;
        });
        const classify = classifier.classify.bind(classifier);
        vi.spyOn(classifier, 'classify').mockImplementationOnce(async genome => {
            await gate;
            return classify(genome);
        });

        toWorker.postMessage(classifyRequest('s0', genomes[9]));
        for (const n of [1, 2, 3, 4]) toWorker.postMessage({ type: 'request-flower', payload: { requestId: `r${n}`, flowerId: `f${n}`, x: n, y: 0 } });
        toWorker.postMessage(classifyRequest('s1', genomes[10]));
        toWorker.postMessage(classifyRequest('s2', genomes[11]));
        await wait(100); // everything is in the worker, which is stuck in the first species
        open();

        await vi.waitFor(() => expect(types()).toHaveLength(7), { timeout: 20_000 });
        // the species in hand, then a flower, a species, a flower, a species, and the flowers left
        expect(messages.map(m => m.payload.flowerId ?? m.payload.requestId)).toEqual(['s0', 'r1', 's1', 'r2', 's2', 'r3', 'r4']);
    }, 40_000);

    it('keeps making flowers when there is no species to do', async () => {
        for (const n of [1, 2, 3]) toWorker.postMessage({ type: 'request-flower', payload: { requestId: `q${n}`, flowerId: `g${n}`, x: n, y: 1 } });
        await vi.waitFor(() => expect(types()).toEqual(['flower-created', 'flower-created', 'flower-created']), { timeout: 20_000 });
        expect(messages.map(m => m.payload.requestId)).toEqual(['q1', 'q2', 'q3']);
    }, 30_000);

    it('drops the classifications waiting when everything is cancelled', async () => {
        let open!: () => void;
        const gate = new Promise<void>(resolve => {
            open = resolve;
        });
        const classify = classifier.classify.bind(classifier);
        vi.spyOn(classifier, 'classify').mockImplementationOnce(async genome => {
            await gate;
            return classify(genome);
        });

        toWorker.postMessage(classifyRequest('e', genomes[3]));
        toWorker.postMessage(classifyRequest('f', genomes[4]));
        toWorker.postMessage(classifyRequest('g', genomes[5]));
        await wait(100);
        toWorker.postMessage({ type: 'cancel-all-requests' });
        await wait(50);
        open();

        await vi.waitFor(() => expect(types()).toEqual(['species-classified']), { timeout: 15_000 });
        await wait(400);
        expect(messages.map(m => m.payload.flowerId)).toEqual(['e']);
    }, 30_000);

    it('says "failed" for a flower the classifier fails on and goes on with the next', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        vi.spyOn(classifier, 'classify').mockRejectedValueOnce(new Error('wasm trap'));

        toWorker.postMessage(classifyRequest('h', genomes[6]));
        toWorker.postMessage(classifyRequest('i', genomes[7]));
        await vi.waitFor(() => expect(types()).toHaveLength(2), { timeout: 15_000 });
        expect(messages.map(m => [m.payload.flowerId, m.payload.status === 'failed'])).toEqual([
            ['h', true],
            ['i', false],
        ]);
    }, 30_000);

    it('takes the records of the species of a flower that dies', async () => {
        toWorker.postMessage(classifyRequest('k', genomes[8]));
        await vi.waitFor(() => expect(types()).toEqual(['species-classified']), { timeout: 15_000 });
        const species = messages[0].payload.species;
        messages.length = 0;

        toWorker.postMessage({ type: 'record-flower', payload: { ...classifyRequest('k', genomes[8]).payload, age: 9999, toxicity: 0.99, tick: 12345 } });
        await vi.waitFor(() => expect(types()).toEqual(['species-classified']), { timeout: 15_000 });
        expect(messages[0].payload).toEqual({ flowerId: 'k', status: 'recorded' });
        const rows = await database.speciesSamples.where('cell').equals(`${species.x},${species.y}`).toArray();
        const holder = rows.find(r => r.records.includes('longestLived'))!;
        expect(holder).toMatchObject({ age: 9999, toxicity: 0.99, tick: 12345, records: ['longestLived', 'mostToxic'] });
    }, 30_000);

    it('keeps a flower that has no species, without a species in the answer', async () => {
        toWorker.postMessage(classifyRequest('j', '{"Flower":{}}'));
        await vi.waitFor(() => expect(types()).toEqual(['species-classified']), { timeout: 15_000 });
        // a flower that was classified says how long that took; what the answer is about is the rest of it
        const { durationMs, tick: _tick, ...answer } = messages[0].payload;
        expect(answer).toEqual({ flowerId: 'j', status: 'unclassified' });
        expect(durationMs).toBeGreaterThanOrEqual(0);
        expect(await database.speciesSamples.where('cell').equals('none').count()).toBe(1);
    }, 30_000);
});
