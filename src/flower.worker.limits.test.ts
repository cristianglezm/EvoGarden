// @vitest-environment node
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeAll } from 'vitest';
import { FEService } from '@cristianglezm/flower-evolver-wasm';
import { createSpeciesClassifier } from './services/speciesClassifier';
import type { SpeciesSample } from './types';

// The player lowered the cap in the field guide: the flower worker reads it from IndexedDB, with
// nothing to call it, and lets go the samples over it.
type Message = { type: string; payload: any };
const messages: Message[] = [];
let database: typeof import('./services/db').db;
let genome = '';
let fingerprint = '';
let toWorker: MessagePort;

const row = (i: number, extra: Partial<SpeciesSample> = {}): SpeciesSample => ({
    id: `s${i}`,
    cell: '30,30',
    x: 30,
    y: 30,
    d: i,
    fp: fingerprint,
    kind: 'sample',
    founder: i === 1,
    records: [],
    sex: 'both',
    createdAt: i,
    ...extra,
});

beforeAll(async () => {
    const service = new FEService();
    await service.init();
    fingerprint = createSpeciesClassifier(service).fingerprint;
    genome = (await service.makeFlower()).genome;

    ({ db: database } = await import('./services/db'));
    const rows = [1, 2, 3, 4, 5].map(i => row(i));
    await database.speciesSamples.bulkPut(rows);
    await database.speciesGenomes.bulkPut(rows.map(r => ({ id: r.id, genome: `{"Flower":{"n":${r.id.slice(1)}}}` })));
    await database.speciesMeta.put({ key: 'limits', value: { cap: 2 } });

    (globalThis as any).self = globalThis;
    await import('./flower.worker');
    const channel = new MessageChannel();
    toWorker = channel.port2;
    channel.port2.onmessage = (e: MessageEvent) => {
        messages.push(e.data);
    };
    await (globalThis as any).onmessage({ data: { type: 'init-ports', payload: { simWorkerPort: channel.port1 } } });
}, 60_000);

describe('the flower worker with a cap chosen by the player', () => {
    it('lets go the most typical samples over it, never the founder', async () => {
        toWorker.postMessage({ type: 'classify-flower', payload: { flowerId: 'f', genome, image: 'png', sex: 'both', age: 1, toxicity: 0, tick: 1 } });
        await expect.poll(() => messages.length, { timeout: 15_000 }).toBe(1);

        const left = (await database.speciesSamples.where('cell').equals('30,30').toArray()).map(r => r.id).sort();
        expect(left).toEqual(['s1', 's5']);
        expect(await database.speciesGenomes.get('s3')).toBeUndefined();
    }, 30_000);
});
