// @vitest-environment node
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeAll } from 'vitest';
import { FEService } from '@cristianglezm/flower-evolver-wasm';
import { DEFAULT_SIM_PARAMS } from './constants';

// A flower worker told it only makes flowers (there is a species worker): it takes no species
// work, and does not start the migration or put the champions in the collection.
type Message = { type: string; payload: any };
const messages: Message[] = [];
let toWorker: MessagePort;
let genome = '';
let database: typeof import('./services/db').db;
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

beforeAll(async () => {
    const service = new FEService();
    await service.init();
    genome = (await service.makeFlower()).genome;

    ({ db: database } = await import('./services/db'));
    await database.seedBank.put({ category: 'longestLived', genome, value: 321, imageData: 'png-0', sex: 'female' });

    (globalThis as any).self = globalThis;
    await import('./flower.worker');
    const channel = new MessageChannel();
    toWorker = channel.port2;
    channel.port2.onmessage = (e: MessageEvent) => {
        messages.push(e.data);
    };
    await (globalThis as any).onmessage({ data: { type: 'init-ports', payload: { simWorkerPort: channel.port1, roles: ['creation'] } } });
    toWorker.postMessage({ type: 'update-params', payload: DEFAULT_SIM_PARAMS });
    await wait(50);
}, 60_000);

describe('the flower worker that only makes flowers', () => {
    it('makes flowers', async () => {
        toWorker.postMessage({ type: 'request-flower', payload: { requestId: 'r1', flowerId: 'f1', x: 1, y: 2 } });
        await expect.poll(() => messages.map(m => m.type), { timeout: 15_000 }).toEqual(['flower-created']);
    }, 30_000);

    it('leaves the species work, and the champions, to the species worker', async () => {
        messages.length = 0;
        toWorker.postMessage({ type: 'classify-flower', payload: { flowerId: 'a', genome, sex: 'both', age: 1, toxicity: 0, tick: 1 } });
        toWorker.postMessage({ type: 'record-flower', payload: { flowerId: 'a', genome, sex: 'both', age: 1, toxicity: 0, tick: 1 } });
        await wait(600);
        expect(messages).toEqual([]);
        expect(await database.speciesSamples.count()).toBe(0);
    }, 30_000);
});
