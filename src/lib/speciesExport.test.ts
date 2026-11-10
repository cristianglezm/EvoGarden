// @vitest-environment node
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeAll, beforeEach, vi, afterEach } from 'vitest';
import { FEService } from '@cristianglezm/flower-evolver-wasm';
import { db } from '../services/db';
import { createSpeciesClassifier } from '../services/speciesClassifier';
import { createSpeciesSource, type SpeciesSource } from '../services/speciesSource';
import { createDexieSpeciesStore } from '../services/speciesStore';
import { SpeciesRepository } from './speciesRepository';
import { collectSamples, orderForExport } from './speciesExport';
import { SPECIES_ENVIRONMENT, genomeId, speciesName } from './species';
import type { SpeciesClassifier, SpeciesSample } from '../types';

// The real classifier on real flowers, the real collection in IndexedDB, and the real library
// reading what comes out: the point of the file is that the training tools accept it.
const service = new FEService();
let classifier: SpeciesClassifier;
let source: SpeciesSource;
let repository: SpeciesRepository;
let flowers: string[] = [];
const NOW = new Date('2026-11-02T10:30:00Z');
const options = { includeUnclassified: true, appVersion: '9.9.9', now: NOW };

beforeAll(async () => {
    await service.init();
    classifier = createSpeciesClassifier(service);
    for (let i = 0; i < 6; i++) flowers.push((await service.makeFlower()).genome);
}, 60_000);

beforeEach(async () => {
    await Promise.all([db.speciesSamples.clear(), db.speciesGenomes.clear()]);
    source = createSpeciesSource(
        db,
        () => classifier,
        async () => null
    );
    repository = new SpeciesRepository(createDexieSpeciesStore(db));
});

afterEach(() => {
    vi.restoreAllMocks();
});

const keep = async (genome: string, extra: object = {}) =>
    repository.offer({ genome, match: await classifier.classify(genome), fp: classifier.fingerprint, sex: 'both', ...extra });
const text = (parts: string[]) => parts.join('');

