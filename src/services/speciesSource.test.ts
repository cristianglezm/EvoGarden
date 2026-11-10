// @vitest-environment node
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { FEService } from '@cristianglezm/flower-evolver-wasm';
import { db } from './db';
import { createSpeciesSource, type SpeciesSource } from './speciesSource';
import { createSpeciesClassifier } from './speciesClassifier';
import { createDexieSpeciesStore } from './speciesStore';
import { SpeciesRepository } from '../lib/speciesRepository';
import { genomeId, speciesName } from '../lib/species';
import { DEFAULT_SPECIES_LIMITS } from '../lib/speciesRepository';
import type { SeedBankEntry, SpeciesClassifier } from '../types';

// The real classifier and a real IndexedDB: what the field guide reads is what the flower worker wrote.
const service = new FEService();
let classifier: SpeciesClassifier;
let source: SpeciesSource;
let repository: SpeciesRepository;

beforeAll(async () => {
    await service.init();
    classifier = createSpeciesClassifier(service);
});

beforeEach(async () => {
    await Promise.all([db.speciesSamples.clear(), db.speciesGenomes.clear(), db.speciesMeta.clear()]);
    source = createSpeciesSource(db, () => classifier);
    repository = new SpeciesRepository(createDexieSpeciesStore(db));
});

const offer = (genome: string, x: number, y: number, extra: object = {}) =>
    repository.offer({ genome, match: { x, y, distance: 1 }, fp: classifier.fingerprint, sex: 'both', ...extra });

