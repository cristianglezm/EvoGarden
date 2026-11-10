// @vitest-environment node
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { FEService } from '@cristianglezm/flower-evolver-wasm';
import type { SpeciesRequest } from './types';

// The real species worker, loaded as the browser would and spoken to through a real MessageChannel.
type Message = { type: string; payload: any };
const messages: Message[] = [];
const ids = () => messages.map(m => m.payload.flowerId);
let toWorker: MessagePort;
let genomes: string[] = [];
let classifier: { classify: (genome: string) => Promise<unknown>; classifyBatch: (genomes: string[]) => Promise<unknown[]> };
// the real call, taken before any test spies on it, so a held call is not counted twice
let realClassifyBatch: (genomes: string[]) => Promise<unknown[]>;
let database: typeof import('./services/db').db;

const classifyRequest = (flowerId: string, genome: string): { type: string; payload: SpeciesRequest } => ({
    type: 'classify-flower',
    payload: { flowerId, genome, image: 'png', sex: 'both', age: 60, toxicity: 0.1, tick: 7 },
});
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
// Holds the next classification: the worker classifies what waits in one call, so it is the batch that is held.
const gate = () => {
    let open!: () => void;
    const promise = new Promise<void>(resolve => {
        open = resolve;
    });
    vi.spyOn(classifier, 'classifyBatch').mockImplementationOnce(async genomes => {
        await promise;
        return realClassifyBatch(genomes);
    });
    return open;
};

beforeAll(async () => {
    const service = new FEService();
    await service.init();
    for (let i = 0; i < 8; i++) genomes.push((await service.makeFlower()).genome);

    (globalThis as any).self = globalThis;
    await import('./species.worker');
    const { flowerService } = await import('./services/flowerService');
    ({ db: database } = await import('./services/db'));

    const channel = new MessageChannel();
    toWorker = channel.port2;
    channel.port2.onmessage = (e: MessageEvent) => {
        messages.push(e.data);
    };
    await (globalThis as any).onmessage({ data: { type: 'init-ports', payload: { simWorkerPort: channel.port1 } } });
    classifier = flowerService.speciesClassifier;
    realClassifyBatch = classifier.classifyBatch.bind(classifier);
}, 60_000);

afterEach(() => {
    vi.restoreAllMocks();
    messages.length = 0;
});