describe('collectSamples', () => {
    it('writes {"Generation": [...]} with the flower object of each genome, not the {"Flower": ...} the game keeps', async () => {
        for (const genome of flowers.slice(0, 3)) await keep(genome);
        const { samples } = await collectSamples(source, options);
        const file = JSON.parse(text(samples));

        expect(Object.keys(file)).toEqual(['Generation']);
        expect(file.Generation).toHaveLength(3);
        const inner = new Set(flowers.slice(0, 3).map(g => JSON.stringify(JSON.parse(g).Flower)));
        for (const entry of file.Generation) {
            expect(entry).not.toHaveProperty('Flower');
            expect(inner.has(JSON.stringify(entry))).toBe(true);
        }
    });

    // Classifying is not bit-for-bit reproducible, so a flower near the edge of a species can come out
    // in a neighbour the next time (the map wraps around): the stored species and the library's agree
    // to within one step, not always exactly.
    const near = (a: number, b: number, size: number) => Math.min(Math.abs(a - b), size - Math.abs(a - b)) <= 1;

    it('is accepted by the library the classifier is trained with, which puts each flower in or next to the species stored for it', async () => {
        for (const genome of flowers) await keep(genome);
        const { samples, manifest, counts } = await collectSamples(source, options);

        const matches = await service.classifyBatch(text(samples), SPECIES_ENVIRONMENT);
        expect(matches).toHaveLength(counts.flowers);
        expect(matches.every(m => m !== null)).toBe(true);
        const described = JSON.parse(manifest).flowers as Array<{ cell: string }>;
        matches.forEach((match, i) => {
            const [x, y] = described[i].cell.split(',').map(Number);
            expect(near(match!.x, x, 12) && near(match!.y, y, 8)).toBe(true);
        });
    }, 60_000);

    it('has the manifest in the order of the file, flower by flower', async () => {
        for (const genome of flowers) await keep(genome);
        const { samples, manifest } = await collectSamples(source, options);
        const entries = JSON.parse(text(samples)).Generation as unknown[];
        const described = JSON.parse(manifest).flowers as Array<{ id: string }>;
        expect(entries).toHaveLength(flowers.length);
        for (const [i, entry] of entries.entries()) {
            const stored = await db.speciesGenomes.get(described[i].id);
            expect(JSON.stringify(entry)).toBe(JSON.stringify(JSON.parse(stored!.genome).Flower));
        }
    });

    it('has every flower once, and the manifest lines up with the file', async () => {
        for (const genome of flowers) await keep(genome);
        await keep(flowers[0]); // already there
        const { samples, manifest } = await collectSamples(source, options);
        const described = JSON.parse(manifest).flowers;
        expect(JSON.parse(text(samples)).Generation).toHaveLength(flowers.length);
        expect(new Set(described.map((d: { id: string }) => d.id)).size).toBe(flowers.length);
        expect(described.map((d: { index: number }) => d.index)).toEqual(flowers.map((_, i) => i));
    });

    it('says in the manifest what the collection knew of each flower', async () => {
        await repository.record({
            genome: flowers[0],
            match: { x: 3, y: 2, distance: 0.4 },
            fp: classifier.fingerprint,
            sex: 'female',
            age: 120,
            toxicity: 0.3,
            tick: 777,
        });
        const { manifest } = await collectSamples(source, options);
        expect(JSON.parse(manifest).flowers[0]).toMatchObject({
            index: 0,
            cell: '3,2',
            species: speciesName(3, 2, 12),
            distance: 0.4,
            kind: 'sample',
            sex: 'female',
            age: 120,
            toxicity: 0.3,
            tick: 777,
        });
    });

    it('says in the manifest which classifier, which versions, which environment and how many', async () => {
        await keep(flowers[0]);
        await keep('{"Flower":{}}');
        const { manifest, counts, fileBase } = await collectSamples(source, options);
        const m = JSON.parse(manifest);
        expect(m).toMatchObject({
            generatedAt: '2026-11-02T10:30:00.000Z',
            app: 'EvoGarden',
            appVersion: '9.9.9',
            feWasmVersion: service.getVersion(),
            classifier: { fingerprint: classifier.fingerprint, width: 12, height: 8, inputDim: 267 },
            environment: SPECIES_ENVIRONMENT,
            includesUnclassified: true,
            counts: { flowers: 2, samples: 1, unclassified: 1, species: 1, skipped: 0, stale: 0, atypical: 0 },
        });
        expect(counts).toEqual(m.counts);
        expect(fileBase).toBe('evogarden-samples-2026-11-02');
    });

    it('puts the samples of each species together in the order of the map, then the atypical, then the ones without a species', async () => {
        const at = (genome: string, x: number, y: number, extra: Partial<SpeciesSample> = {}) =>
            repository.offer({ genome, match: { x, y, distance: 1 }, fp: classifier.fingerprint, sex: 'both' }).then(() => extra);
        await at('{"Flower":{"n":1}}', 5, 3);
        await at('{"Flower":{"n":2}}', 0, 0);
        await at('{"Flower":{"n":3}}', 5, 3);
        await at('{"Flower":{"n":4}}', 11, 0);
        await repository.offer({ genome: '{"Flower":{"n":5}}', match: null, fp: classifier.fingerprint, sex: 'both' });
        await db.speciesSamples.put({
            ...(await db.speciesSamples.toArray())[0],
            id: 'atypical-1',
            cell: '1,1',
            x: 1,
            y: 1,
            d: 9,
            kind: 'atypical',
            founder: false,
        });
        await db.speciesGenomes.put({ id: 'atypical-1', genome: '{"Flower":{"n":6}}' });

        const { manifest } = await collectSamples(source, options);
        expect(JSON.parse(manifest).flowers.map((d: { cell: string | null; kind: string }) => `${d.kind}:${d.cell}`)).toEqual([
            'sample:0,0',
            'sample:11,0',
            'sample:5,3',
            'sample:5,3',
            'atypical:1,1',
            'unclassified:null',
        ]);
    });

    it('leaves out the samples without a species when asked', async () => {
        await keep(flowers[0]);
        await keep('{"Flower":{}}');
        const { samples, manifest, counts } = await collectSamples(source, { ...options, includeUnclassified: false });
        expect(JSON.parse(text(samples)).Generation).toHaveLength(1);
        expect(counts).toMatchObject({ flowers: 1, unclassified: 0 });
        expect(JSON.parse(manifest).includesUnclassified).toBe(false);
    });

    it('leaves out what another classifier placed, and counts it', async () => {
        await keep(flowers[0]);
        await repository.offer({ genome: flowers[1], match: { x: 1, y: 1, distance: 1 }, fp: 'before', sex: 'both' });
        const { samples, counts } = await collectSamples(source, options);
        expect(JSON.parse(text(samples)).Generation).toHaveLength(1);
        expect(counts).toMatchObject({ flowers: 1, stale: 1 });
    });

    it('leaves out a sample whose genome is gone or is not a flower, and counts it', async () => {
        await keep(flowers[0]);
        await repository.offer({ genome: 'placeholder-1', match: { x: 1, y: 1, distance: 1 }, fp: classifier.fingerprint, sex: 'both' });
        await repository.offer({ genome: 'placeholder-2', match: { x: 2, y: 2, distance: 1 }, fp: classifier.fingerprint, sex: 'both' });
        // by id: a real flower can be in any species, so the cell of a placeholder says nothing
        const [one, two] = [await genomeId('placeholder-1'), await genomeId('placeholder-2')];
        await db.speciesGenomes.delete(one);
        await db.speciesGenomes.put({ id: two, genome: '{"nothing":true}' });

        const { samples, counts } = await collectSamples(source, options);
        expect(JSON.parse(text(samples)).Generation).toHaveLength(1);
        expect(counts).toMatchObject({ flowers: 1, skipped: 2 });
    });

    it('reads the genomes a hundred at a time, so a big collection is not held in one read', async () => {
        const rows: SpeciesSample[] = Array.from({ length: 250 }, (_, i) => ({
            id: `s${String(i).padStart(3, '0')}`,
            cell: `${i % 12},${Math.floor(i / 12) % 8}`,
            x: i % 12,
            y: Math.floor(i / 12) % 8,
            d: 1,
            fp: classifier.fingerprint,
            kind: 'sample',
            founder: false,
            records: [],
            sex: 'both',
            createdAt: i,
        }));
        await db.speciesSamples.bulkPut(rows);
        await db.speciesGenomes.bulkPut(rows.map(r => ({ id: r.id, genome: `{"Flower":{"n":${r.createdAt}}}` })));
        const genomes = vi.spyOn(source, 'genomes');

        const { samples } = await collectSamples(source, options);
        expect(genomes.mock.calls.map(call => call[0].length)).toEqual([100, 100, 50]);
        expect(JSON.parse(text(samples)).Generation).toHaveLength(250);
    });

    it('is an empty but valid file for an empty collection', async () => {
        const { samples, counts, manifest } = await collectSamples(source, options);
        expect(JSON.parse(text(samples))).toEqual({ Generation: [] });
        expect(counts).toMatchObject({ flowers: 0, species: 0 });
        expect(JSON.parse(manifest).flowers).toEqual([]);
    });
});

