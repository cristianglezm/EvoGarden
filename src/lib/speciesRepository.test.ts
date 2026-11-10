// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest';
import { speciesStoreFactories } from '../test/speciesStores';
import { SpeciesRepository, DEFAULT_SPECIES_LIMITS, SPECIES_CAP_MAX, type SpeciesCandidate, type SpeciesLimits } from './speciesRepository';
import { genomeId } from './species';
import type { SpeciesSample, SpeciesStore } from '../types';

let counter = 0;
type Cell = [number, number] | null;

// The genome only has to be a distinct string: the policy never reads inside it.
function flower(cell: Cell, d = 1, extra: Partial<SpeciesCandidate> = {}): SpeciesCandidate {
    return {
        genome: `{"Flower":{"n":${counter++}}}`,
        match: cell ? { x: cell[0], y: cell[1], distance: d } : null,
        fp: 'fp1',
        sex: 'both',
        ...extra,
    };
}

describe.each(speciesStoreFactories)('SpeciesRepository on the %s store', (_name, makeStore) => {
    let store: SpeciesStore;
    let clock: number;
    const repository = (limits: Partial<SpeciesLimits> = {}) => new SpeciesRepository(store, limits, () => ++clock);
    const inCell = (cell: string) => store.transaction(tx => tx.inCell(cell));
    const ofKind = (kind: SpeciesSample['kind']) => store.transaction(tx => tx.ofKind(kind));
    const sampleRows = async (cell: string) => (await inCell(cell)).filter(s => s.kind === 'sample');

    beforeEach(async () => {
        store = await makeStore();
        clock = 0;
        counter = 0;
    });

    // Enough stored distances for the atypical threshold to exist (it needs 20), all close together.
    async function fillBaseline(repo: SpeciesRepository, cells = 60) {
        for (let i = 0; i < cells; i++) await repo.offer(flower([i, 0], 1));
    }

    describe('a species is discovered by its first flower', () => {
        it('stores it as the founder with its genome and image', async () => {
            const repo = repository();
            const first = flower([3, 5], 0.7, { image: 'png', age: 40, toxicity: 0.2, tick: 900 });
            const result = await repo.offer(first);
            expect(result).toEqual({ stored: true, kind: 'sample', discovered: true, evicted: [] });

            const [row] = await inCell('3,5');
            expect(row).toMatchObject({
                cell: '3,5',
                x: 3,
                y: 5,
                d: 0.7,
                fp: 'fp1',
                kind: 'sample',
                founder: true,
                records: [],
                sex: 'both',
                age: 40,
                toxicity: 0.2,
                tick: 900,
            });
            const stored = await store.transaction(tx => tx.genome(row.id));
            expect(stored).toEqual({ id: row.id, genome: first.genome, image: 'png' });
        });

        it('the next flowers of the species are not discoveries and keep no image', async () => {
            const repo = repository();
            await repo.offer(flower([3, 5]));
            const second = flower([3, 5], 2, { image: 'png' });
            expect(await repo.offer(second)).toEqual({ stored: true, kind: 'sample', discovered: false, evicted: [] });

            const rows = await inCell('3,5');
            expect(rows).toHaveLength(2);
            const row = rows.find(r => !r.founder)!;
            expect(await store.transaction(tx => tx.genome(row.id))).toEqual({ id: row.id, genome: second.genome });
        });

        it('comes before everything else, even for a flower far from every species', async () => {
            const repo = repository();
            await fillBaseline(repo);
            const result = await repo.offer(flower([40, 7], 50));
            expect(result).toEqual({ stored: true, kind: 'sample', discovered: true, evicted: [] });
        });
    });

    describe('the cap of a species', () => {
        it('stores every flower below the cap', async () => {
            const repo = repository({ cap: 3 });
            for (const d of [1, 2, 3]) await repo.offer(flower([0, 0], d));
            expect(await sampleRows('0,0')).toHaveLength(3);
        });

        it('at the cap, a flower farther from its species replaces the most typical one', async () => {
            const repo = repository({ cap: 3 });
            const founder = flower([0, 0], 0.1);
            await repo.offer(founder);
            await repo.offer(flower([0, 0], 3));
            await repo.offer(flower([0, 0], 2));

            const result = await repo.offer(flower([0, 0], 5));
            expect(result.stored).toBe(true);
            const evicted = (result as { evicted: string[] }).evicted;
            expect(evicted).toHaveLength(1);
            expect((await sampleRows('0,0')).map(s => s.d).sort()).toEqual([0.1, 3, 5]);
            // the one that left was the most typical of those allowed to leave: d = 2, not the founder's 0.1
            expect((await sampleRows('0,0')).some(s => s.id === evicted[0])).toBe(false);
        });

        it('at the cap, a flower no farther than the most typical one is not stored', async () => {
            const repo = repository({ cap: 2 });
            await repo.offer(flower([0, 0], 0.1));
            await repo.offer(flower([0, 0], 3));
            expect(await repo.offer(flower([0, 0], 3))).toEqual({ stored: false, reason: 'typical' });
            expect(await repo.offer(flower([0, 0], 1))).toEqual({ stored: false, reason: 'typical' });
            expect((await sampleRows('0,0')).map(s => s.d).sort()).toEqual([0.1, 3]);
        });

        it('never evicts the founder, however typical it is', async () => {
            const repo = repository({ cap: 2 });
            await repo.offer(flower([0, 0], 0.01));
            await repo.offer(flower([0, 0], 1));
            await repo.offer(flower([0, 0], 2));
            const rows = await sampleRows('0,0');
            expect(rows.find(r => r.founder)!.d).toBe(0.01);
            expect(rows.map(r => r.d).sort()).toEqual([0.01, 2]);
        });

        it('never evicts a flower that holds a record of its species', async () => {
            const repo = repository({ cap: 2 });
            await repo.offer(flower([0, 0], 5));
            await repo.offer(flower([0, 0], 0.5));
            const [typical] = (await sampleRows('0,0')).filter(s => !s.founder);
            await store.transaction(async tx => {
                const row = (await tx.get(typical.id))!;
                const stored = (await tx.genome(row.id))!;
                await tx.put({ ...row, records: ['mostToxic'] }, stored.genome);
            });
            expect(await repo.offer(flower([0, 0], 9))).toEqual({ stored: false, reason: 'full' });
            expect((await sampleRows('0,0')).map(s => s.d).sort()).toEqual([0.5, 5]);
        });

        it('says "full" when everything in the way is protected', async () => {
            const repo = repository({ cap: 1 });
            await repo.offer(flower([0, 0], 1));
            expect(await repo.offer(flower([0, 0], 9))).toEqual({ stored: false, reason: 'full' });
        });

        it('is per species: a full species does not stop another', async () => {
            const repo = repository({ cap: 1 });
            await repo.offer(flower([0, 0]));
            expect((await repo.offer(flower([1, 0]))).stored).toBe(true);
        });
    });

    describe('atypical flowers', () => {
        it('are stored outside the cap of their species', async () => {
            const repo = repository({ cap: 2 });
            await fillBaseline(repo);
            // the baseline is all 1, so 1 is the threshold itself: usual, a sample of its species
            await repo.offer(flower([0, 0], 1));
            const before = await sampleRows('0,0');
            expect(before).toHaveLength(2);

            const result = await repo.offer(flower([0, 0], 8));
            expect(result).toEqual({ stored: true, kind: 'atypical', discovered: false, evicted: [] });
            expect(await sampleRows('0,0')).toEqual(before);
            expect(await ofKind('atypical')).toHaveLength(1);
        });

        it('need enough flowers to say what is usual', async () => {
            const repo = repository({ cap: 5 });
            await repo.offer(flower([0, 0], 1));
            expect((await repo.offer(flower([0, 0], 1000))).stored && (await ofKind('atypical')).length).toBe(0);
        });

        it('are capped in all: a farther one replaces the least atypical, a nearer one is not kept', async () => {
            const repo = repository({ atypicalCap: 2 });
            await fillBaseline(repo, 80);
            await repo.offer(flower([0, 0], 5));
            await repo.offer(flower([0, 0], 6));
            expect(await repo.offer(flower([0, 0], 4))).toEqual({ stored: false, reason: 'typical' });

            const result = await repo.offer(flower([0, 0], 7));
            expect(result).toMatchObject({ stored: true, kind: 'atypical' });
            expect((await ofKind('atypical')).map(s => s.d).sort()).toEqual([6, 7]);
        });
    });

    describe('unclassified flowers', () => {
        it('are stored under "none" with no species and are not a discovery', async () => {
            const repo = repository();
            const lost = flower(null);
            expect(await repo.offer(lost)).toEqual({ stored: true, kind: 'unclassified', discovered: false, evicted: [] });
            const [row] = await inCell('none');
            expect(row).toMatchObject({ cell: 'none', x: null, y: null, d: null, kind: 'unclassified', founder: false });
            expect(await store.transaction(tx => tx.genome(row.id))).toMatchObject({ genome: lost.genome });
        });

        it('are capped, the oldest going first', async () => {
            const repo = repository({ unclassifiedCap: 2 });
            const [a, b, c] = [flower(null), flower(null), flower(null)];
            await repo.offer(a);
            await repo.offer(b);
            const result = await repo.offer(c);
            expect(result).toEqual({ stored: true, kind: 'unclassified', discovered: false, evicted: [await genomeId(a.genome)] });
            const ids = (await ofKind('unclassified')).map(s => s.id).sort();
            expect(ids).toEqual([await genomeId(b.genome), await genomeId(c.genome)].sort());
        });

        it('do not count as flowers when judging what is atypical', async () => {
            const repo = repository();
            await fillBaseline(repo);
            for (let i = 0; i < 30; i++) await repo.offer(flower(null));
            expect(await repo.offer(flower([0, 0], 8))).toMatchObject({ kind: 'atypical' });
        });
    });

    describe('a genome that is already stored', () => {
        it('is not stored twice, whatever it is', async () => {
            const repo = repository();
            const classified = flower([0, 0]);
            const lost = flower(null);
            await repo.offer(classified);
            await repo.offer(lost);
            expect(await repo.offer(classified)).toEqual({ stored: false, reason: 'duplicate' });
            expect(await repo.offer(lost)).toEqual({ stored: false, reason: 'duplicate' });
            expect(await inCell('0,0')).toHaveLength(1);
            expect(await inCell('none')).toHaveLength(1);
        });

        it('is not stored twice when it is offered twice at once', async () => {
            const repo = repository();
            const same = flower([0, 0]);
            const results = await Promise.all([repo.offer(same), repo.offer(same)]);
            expect(results.filter(r => r.stored)).toHaveLength(1);
            expect(results.filter(r => !r.stored)).toEqual([{ stored: false, reason: 'duplicate' }]);
        });
    });

    describe('flowers offered at the same time', () => {
        it('never take a species above its cap, and exactly one is the discovery', async () => {
            const repo = repository({ cap: 3 });
            const results = await Promise.all(Array.from({ length: 12 }, (_, i) => repo.offer(flower([0, 0], 1 + i))));
            expect(await sampleRows('0,0')).toHaveLength(3);
            expect(results.filter(r => r.stored && r.discovered)).toHaveLength(1);
            expect((await sampleRows('0,0')).filter(s => s.founder)).toHaveLength(1);
        });
    });

    describe('isStored', () => {
        it('is false for a genome nobody offered, and true once it is in the collection', async () => {
            const repo = repository();
            const f = flower([0, 0]);
            expect(await repo.isStored(f.genome)).toBe(false);
            await repo.offer(f);
            expect(await repo.isStored(f.genome)).toBe(true);
        });

        it('is true for an unclassified flower too', async () => {
            const repo = repository();
            const lost = flower(null);
            await repo.offer(lost);
            expect(await repo.isStored(lost.genome)).toBe(true);
        });

        it('is false for a flower that was offered but not kept', async () => {
            const repo = repository({ cap: 1 });
            await repo.offer(flower([0, 0]));
            const refused = flower([0, 0], 9);
            expect(await repo.offer(refused)).toEqual({ stored: false, reason: 'full' });
            expect(await repo.isStored(refused.genome)).toBe(false);
        });
    });

    describe('the records of a species', () => {
        const holders = async (cell: string) => {
            const rows = await inCell(cell);
            const byCategory = (category: string) => rows.filter(r => r.records.includes(category as never));
            return { longestLived: byCategory('longestLived'), mostToxic: byCategory('mostToxic'), mostHealing: byCategory('mostHealing'), rows };
        };

        it('the first flower of a species that dies holds the records its values allow, and is the discovery', async () => {
            const repo = repository();
            const dead = flower([3, 5], 0.7, { age: 80, toxicity: 0.4, tick: 500, image: 'png' });
            const result = await repo.record(dead);
            expect(result).toEqual({ recorded: ['longestLived', 'mostToxic'], discovered: true, evicted: [] });

            const [row] = await inCell('3,5');
            expect(row).toMatchObject({ founder: true, records: ['longestLived', 'mostToxic'], age: 80, toxicity: 0.4, tick: 500, d: 0.7 });
            expect(await store.transaction(tx => tx.genome(row.id))).toEqual({ id: row.id, genome: dead.genome, image: 'png' });
        });

        it('needs a flower to have lived, to be toxic, or to be healing (a negative toxicity)', async () => {
            const repo = repository();
            expect((await repo.record(flower([0, 0], 1, { age: 0, toxicity: 0 }))).recorded).toEqual([]);
            expect((await repo.record(flower([1, 0], 1, { age: 5, toxicity: 0 }))).recorded).toEqual(['longestLived']);
            expect((await repo.record(flower([2, 0], 1, { age: 5, toxicity: -0.2 }))).recorded).toEqual(['longestLived', 'mostHealing']);
            expect((await repo.record(flower([3, 0], 1, { toxicity: 0.3 }))).recorded).toEqual(['mostToxic']);
        });

        it('stores nothing for a flower that holds no record', async () => {
            const repo = repository();
            await repo.record(flower([0, 0], 1, { age: 0, toxicity: 0 }));
            expect(await inCell('0,0')).toEqual([]);
        });

        it('takes a record from the flower that held it, which keeps the others', async () => {
            const repo = repository();
            const first = flower([0, 0], 1, { age: 50, toxicity: 0.5 });
            const second = flower([0, 0], 1, { age: 90, toxicity: 0.1 });
            await repo.record(first);
            const result = await repo.record(second);

            expect(result).toMatchObject({ recorded: ['longestLived'], discovered: false });
            const h = await holders('0,0');
            expect(h.longestLived.map(r => r.age)).toEqual([90]);
            expect(h.mostToxic.map(r => r.age)).toEqual([50]);
            expect(h.rows).toHaveLength(2);
        });

        it('a tie, or a worse flower, changes nothing', async () => {
            const repo = repository();
            await repo.record(flower([0, 0], 1, { age: 50, toxicity: 0.5 }));
            const before = await inCell('0,0');
            expect((await repo.record(flower([0, 0], 1, { age: 50, toxicity: 0.5 }))).recorded).toEqual([]);
            expect((await repo.record(flower([0, 0], 1, { age: 10, toxicity: 0.1 }))).recorded).toEqual([]);
            expect(await inCell('0,0')).toEqual(before);
        });

        it('the most healing is the lowest toxicity', async () => {
            const repo = repository();
            await repo.record(flower([0, 0], 1, { age: 1, toxicity: -0.2 }));
            expect((await repo.record(flower([0, 0], 1, { age: 1, toxicity: -0.6 }))).recorded).toEqual(['mostHealing']);
            expect((await holders('0,0')).mostHealing.map(r => r.toxicity)).toEqual([-0.6]);
        });

        it('records are of a species: another species has its own', async () => {
            const repo = repository();
            await repo.record(flower([0, 0], 1, { age: 90 }));
            expect((await repo.record(flower([1, 0], 1, { age: 10 }))).recorded).toEqual(['longestLived']);
        });

        it('updates a flower already in the collection instead of storing it again', async () => {
            const repo = repository();
            await repo.offer(flower([0, 0], 1));
            const known = flower([0, 0], 2, { age: 30, toxicity: 0.2, image: 'png', tick: 77 });
            await repo.offer(known);
            expect(await inCell('0,0')).toHaveLength(2);

            const result = await repo.record({ ...known, age: 120 });
            expect(result).toEqual({ recorded: ['longestLived', 'mostToxic'], discovered: false, evicted: [] });
            const rows = await inCell('0,0');
            expect(rows).toHaveLength(2);
            const holder = rows.find(r => r.records.length > 0)!;
            expect(holder).toMatchObject({ founder: false, age: 120, toxicity: 0.2, kind: 'sample' });
            expect(await store.transaction(tx => tx.genome(holder.id))).toEqual({ id: holder.id, genome: known.genome, image: 'png' });
        });

        it('goes by the species the flower is stored under, whatever the classifier says now', async () => {
            const repo = repository();
            const known = flower([0, 0], 1, { age: 10 });
            await repo.offer(known);
            const result = await repo.record({ ...known, match: { x: 7, y: 7, distance: 1 }, age: 99 });
            expect(result.recorded).toEqual(['longestLived']);
            expect(await inCell('7,7')).toEqual([]);
            expect((await inCell('0,0'))[0].records).toEqual(['longestLived']);
        });

        it('is judged against the records of the species it is stored under, not the one the classifier says now', async () => {
            const repo = repository();
            const strong = flower([0, 0], 1, { age: 100 });
            const weak = flower([0, 0], 2, { age: 10 });
            await repo.record(strong);
            await repo.offer(weak);

            // an empty species 7,7 would be easy to beat, but the flower belongs to 0,0
            const result = await repo.record({ ...weak, match: { x: 7, y: 7, distance: 1 }, age: 50 });
            expect(result.recorded).toEqual([]);
            expect((await inCell('0,0')).find(r => r.records.includes('longestLived'))!.age).toBe(100);
        });

        it('needs no species for a flower that is stored, and nothing for one that is not', async () => {
            const repo = repository();
            const known = flower([0, 0], 1, { age: 10 });
            await repo.offer(known);
            expect((await repo.record({ ...known, match: null, age: 99 })).recorded).toEqual(['longestLived']);
            expect(await repo.record(flower(null, 1, { age: 99 }))).toEqual({ recorded: [], discovered: false, evicted: [] });
            expect(await inCell('none')).toEqual([]);
        });

        it('leaves out an unclassified flower that is stored: it has no species to hold records of', async () => {
            const repo = repository();
            const lost = flower(null);
            await repo.offer(lost);
            expect((await repo.record({ ...lost, age: 99 })).recorded).toEqual([]);
            expect((await inCell('none'))[0].records).toEqual([]);
        });

        it('only takes the records it is allowed to, as a champion does', async () => {
            const repo = repository();
            const champion = flower([0, 0], 1, { age: 200, toxicity: 0.9 });
            expect((await repo.record(champion, ['mostToxic'])).recorded).toEqual(['mostToxic']);
            expect((await holders('0,0')).longestLived).toEqual([]);
        });

        it('keeps an atypical flower atypical when it takes a record', async () => {
            const repo = repository();
            await fillBaseline(repo);
            const odd = flower([0, 0], 9);
            await repo.offer(odd);
            expect(await ofKind('atypical')).toHaveLength(1);
            await repo.record({ ...odd, age: 500 });
            const [row] = await ofKind('atypical');
            expect(row.records).toEqual(['longestLived']);
        });

        it('a holder of a record is never evicted by the flowers that come after it', async () => {
            const repo = repository({ cap: 2 });
            await repo.offer(flower([0, 0], 5));
            const holder = flower([0, 0], 0.1, { age: 100 });
            await repo.record(holder);
            for (let d = 1; d <= 9; d++) await repo.offer(flower([0, 0], d));
            const h = await holders('0,0');
            expect(h.longestLived).toHaveLength(1);
            expect(h.longestLived[0].d).toBe(0.1);
        });

        it('a holder that is not stored takes the place of the most typical flower when the species is full', async () => {
            const repo = repository({ cap: 3 });
            await repo.offer(flower([0, 0], 0.5));
            await repo.offer(flower([0, 0], 2));
            await repo.offer(flower([0, 0], 3));
            const result = await repo.record(flower([0, 0], 0.2, { age: 100 }));
            expect(result.recorded).toEqual(['longestLived']);
            expect(result.evicted).toHaveLength(1);
            expect((await holders('0,0')).rows.map(r => r.d).sort()).toEqual([0.2, 0.5, 3]);
        });

        it('may take a species above a small cap when everything in it is protected', async () => {
            const repo = repository({ cap: 1 });
            await repo.offer(flower([0, 0], 1));
            const result = await repo.record(flower([0, 0], 2, { age: 10 }));
            expect(result).toMatchObject({ recorded: ['longestLived'], evicted: [] });
            expect(await inCell('0,0')).toHaveLength(2);
        });

        it('has one holder of each record, however many flowers die at once', async () => {
            const repo = repository();
            await Promise.all(Array.from({ length: 12 }, (_, i) => repo.record(flower([0, 0], 1 + i, { age: 10 + i * 3, toxicity: 0.1 + i * 0.01 }))));
            const h = await holders('0,0');
            expect(h.longestLived).toHaveLength(1);
            expect(h.longestLived[0].age).toBe(10 + 11 * 3);
            expect(h.mostToxic).toHaveLength(1);
            expect(h.mostToxic[0].toxicity).toBeCloseTo(0.21);
            expect(h.rows.filter(r => r.founder)).toHaveLength(1);
        });
    });

    describe('classifying the collection again', () => {
        const old = (cell: Cell, d: number, extra: Partial<SpeciesCandidate> = {}) => ({ ...flower(cell, d, extra), fp: 'old' });
        const idOf = (c: SpeciesCandidate) => genomeId(c.genome);
        const all = () => store.transaction(tx => tx.all());
        const byId = async () => new Map((await all()).map(r => [r.id, r]));
        const match = (x: number, y: number, distance = 1) => ({ x, y, distance });

        it('gives the samples another classifier placed, with their genomes, a few at a time', async () => {
            const repo = repository();
            const [a, b, c] = [old([0, 0], 1), old([1, 0], 1), flower([2, 0], 1)];
            for (const f of [a, b, c]) await repo.offer(f);

            const chunk = await repo.staleChunk('fp1', 10);
            const idA = await idOf(a);
            expect(chunk.map(x => x.id).sort()).toEqual([idA, await idOf(b)].sort());
            expect(chunk.find(x => x.id === idA)!.genome).toBe(a.genome);
            expect(await repo.staleChunk('fp1', 1)).toHaveLength(1);
            expect(await repo.staleChunk('old', 10)).toHaveLength(1);
        });

        it('gives null for a sample whose genome is gone', async () => {
            const repo = repository();
            const a = old([0, 0], 1);
            await repo.offer(a);
            const holey: SpeciesStore = { transaction: fn => store.transaction(tx => fn({ ...tx, genome: async () => undefined })) };
            expect(await new SpeciesRepository(holey).staleChunk('new', 10)).toEqual([{ id: await idOf(a), genome: null }]);
        });

        it('moves a sample to the species the new classifier says, with its distance and fingerprint', async () => {
            const repo = repository();
            const a = old([0, 0], 1);
            await repo.offer(a);
            expect(await repo.migrate('new', [{ id: await idOf(a), match: match(7, 3, 0.25) }])).toBe(true);
            expect((await byId()).get(await idOf(a))).toMatchObject({ cell: '7,3', x: 7, y: 3, d: 0.25, fp: 'new', founder: true });
        });

        it('makes a sample the classifier cannot place unclassified, without founder or records', async () => {
            const repo = repository();
            const a = old([0, 0], 1, { age: 10 });
            await repo.record(a);
            await repo.migrate('new', [{ id: await idOf(a), match: null }]);
            expect((await byId()).get(await idOf(a))).toMatchObject({
                cell: 'none',
                x: null,
                y: null,
                d: null,
                kind: 'unclassified',
                founder: false,
                records: [],
                fp: 'new',
            });
        });

        it('never leaves a sample without a species holding a record, not even before the run ends', async () => {
            const repo = repository();
            const [a, b] = [old([0, 0], 1, { age: 10 }), old([1, 0], 1)];
            await repo.record(a);
            await repo.offer(b);
            expect(await repo.migrate('new', [{ id: await idOf(a), match: null }])).toBe(false);
            expect((await byId()).get(await idOf(a))).toMatchObject({ cell: 'none', founder: false, records: [] });
        });

        it('gives a species to a sample that had none', async () => {
            const repo = repository();
            const lost = old(null, 0);
            await repo.offer(lost);
            await repo.migrate('new', [{ id: await idOf(lost), match: match(4, 4) }]);
            expect((await byId()).get(await idOf(lost))).toMatchObject({ cell: '4,4', kind: 'sample', founder: true, fp: 'new' });
        });

        it('removes a sample whose genome is gone', async () => {
            const repo = repository();
            const a = old([0, 0], 1);
            await repo.offer(a);
            await repo.migrate('new', [{ id: await idOf(a), match: 'gone' }]);
            expect(await all()).toEqual([]);
        });

        it('leaves alone what the new classifier already placed', async () => {
            const repo = repository();
            const mine = flower([0, 0], 1);
            const stale = old([1, 0], 1);
            await repo.offer(mine);
            await repo.offer(stale);
            const before = (await byId()).get(await idOf(mine));
            await repo.migrate('fp1', [{ id: await idOf(stale), match: match(1, 0) }]);
            expect((await byId()).get(await idOf(mine))).toEqual(before);
        });

        it('says it is not the last while samples are left, and decides nothing until then', async () => {
            const repo = repository();
            const [a, b] = [old([0, 0], 1), old([1, 0], 1)];
            await repo.offer(a);
            await repo.offer(b);
            // both will land in one species, but only one has been moved: the founders stay as they were
            expect(await repo.migrate('new', [{ id: await idOf(a), match: match(5, 5) }])).toBe(false);
            expect([...(await byId()).values()].filter(r => r.founder)).toHaveLength(2);

            expect(await repo.migrate('new', [{ id: await idOf(b), match: match(5, 5) }])).toBe(true);
            expect([...(await byId()).values()].filter(r => r.founder)).toHaveLength(1);
        });

        it('decides nothing again when nothing was classified again', async () => {
            const repo = repository();
            await repo.offer(flower([0, 0], 1));
            await repo.offer(flower([0, 0], 2));
            await store.transaction(async tx => {
                const [first] = await tx.inCell('0,0');
                await tx.update({ ...first, founder: true });
                const second = (await tx.inCell('0,0')).find(r => r.id !== first.id)!;
                await tx.update({ ...second, founder: true });
            });
            const before = await all();
            expect(await repo.migrate('fp1', [])).toBe(true);
            expect(await all()).toEqual(before);
        });

        it('makes the founder, the records and the cap right when species that were two became one', async () => {
            const repo = repository({ cap: 3 });
            const a = old([0, 0], 0.5, { age: 40, toxicity: 0.9, tick: 1 });
            const b = old([1, 0], 0.6, { age: 80, toxicity: 0.2 });
            const c = old([2, 0], 4);
            const d = old([2, 0], 5);
            const e = old([2, 0], 6);
            await repo.record(a);
            await repo.record(b);
            for (const f of [c, d, e]) await repo.offer(f);

            const ids = await Promise.all([a, b, c, d, e].map(idOf));
            await repo.migrate(
                'new',
                ids.map(id => ({ id, match: match(9, 9, 1) }))
            );

            const rows = [...(await byId()).values()];
            expect(rows.every(r => r.cell === '9,9' && r.fp === 'new')).toBe(true);
            expect(rows.filter(r => r.founder)).toHaveLength(1);
            const holder = (category: string) => rows.filter(r => r.records.includes(category as never)).map(r => r.id);
            expect(holder('longestLived')).toEqual([ids[1]]);
            expect(holder('mostToxic')).toEqual([ids[0]]);
            expect(rows.filter(r => r.kind === 'sample').length).toBeLessThanOrEqual(3);
            expect(rows.some(r => r.id === ids[0]) && rows.some(r => r.id === ids[1])).toBe(true);
        });

        it('carries on after an interruption and ends where one run would have', async () => {
            const make = async () => {
                store = await makeStore();
                clock = 0;
                const repo = repository({ cap: 4 });
                counter = 1000; // the same genomes, so the same ids, in both runs
                const flowers = [old([0, 0], 1, { age: 10 }), old([1, 0], 2, { age: 30 }), old([2, 0], 3), old([3, 0], 4), old([4, 0], 5)];
                for (const f of flowers) await repo.record(f).then(() => repo.offer(f));
                const ids = await Promise.all(flowers.map(idOf));
                return { repo, results: ids.map(id => ({ id, match: match(8, 8, 1) })) };
            };
            const settle = async () => (await all()).map(r => ({ ...r })).sort((a, b) => (a.id < b.id ? -1 : 1));

            const once = await make();
            await once.repo.migrate('new', once.results);
            const expected = await settle();

            const first = await make();
            expect(await first.repo.migrate('new', first.results.slice(0, 2))).toBe(false);
            const restarted = repository({ cap: 4 });
            const left = await restarted.staleChunk('new', 10);
            expect(left).toHaveLength(3);
            expect(
                await restarted.migrate(
                    'new',
                    first.results.filter(r => left.some(l => l.id === r.id))
                )
            ).toBe(true);
            expect(await settle()).toEqual(expected);
        });
    });

    describe('changing the limits', () => {
        it('applies the new cap to what is offered from then on', async () => {
            const repo = repository({ cap: 3 });
            repo.setLimits({ cap: 1 });
            expect(repo.limits.cap).toBe(1);
            await repo.offer(flower([0, 0], 1));
            expect(await repo.offer(flower([0, 0], 9))).toEqual({ stored: false, reason: 'full' });
        });

        it('changes only what it is given, and validates the result', () => {
            const repo = repository();
            repo.setLimits({ cap: 10 });
            expect(repo.limits).toEqual({ ...DEFAULT_SPECIES_LIMITS, cap: 10 });
            expect(() => repo.setLimits({ cap: 0 })).toThrow(RangeError);
            expect(() => repo.setLimits({ cap: 101 })).toThrow(RangeError);
            expect(repo.limits.cap).toBe(10);
        });

        it('does not touch what is stored', async () => {
            const repo = repository({ cap: 5 });
            for (let d = 1; d <= 5; d++) await repo.offer(flower([0, 0], d));
            repo.setLimits({ cap: 2 });
            expect(await sampleRows('0,0')).toHaveLength(5);
        });
    });

    describe('trim', () => {
        it('lets go the most typical samples of a species that has more than the cap', async () => {
            const repo = repository({ cap: 5 });
            await repo.offer(flower([0, 0], 0.1));
            for (const d of [4, 2, 5, 3]) await repo.offer(flower([0, 0], d));
            repo.setLimits({ cap: 3 });

            const removed = await repo.trim();
            expect(removed).toHaveLength(2);
            expect((await sampleRows('0,0')).map(s => s.d).sort()).toEqual([0.1, 4, 5]);
        });

        it('never lets go a founder or a holder of a record, so a species may stay above a small cap', async () => {
            const repo = repository({ cap: 5 });
            await repo.offer(flower([0, 0], 0.1));
            await repo.record(flower([0, 0], 0.2, { age: 50 }));
            await repo.offer(flower([0, 0], 3));
            repo.setLimits({ cap: 1 });

            await repo.trim();
            const rows = await sampleRows('0,0');
            expect(rows.map(s => s.d).sort()).toEqual([0.1, 0.2]);
            expect(rows.every(s => s.founder || s.records.length > 0)).toBe(true);
        });

        it('judges each species by itself, and leaves the atypical and the unclassified samples alone', async () => {
            const repo = repository({ cap: 4 });
            await fillBaseline(repo);
            for (const d of [1, 2, 3, 4]) await repo.offer(flower([0, 0], d));
            await repo.offer(flower([1, 0], 1));
            await repo.offer(flower([0, 0], 50));
            await repo.offer(flower(null));
            const atypical = (await ofKind('atypical')).length;
            repo.setLimits({ cap: 1 });

            await repo.trim();
            expect(await sampleRows('0,0')).toHaveLength(1);
            expect(await sampleRows('1,0')).toHaveLength(1);
            expect((await ofKind('atypical')).length).toBe(atypical);
            expect(await inCell('none')).toHaveLength(1);
        });

        it('has nothing to do when no species is over the cap', async () => {
            const repo = repository({ cap: 5 });
            await repo.offer(flower([0, 0], 1));
            await repo.offer(flower([0, 0], 2));
            expect(await repo.trim()).toEqual([]);
            expect(await sampleRows('0,0')).toHaveLength(2);
        });
    });

    describe('the limits', () => {
        it('default to 50 per species, 500 atypical, 200 unclassified', () => {
            expect(DEFAULT_SPECIES_LIMITS).toEqual({ cap: 50, atypicalCap: 500, unclassifiedCap: 200 });
            expect(repository().limits).toEqual(DEFAULT_SPECIES_LIMITS);
        });

        it('accept up to 100 per species and nothing outside 1 to 100', () => {
            expect(() => repository({ cap: SPECIES_CAP_MAX })).not.toThrow();
            expect(() => repository({ cap: 1 })).not.toThrow();
            for (const cap of [0, -1, 101, 2.5, NaN]) expect(() => repository({ cap })).toThrow(RangeError);
        });

        it('need whole caps of at least 1 for the other kinds too', () => {
            expect(() => repository({ atypicalCap: 0 })).toThrow(RangeError);
            expect(() => repository({ unclassifiedCap: 1.5 })).toThrow(RangeError);
        });
    });
});