describe('the species worker', () => {
    it('classifies a flower and reports the discovery, keeping it in the collection', async () => {
        toWorker.postMessage(classifyRequest('a', genomes[0]));
        await vi.waitFor(() => expect(messages).toHaveLength(1), { timeout: 15_000 });

        const { type, payload } = messages[0];
        expect(type).toBe('species-classified');
        expect(payload).toMatchObject({ flowerId: 'a', status: 'discovered' });
        const [row] = await database.speciesSamples.toArray();
        expect(row).toMatchObject({ founder: true, cell: `${payload.species.x},${payload.species.y}`, age: 60, tick: 7 });
        expect(await database.speciesGenomes.get(row.id)).toMatchObject({ genome: genomes[0], image: 'png' });
    }, 30_000);

    it('does not classify a genome it already holds again', async () => {
        const classify = vi.spyOn(classifier, 'classify');
        const classifyBatch = vi.spyOn(classifier, 'classifyBatch');
        toWorker.postMessage(classifyRequest('b', genomes[0]));
        await vi.waitFor(() => expect(messages).toHaveLength(1), { timeout: 15_000 });
        expect(messages[0].payload).toEqual({ flowerId: 'b', status: 'skipped' });
        expect(classify).not.toHaveBeenCalled();
        expect(classifyBatch).not.toHaveBeenCalled();
    }, 30_000);

    it('does one job after another, with nothing else to wait for', async () => {
        for (const [i, id] of ['c', 'd', 'e'].entries()) toWorker.postMessage(classifyRequest(id, genomes[1 + i]));
        await vi.waitFor(() => expect(messages).toHaveLength(3), { timeout: 20_000 });
        expect(ids()).toEqual(['c', 'd', 'e']);
    }, 40_000);

    it('goes on with what arrives after it was idle', async () => {
        toWorker.postMessage(classifyRequest('f', genomes[4]));
        await vi.waitFor(() => expect(messages).toHaveLength(1), { timeout: 15_000 });
        await wait(100);
        toWorker.postMessage(classifyRequest('g', genomes[5]));
        await vi.waitFor(() => expect(messages).toHaveLength(2), { timeout: 15_000 });
        expect(ids()).toEqual(['f', 'g']);
    }, 40_000);

    it('makes no flowers: that is not its work', async () => {
        toWorker.postMessage({ type: 'request-flower', payload: { requestId: 'r1', flowerId: 'f1', x: 1, y: 2 } });
        toWorker.postMessage({ type: 'update-params', payload: {} });
        toWorker.postMessage(classifyRequest('h', genomes[6]));
        await vi.waitFor(() => expect(messages).toHaveLength(1), { timeout: 15_000 });
        await wait(300);
        expect(messages.map(m => m.type)).toEqual(['species-classified']);
    }, 30_000);

    it('drops the classifications waiting when everything is cancelled', async () => {
        const open = gate();
        toWorker.postMessage(classifyRequest('i', genomes[7]));
        toWorker.postMessage(classifyRequest('j', '{"Flower":{"a":1}}'));
        toWorker.postMessage(classifyRequest('k', '{"Flower":{"a":2}}'));
        await wait(100);
        toWorker.postMessage({ type: 'cancel-all-requests' });
        await wait(50);
        open();

        await vi.waitFor(() => expect(messages).toHaveLength(1), { timeout: 15_000 });
        await wait(400);
        expect(ids()).toEqual(['i']);
    }, 30_000);

    it('says "failed" for a flower the classifier fails on and goes on with the next, also when the batch failed first', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        vi.spyOn(classifier, 'classifyBatch').mockRejectedValueOnce(new Error('wasm trap'));
        vi.spyOn(classifier, 'classify').mockRejectedValueOnce(new Error('wasm trap'));
        toWorker.postMessage(classifyRequest('l', '{"Flower":{"b":1}}'));
        toWorker.postMessage(classifyRequest('m', '{"Flower":{"b":2}}'));
        await vi.waitFor(() => expect(messages).toHaveLength(2), { timeout: 15_000 });
        expect(messages.map(m => [m.payload.flowerId, m.payload.status === 'failed'])).toEqual([
            ['l', true],
            ['m', false],
        ]);
    }, 30_000);

    it('classifies the flowers that wait together, in one call, and says how long each took', async () => {
        const classify = vi.spyOn(classifier, 'classify');
        const open = gate();
        const classifyBatch = vi.spyOn(classifier, 'classifyBatch');
        toWorker.postMessage(classifyRequest('p', '{"Flower":{"c":1}}'));
        await wait(100);
        // these come while the first one is being classified, and wait for the next call
        for (const [i, id] of ['q', 'r', 's', 't'].entries()) toWorker.postMessage(classifyRequest(id, `{"Flower":{"c":${i + 2}}}`));
        await wait(100);
        open();

        await vi.waitFor(() => expect(messages).toHaveLength(5), { timeout: 20_000 });
        expect(ids()).toEqual(['p', 'q', 'r', 's', 't']);
        // every one of them was classified (the genomes are not flowers, so none has a cell) and says how long that took
        expect(messages.map(m => typeof m.payload.durationMs)).toEqual(['number', 'number', 'number', 'number', 'number']);
        // the first one alone, held; the four that came meanwhile in the next call
        expect(classifyBatch.mock.calls.map(call => call[0].length)).toEqual([1, 4]);
        expect(classify).not.toHaveBeenCalled();
    }, 40_000);

    it('does the jobs of a batch message, classifying the flowers in it in one call', async () => {
        const classifyBatch = vi.spyOn(classifier, 'classifyBatch');
        const classify = vi.spyOn(classifier, 'classify');
        toWorker.postMessage({
            type: 'species-batch',
            payload: {
                jobs: [
                    classifyRequest('u1', '{"Flower":{"d":1}}'),
                    classifyRequest('u2', '{"Flower":{"d":2}}'),
                    { type: 'record-flower', payload: { ...classifyRequest('u3', '{"Flower":{"d":3}}').payload, age: 5 } },
                ],
            },
        });
        await vi.waitFor(() => expect(messages).toHaveLength(3), { timeout: 20_000 });
        expect(ids()).toEqual(['u1', 'u2', 'u3']);
        expect(classifyBatch.mock.calls.map(call => call[0].length)).toEqual([3]);
        expect(classify).not.toHaveBeenCalled();
    }, 40_000);

    it('takes the records of the species of a flower that dies', async () => {
        toWorker.postMessage({ type: 'record-flower', payload: { ...classifyRequest('n', genomes[0]).payload, age: 9999, toxicity: 0.99, tick: 12345 } });
        await vi.waitFor(() => expect(messages).toHaveLength(1), { timeout: 15_000 });
        expect(messages[0].payload).toEqual({ flowerId: 'n', status: 'recorded' });
        const rows = await database.speciesSamples.toArray();
        expect(rows.find(r => r.records.includes('longestLived'))).toMatchObject({ age: 9999, tick: 12345 });
    }, 30_000);
});