describe('the species source', () => {
    it('gives the grid of the classifier in use, with its fingerprint and its prototypes', () => {
        const grid = source.grid();
        expect([grid.w, grid.h, grid.dim, grid.n]).toEqual([12, 8, 267, 16]);
        expect(grid.fp).toBe(classifier.fingerprint);
        expect(source.grid()).toBe(grid);
    });

    it('reads the grid again when the classifier is another one', () => {
        let current = classifier;
        const changing = createSpeciesSource(db, () => current);
        const first = changing.grid();
        current = { ...classifier, fingerprint: 'another' };
        expect(changing.grid().fp).toBe('another');
        expect(changing.grid()).not.toBe(first);
    });

    it('reads the samples of the collection', async () => {
        await offer('g1', 1, 1);
        await offer('g2', 2, 2);
        expect((await source.samples()).map(s => s.cell).sort()).toEqual(['1,1', '2,2']);
    });

    it('gives the images of the samples that have one, without their genomes', async () => {
        await offer('g1', 1, 1, { image: 'png-1' });
        await offer('g2', 1, 1, { image: 'png-2' });
        const ids = [await genomeId('g1'), await genomeId('g2'), 'nobody'];
        expect(await source.images(ids)).toEqual({ [ids[0]]: 'png-1' });
        expect(await source.images([])).toEqual({});
    });

    it('gives the genome of a sample', async () => {
        await offer('g1', 1, 1, { image: 'png-1' });
        expect(await source.genome(await genomeId('g1'))).toEqual({ id: await genomeId('g1'), genome: 'g1', image: 'png-1' });
        expect(await source.genome('nobody')).toBeUndefined();
    });

    it('tells which sample is the champion of each category', async () => {
        const champions = [
            { category: 'longestLived', genome: 'ga', value: 1, imageData: '', sex: 'both' },
            { category: 'mostToxic', genome: 'gb', value: 1, imageData: '', sex: 'both' },
        ] as SeedBankEntry[];
        expect(await source.championIds(champions)).toEqual({ longestLived: await genomeId('ga'), mostToxic: await genomeId('gb') });
        expect(await source.championIds([])).toEqual({});
    });

    it('tells the species a genome is stored under, by name', async () => {
        await offer('g1', 3, 5);
        expect(await source.speciesOf('g1')).toEqual({ key: '3,5', name: speciesName(3, 5, 12) });
    });

    it('does not know a genome that is not stored, has no species, or was placed by another classifier', async () => {
        await offer('lost', 0, 0);
        await db.speciesSamples.update(await genomeId('lost'), { cell: 'none', x: null, y: null, d: null });
        await repository.offer({ genome: 'old', match: { x: 1, y: 1, distance: 1 }, fp: 'before', sex: 'both' });
        expect(await source.speciesOf('never offered')).toBeNull();
        expect(await source.speciesOf('lost')).toBeNull();
        expect(await source.speciesOf('old')).toBeNull();
    });
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe('the species of a flower, stored or not', () => {
    it('is the stored species when the genome is in the collection, without classifying it again', async () => {
        await offer('g1', 3, 5);
        const classify = vi.spyOn(classifier, 'classify');
        expect(await source.speciesFor('g1')).toEqual({ key: '3,5', name: speciesName(3, 5, 12), stored: true });
        expect(classify).not.toHaveBeenCalled();
    });

    it('is classified now when the genome is not in the collection, and says it is not stored', async () => {
        vi.spyOn(classifier, 'classify').mockResolvedValue({ x: 4, y: 2, distance: 1 });
        expect(await source.speciesFor('nobody kept this')).toEqual({ key: '4,2', name: speciesName(4, 2, 12), stored: false });
    });

    it('is classified now when the stored species is of another classifier, and when it was stored without one', async () => {
        await repository.offer({ genome: 'old', match: { x: 1, y: 1, distance: 1 }, fp: 'before', sex: 'both' });
        await offer('lost', 0, 0);
        await db.speciesSamples.update(await genomeId('lost'), { cell: 'none', x: null, y: null, d: null });
        vi.spyOn(classifier, 'classify').mockResolvedValue({ x: 7, y: 7, distance: 2 });
        expect(await source.speciesFor('old')).toEqual({ key: '7,7', name: speciesName(7, 7, 12), stored: false });
        expect(await source.speciesFor('lost')).toEqual({ key: '7,7', name: speciesName(7, 7, 12), stored: false });
    });

    it('gives a real flower a species of the map, whose name is the one of its cell', async () => {
        const { genome } = await service.makeFlower();
        const species = await source.speciesFor(genome);
        const [x, y] = species!.key.split(',').map(Number);
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThan(12);
        expect(y).toBeLessThan(8);
        expect(species).toMatchObject({ name: speciesName(x, y, 12), stored: false });
    });

    it('does not write what it classified: the collection is the flower worker\'s', async () => {
        vi.spyOn(classifier, 'classify').mockResolvedValue({ x: 4, y: 2, distance: 1 });
        await source.speciesFor('nobody kept this');
        expect(await db.speciesSamples.count()).toBe(0);
    });

    it('is nothing for a flower that has no species', async () => {
        expect(await source.speciesFor('{"Flower":{}}')).toBeNull();
    });

    it('is nothing while the classifier is not ready, or when classifying fails, and never throws', async () => {
        const notReady = createSpeciesSource(db, () => { throw new Error('not initialised'); });
        expect(await notReady.speciesFor('g')).toBeNull();
        vi.spyOn(classifier, 'classify').mockRejectedValue(new Error('boom'));
        expect(await source.speciesFor('g')).toBeNull();
    });
});

describe('the species source, for collecting', () => {
    it('gives the genomes of samples, and none for an id it does not have', async () => {
        await offer('g1', 1, 1);
        const id = await genomeId('g1');
        expect(await source.genomes([id, 'nobody'])).toEqual({ [id]: 'g1' });
        expect(await source.genomes([])).toEqual({});
    });

    it('says the version of fe-wasm the classifier comes from', () => {
        expect(source.version()).toBe(service.getVersion());
        expect(source.version()).toMatch(/^\d+\.\d+\.\d+/);
    });

    it('has the default limits until the player chooses', async () => {
        expect(await source.limits()).toEqual(DEFAULT_SPECIES_LIMITS);
    });

    it('chooses the cap, which is kept for the flower worker to read, and keeps what else was chosen', async () => {
        await db.speciesMeta.put({ key: 'limits', value: { unclassifiedCap: 20 } });
        await source.setCap(25);
        expect(await source.limits()).toEqual({ ...DEFAULT_SPECIES_LIMITS, cap: 25, unclassifiedCap: 20 });
        expect(await db.speciesMeta.get('limits')).toEqual({ key: 'limits', value: { unclassifiedCap: 20, cap: 25 } });
    });

    it.each([0, -3, 101, 2.5, NaN])('does not choose %s as the cap, and writes nothing', async cap => {
        await expect(source.setCap(cap)).rejects.toThrow(RangeError);
        expect(await db.speciesMeta.count()).toBe(0);
    });

    it('falls back to the defaults when what is stored is not valid', async () => {
        await db.speciesMeta.put({ key: 'limits', value: { cap: 500 } });
        expect(await source.limits()).toEqual(DEFAULT_SPECIES_LIMITS);
    });

    it('clears the collection, the samples and their genomes, and keeps the cap the player chose', async () => {
        await offer('genome-a', 3, 2, { image: 'png' });
        await offer('genome-b', 4, 4);
        await source.setCap(100);
        await source.clear();
        expect(await db.speciesSamples.count()).toBe(0);
        expect(await db.speciesGenomes.count()).toBe(0);
        expect((await source.limits()).cap).toBe(100);
        expect(await source.samples()).toEqual([]);
    });

    it('does not touch the seed bank when it clears the collection', async () => {
        await db.seedBank.put({ category: 'longestLived', genome: 'g', value: 3, imageData: 'png', sex: 'both' } as SeedBankEntry);
        await offer('genome-a', 3, 2);
        await source.clear();
        expect(await db.seedBank.count()).toBe(1);
    });

    it('can be cleared when it is already empty, and filled again after', async () => {
        await source.clear();
        await offer('genome-a', 3, 2);
        expect(await db.speciesSamples.count()).toBe(1);
        expect(await db.speciesGenomes.count()).toBe(1);
    });

    it('says what the site stores and what the browser lets it, when the browser says', async () => {
        vi.stubGlobal('navigator', { storage: { estimate: async () => ({ usage: 1234, quota: 99999 }) } });
        expect(await createSpeciesSource(db, () => classifier).storage()).toEqual({ usage: 1234, quota: 99999 });
    });

    it('says nothing when the browser cannot say it', async () => {
        vi.stubGlobal('navigator', {});
        expect(await createSpeciesSource(db, () => classifier).storage()).toBeNull();
        vi.stubGlobal('navigator', { storage: { estimate: async () => ({}) } });
        expect(await createSpeciesSource(db, () => classifier).storage()).toBeNull();
    });

    it('uses the way to know the storage it is given', async () => {
        expect(await createSpeciesSource(db, () => classifier, async () => ({ usage: 1, quota: 2 })).storage()).toEqual({ usage: 1, quota: 2 });
    });
});
