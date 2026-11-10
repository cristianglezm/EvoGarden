// @vitest-environment node
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { describe, it, expect, beforeEach, vi } from 'vitest';

const NAME = 'EvoGardenDatabase';
const V3 = { savedFlowers: 'id', seedBank: 'category', savedInsects: 'id' };
const V4 = { ...V3, speciesSamples: 'id, cell, fp, kind, d', speciesGenomes: 'id' };

// db.ts opens the database when it is imported, so an old one is made before that, and the
// module is imported again for each test.
async function openLatest() {
    vi.resetModules();
    const { db } = await import('./db');
    await db.open();
    return db;
}

beforeEach(async () => {
    await Dexie.delete(NAME);
});

describe('the database', () => {
    it('keeps what a version 3 database holds when it opens as the latest', async () => {
        const old = new Dexie(NAME);
        old.version(3).stores(V3);
        await old.table('seedBank').put({ category: 'longestLived', genome: 'g', value: 5, imageData: 'i', sex: 'both' });
        await old.table('savedFlowers').put({ id: 'f1' });
        await old.table('savedInsects').put({ id: 'i1' });
        old.close();

        const db = await openLatest();
        expect(db.verno).toBe(5);
        expect(await db.seedBank.get('longestLived')).toMatchObject({ value: 5 });
        expect(await db.savedFlowers.get('f1')).toBeDefined();
        expect(await db.savedInsects.get('i1')).toBeDefined();
        expect(await db.speciesSamples.count()).toBe(0);
        expect(await db.speciesGenomes.count()).toBe(0);
        expect(await db.speciesMeta.count()).toBe(0);
        db.close();
    });

    it('keeps the species collection of a version 4 database, and gives it a place for its settings', async () => {
        const old = new Dexie(NAME);
        old.version(4).stores(V4);
        await old
            .table('speciesSamples')
            .put({ id: 's1', cell: '3,2', x: 3, y: 2, d: 1, fp: 'f', kind: 'sample', founder: true, records: [], sex: 'both', createdAt: 1 });
        await old.table('speciesGenomes').put({ id: 's1', genome: 'g', image: 'png' });
        await old.table('seedBank').put({ category: 'mostToxic', genome: 'g', value: 0.5, imageData: 'i', sex: 'male' });
        old.close();

        const db = await openLatest();
        expect(db.verno).toBe(5);
        expect(await db.speciesSamples.get('s1')).toMatchObject({ cell: '3,2', founder: true });
        expect(await db.speciesGenomes.get('s1')).toEqual({ id: 's1', genome: 'g', image: 'png' });
        expect(await db.seedBank.get('mostToxic')).toMatchObject({ value: 0.5 });
        await db.speciesMeta.put({ key: 'limits', value: { cap: 25 } });
        expect(await db.speciesMeta.get('limits')).toEqual({ key: 'limits', value: { cap: 25 } });
        db.close();
    });
});
