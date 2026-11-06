// @vitest-environment node
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeAll } from 'vitest';
import { FEService } from '@cristianglezm/flower-evolver-wasm';

// A player who had champions before the species collection existed: they are put in it when the
// flower worker starts, so the field guide can tell which species each one belongs to.
type Message = { type: string; payload: any };
const messages: Message[] = [];
let genomes: string[] = [];
let database: typeof import('./services/db').db;

beforeAll(async () => {
    const service = new FEService();
    await service.init();
    for (let i = 0; i < 3; i++) genomes.push((await service.makeFlower()).genome);

    ({ db: database } = await import('./services/db'));
    await database.seedBank.bulkPut([
        { category: 'longestLived', genome: genomes[0], value: 321, imageData: 'png-0', sex: 'female' },
        { category: 'mostToxic', genome: genomes[1], value: 0.9, imageData: 'png-1', sex: 'male' },
        { category: 'mostHealing', genome: genomes[2], value: -0.4, imageData: 'png-2', sex: 'both' },
    ]);

    (globalThis as any).self = globalThis;
    await import('./flower.worker');
    const channel = new MessageChannel();
    channel.port2.onmessage = (e: MessageEvent) => { messages.push(e.data); };
    await (globalThis as any).onmessage({ data: { type: 'init-ports', payload: { simWorkerPort: channel.port1 } } });
}, 60_000);

describe('the flower worker at start', () => {
    it('puts the champions of the seed bank in the collection, each with the record it won', async () => {
        await expect.poll(() => database.speciesSamples.count(), { timeout: 15_000 }).toBeGreaterThanOrEqual(1);
        await expect.poll(() => messages.length, { timeout: 15_000 }).toBe(3);

        const rows = await database.speciesSamples.toArray();
        const holding = (category: string) => rows.filter(r => r.records.includes(category as never));
        expect(holding('longestLived').map(r => r.age)).toEqual([321]);
        expect(holding('mostToxic').map(r => r.toxicity)).toEqual([0.9]);
        expect(holding('mostHealing').map(r => r.toxicity)).toEqual([-0.4]);
        // each took only its own record: none holds the record of a value it does not have
        expect(rows.every(r => r.records.length === 1 || r.records.length === 2 || r.records.length === 3)).toBe(true);
        expect(holding('longestLived')[0].toxicity).toBeUndefined();

        const champion = await database.speciesGenomes.get(holding('longestLived')[0].id);
        expect(champion).toMatchObject({ genome: genomes[0], image: 'png-0' });
        expect(messages.map(m => m.type)).toEqual(['species-classified', 'species-classified', 'species-classified']);
    }, 30_000);
});
