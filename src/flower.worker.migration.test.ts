// @vitest-environment node
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeAll } from 'vitest';
import { FEService } from '@cristianglezm/flower-evolver-wasm';
import { createSpeciesClassifier } from './services/speciesClassifier';
import type { SpeciesSample } from './types';

// A player whose collection was made by the classifier of an older fe-wasm: when the flower worker
// starts it is classified again, in the background, and nothing is announced.
type Message = { type: string; payload: any };
const messages: Message[] = [];
let genomes: string[] = [];
let fingerprint = '';
let database: typeof import('./services/db').db;

beforeAll(async () => {
    const service = new FEService();
    await service.init();
    fingerprint = createSpeciesClassifier(service).fingerprint;
    for (let i = 0; i < 6; i++) genomes.push((await service.makeFlower()).genome);

    ({ db: database } = await import('./services/db'));
    const row = (i: number): SpeciesSample => ({
        id: `old-${i}`, cell: '0,0', x: 0, y: 0, d: 1, fp: 'an-older-classifier', kind: 'sample', founder: true,
        records: i === 1 ? ['longestLived'] : [], sex: 'both', createdAt: 100 - i, ...(i === 1 ? { age: 50 } : {}),
    });
    await database.speciesSamples.bulkPut(genomes.map((_, i) => row(i)));
    await database.speciesGenomes.bulkPut(genomes.map((genome, i) => ({ id: `old-${i}`, genome })));

    (globalThis as any).self = globalThis;
    await import('./flower.worker');
    const channel = new MessageChannel();
    channel.port2.onmessage = (e: MessageEvent) => { messages.push(e.data); };
    await (globalThis as any).onmessage({ data: { type: 'init-ports', payload: { simWorkerPort: channel.port1 } } });
}, 60_000);

describe('the flower worker at start, with a collection from an older classifier', () => {
    it('classifies it again and decides its founders and records again', async () => {
        await expect.poll(async () => (await database.speciesSamples.where('fp').equals(fingerprint).count()), { timeout: 30_000 }).toBe(6);

        const rows = await database.speciesSamples.toArray();
        expect(rows.every(r => r.fp === fingerprint)).toBe(true);
        // every sample was a founder of its own: now each species has one, the oldest
        const cells = new Set(rows.map(r => r.cell));
        for (const cell of cells) {
            const members = rows.filter(r => r.cell === cell);
            expect(members.filter(r => r.founder)).toHaveLength(1);
            expect(members.find(r => r.founder)!.createdAt).toBe(Math.min(...members.map(r => r.createdAt)));
        }
        // the record that old-1 held is still held by it, alone
        expect(rows.filter(r => r.records.includes('longestLived')).map(r => r.id)).toEqual(['old-1']);
        // their genomes are still there
        expect(await database.speciesGenomes.count()).toBe(6);
    }, 60_000);

    it('announces nothing', async () => {
        await expect.poll(async () => (await database.speciesSamples.where('fp').equals(fingerprint).count()), { timeout: 30_000 }).toBe(6);
        expect(messages).toEqual([]);
    }, 60_000);
});