describe('orderForExport', () => {
    const row = (id: string, extra: Partial<SpeciesSample>): SpeciesSample => ({
        id,
        cell: '0,0',
        x: 0,
        y: 0,
        d: 1,
        fp: 'f',
        kind: 'sample',
        founder: false,
        records: [],
        sex: 'both',
        createdAt: 1,
        ...extra,
    });

    it('goes by the position in the map, row by row, then by age, then by id', () => {
        const ordered = orderForExport(
            [row('d', { x: 0, y: 1 }), row('c', { x: 2, y: 0, createdAt: 2 }), row('b', { x: 2, y: 0, createdAt: 1 }), row('a', { x: 2, y: 0, createdAt: 1 })],
            12
        );
        expect(ordered.map(r => r.id)).toEqual(['a', 'b', 'c', 'd']);
    });

    it('puts the atypical, the farthest first, after the samples, and the unclassified last', () => {
        const ordered = orderForExport(
            [
                row('lost', { kind: 'unclassified', x: null, y: null, d: null }),
                row('near', { kind: 'atypical', d: 3 }),
                row('far', { kind: 'atypical', d: 8 }),
                row('plain', { x: 9, y: 7 }),
            ],
            12
        );
        expect(ordered.map(r => r.id)).toEqual(['plain', 'far', 'near', 'lost']);
    });

    it('does not change what it is given', () => {
        const rows = [row('b', { x: 5 }), row('a', { x: 1 })];
        orderForExport(rows, 12);
        expect(rows.map(r => r.id)).toEqual(['b', 'a']);
    });
});
