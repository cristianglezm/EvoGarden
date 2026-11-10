// @vitest-environment node
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { FEService } from '@cristianglezm/flower-evolver-wasm';
import { DEFAULT_SIM_PARAMS } from './constants';

// A flower worker that classifies when the simulation has nothing for it to make, next to a species
// worker: it takes the batches it is given, but does not do what only one worker may do (the migration
// of the collection and the champions), and is not slowed by a batch size meant for a worker with nothing else.
type Message = { type: string; payload: any };
const messages: Message[] = [];
let toWorker: MessagePort;
let genomes: string[] = [];
let classifier: { classifyBatch: (g: string[]) => Promise<unknown[]>; classify: (g: string) => Promise<unknown> };
let database: typeof import('./services/db').db;
const types = () => messages.map(m => m.type);
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const job = (flowerId: string, genome: string) => ({
    type: 'classify-flower',
    payload: { flowerId, genome, image: 'png', sex: 'both', age: 60, toxicity: 0.1, tick: 7 },
});

beforeAll(async () => {
    const service = new FEService();
    await service.init();
    for (let i = 0; i < 5; i++) genomes.push((await service.makeFlower()).genome);

    ({ db: database } = await import('./services/db'));
    // a champion saved before the collection: the worker that does the start puts it in, this one must not
    await database.seedBank.put({ category: 'longestLived', genome: genomes[4], value: 321, imageData: 'png-0', sex: 'female' });

    (globalThis as any).self = globalThis;
    await import('./flower.worker');
    const { flowerService } = await import('./services/flowerService');
    const channel = new MessageChannel();
    toWorker = channel.port2;
    channel.port2.onmessage = (e: MessageEvent) => {
        messages.push(e.data);
    };
    await (globalThis as any).onmessage({
        data: { type: 'init-ports', payload: { simWorkerPort: channel.port1, roles: ['creation', 'species'], speciesBatch: 8, primarySpecies: false } },
    });
    toWorker.postMessage({ type: 'update-params', payload: DEFAULT_SIM_PARAMS });
    classifier = flowerService.speciesClassifier;
    await wait(100);
}, 60_000);

describe('the flower worker that helps with the species', () => {
    it('does not start the migration nor put the champions in the collection: the species worker does', async () => {
        await wait(500);
        expect(messages).toEqual([]);
        expect(await database.speciesSamples.count()).toBe(0);
    }, 30_000);

    it('does the jobs of a batch it is given, in one call, and answers each one', async () => {
        const classifyBatch = vi.spyOn(classifier, 'classifyBatch');
        const classify = vi.spyOn(classifier, 'classify');
        toWorker.postMessage({ type: 'species-batch', payload: { jobs: genomes.slice(0, 3).map((g, i) => job(`h${i}`, g)) } });
        await vi.waitFor(() => expect(types()).toEqual(['species-classified', 'species-classified', 'species-classified']), { timeout: 20_000 });
        expect(messages.map(m => m.payload.flowerId)).toEqual(['h0', 'h1', 'h2']);
        expect(classifyBatch.mock.calls.map(call => call[0].length)).toEqual([3]);
        expect(classify).not.toHaveBeenCalled();
        expect(await database.speciesSamples.count()).toBeGreaterThan(0);
    }, 40_000);

    it('goes on making flowers', async () => {
        messages.length = 0;
        toWorker.postMessage({ type: 'request-flower', payload: { requestId: 'r1', flowerId: 'f1', x: 1, y: 2 } });
        await vi.waitFor(() => expect(types()).toEqual(['flower-created']), { timeout: 20_000 });
    }, 40_000);
});
