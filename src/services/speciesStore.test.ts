// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest';
import { speciesStoreFactories } from '../test/speciesStores';
import type { SpeciesSample, SpeciesStore } from '../types';

const sample = (id: string, overrides: Partial<SpeciesSample> = {}): SpeciesSample => ({
    id, cell: '3,5', x: 3, y: 5, d: 1, fp: 'fp1', kind: 'sample', founder: false, records: [], sex: 'both', createdAt: 1, ...overrides,
});

// The policy is tested on the memory store as well as on Dexie, so the memory one has to be
// shown to behave like the real one: same assertions on both.
describe.each(speciesStoreFactories)('the %s species store', (_name, makeStore) => {
    let store: SpeciesStore;
    beforeEach(async () => {
        store = await makeStore();
    });

    it('keeps a sample and its genome, and the image only when there is one', async () => {
        await store.transaction(async tx => {
            await tx.put(sample('a'), 'genome-a', 'image-a');
            await tx.put(sample('b'), 'genome-b');
        });
        await store.transaction(async tx => {
            expect(await tx.get('a')).toEqual(sample('a'));
            expect(await tx.genome('a')).toEqual({ id: 'a', genome: 'genome-a', image: 'image-a' });
            expect(await tx.genome('b')).toEqual({ id: 'b', genome: 'genome-b' });
            expect(await tx.get('nope')).toBeUndefined();
            expect(await tx.genome('nope')).toBeUndefined();
        });
    });

    it('updates the row of a sample and leaves its genome and image alone', async () => {
        await store.transaction(async tx => tx.put(sample('a', { age: 10 }), 'genome-a', 'image-a'));
        await store.transaction(async tx => tx.update(sample('a', { age: 99, records: ['longestLived'] })));
        await store.transaction(async tx => {
            expect(await tx.get('a')).toEqual(sample('a', { age: 99, records: ['longestLived'] }));
            expect(await tx.genome('a')).toEqual({ id: 'a', genome: 'genome-a', image: 'image-a' });
        });
    });

    it('finds the samples another classifier made, a few at a time', async () => {
        await store.transaction(async tx => {
            for (const id of ['a', 'b', 'c']) await tx.put(sample(id, { fp: 'old' }), 'g');
            await tx.put(sample('d', { fp: 'new' }), 'g');
            await tx.put(sample('e', { fp: 'other', cell: 'none', x: null, y: null, d: null, kind: 'unclassified' }), 'g');
        });
        await store.transaction(async tx => {
            expect((await tx.stale('new', 100)).map(s => s.id).sort()).toEqual(['a', 'b', 'c', 'e']);
            expect(await tx.stale('new', 2)).toHaveLength(2);
            expect(await tx.stale('old', 100)).toHaveLength(2);
            expect((await tx.stale('nobody', 100))).toHaveLength(5);
        });
    });

    it('gives every sample, without the genomes', async () => {
        await store.transaction(async tx => {
            await tx.put(sample('a'), 'g');
            await tx.put(sample('b', { cell: 'none', x: null, y: null, d: null, kind: 'unclassified' }), 'g');
        });
        await store.transaction(async tx => {
            const all = await tx.all();
            expect(all.map(s => s.id).sort()).toEqual(['a', 'b']);
            expect(all[0]).not.toHaveProperty('genome');
        });
    });

    it('finds samples by cell and by kind', async () => {
        await store.transaction(async tx => {
            await tx.put(sample('a'), 'g');
            await tx.put(sample('b', { cell: '0,0', x: 0, y: 0 }), 'g');
            await tx.put(sample('c', { kind: 'atypical' }), 'g');
        });
        await store.transaction(async tx => {
            expect((await tx.inCell('3,5')).map(s => s.id).sort()).toEqual(['a', 'c']);
            expect((await tx.ofKind('atypical')).map(s => s.id)).toEqual(['c']);
            expect(await tx.inCell('9,9')).toEqual([]);
        });
    });

    it('stores an unclassified sample under the cell "none" and leaves it out of the distances', async () => {
        await store.transaction(async tx => {
            await tx.put(sample('u', { cell: 'none', x: null, y: null, d: null, kind: 'unclassified' }), 'g');
            await tx.put(sample('a', { d: 2.5 }), 'g');
            await tx.put(sample('b', { d: 0.5 }), 'g');
        });
        await store.transaction(async tx => {
            expect((await tx.inCell('none')).map(s => s.id)).toEqual(['u']);
            expect(await tx.distances()).toEqual([0.5, 2.5]);
        });
    });

    it('removes samples with their genomes, and ignores ids it does not have', async () => {
        await store.transaction(async tx => {
            await tx.put(sample('a'), 'g');
            await tx.put(sample('b'), 'g');
        });
        await store.transaction(async tx => tx.remove(['a', 'ghost']));
        await store.transaction(async tx => {
            expect(await tx.get('a')).toBeUndefined();
            expect(await tx.genome('a')).toBeUndefined();
            expect(await tx.get('b')).toBeDefined();
        });
    });

    it('gives back what the function returns', async () => {
        await expect(store.transaction(async () => 42)).resolves.toBe(42);
    });

    it('keeps nothing of a transaction that throws', async () => {
        await store.transaction(async tx => tx.put(sample('kept'), 'g'));
        await expect(store.transaction(async tx => {
            await tx.put(sample('lost'), 'g');
            await tx.remove(['kept']);
            throw new Error('boom');
        })).rejects.toThrow('boom');
        await store.transaction(async tx => {
            expect(await tx.get('lost')).toBeUndefined();
            expect(await tx.get('kept')).toBeDefined();
            expect(await tx.genome('kept')).toBeDefined();
        });
    });

    it('does not lose an update when two transactions read before they write', async () => {
        await store.transaction(async tx => tx.put(sample('counter', { age: 0 }), 'g'));
        await Promise.all(Array.from({ length: 20 }, () => store.transaction(async tx => {
            const current = (await tx.get('counter'))!;
            await tx.put({ ...current, age: current.age! + 1 }, 'g');
        })));
        await store.transaction(async tx => expect((await tx.get('counter'))!.age).toBe(20));
    });
});
