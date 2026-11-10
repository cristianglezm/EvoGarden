// @vitest-environment node
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeAll } from 'vitest';
import { FEService } from '@cristianglezm/flower-evolver-wasm';
import { createSpeciesClassifier } from './services/speciesClassifier';
import type { SpeciesSample } from './types';

// A player with champions saved before the species collection existed, and a collection made by
// an older classifier: the species worker puts the first in and classifies the second again, and
// announces the champions only.
type Message = { type: string; payload: any };
const messages: Message[] = [];
let fingerprint = '';
let database: typeof import('./services/db').db;
const champions: string[] = [];
const old: string[] = [];

beforeAll(async () => {
    const service = new FEService();
    await service.init();
    fingerprint = createSpeciesClassifier(service).fingerprint;
    for (let i = 0; i < 3; i++) champions.push((await service.makeFlower()).genome);
    for (let i = 0; i < 4; i++) old.push((await service.makeFlower()).genome);

    ({ db: database } = await import('./services/db'));
    await database.seedBank.bulkPut([
        { category: 'longestLived', genome: champions[0], value: 321, imageData: 'png-0', sex: 'female' },
        { category: 'mostToxic', genome: champions[1], value: 0.9, imageData: 'png-1', sex: 'male' },
        { category: 'mostHealing', genome: champions[2], value: -0.4, imageData: 'png-2', sex: 'both' },
    ]);
    const row = (i: number): SpeciesSample => ({
        id: `old-${i}`,
        cell: '0,0',
        x: 0,
        y: 0,
        d: 1,
        fp: 'an-older-classifier',
        kind: 'sample',
        founder: true,
        records: [],
        sex: 'both',
        createdAt: 100 - i,
    });
    await database.speciesSamples.bulkPut(old.map((_, i) => row(i)));
    await database.speciesGenomes.bulkPut(old.map((genome, i) => ({ id: `old-${i}`, genome })));

    (globalThis as any).self = globalThis;
    await import('./species.worker');
    const channel = new MessageChannel();
    channel.port2.onmessage = (e: MessageEvent) => {
        messages.push(e.data);
    };
    await (globalThis as any).onmessage({ data: { type: 'init-ports', payload: { simWorkerPort: channel.port1 } } });
}, 60_000);

describe('the species worker at start', () => {
    it('classifies the collection of an older classifier again, and puts the champions in it', async () => {
        await expect.poll(() => database.speciesSamples.where('fp').equals(fingerprint).count(), { timeout: 40_000 }).toBeGreaterThanOrEqual(4 + 1);
        await expect.poll(() => messages.length, { timeout: 40_000 }).toBe(3);

        expect(await database.speciesSamples.where('fp').notEqual(fingerprint).count()).toBe(0);
        const rows = await database.speciesSamples.toArray();
        const holding = (category: string) => rows.filter(r => r.records.includes(category as never));
        expect(holding('longestLived').map(r => r.age)).toEqual([321]);
        expect(holding('mostToxic').map(r => r.toxicity)).toEqual([0.9]);
        expect(holding('mostHealing').map(r => r.toxicity)).toEqual([-0.4]);
        expect(messages.map(m => m.type)).toEqual(['species-classified', 'species-classified', 'species-classified']);
    }, 80_000);
});
