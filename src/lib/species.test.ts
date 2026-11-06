// @vitest-environment node
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { FEService } from '@cristianglezm/flower-evolver-wasm';
import {
    SPECIES_ENVIRONMENT, MIN_FLOWERS_FOR_ATYPICAL, NO_CELL,
    speciesName, cellKey, fingerprint, sha256Hex, genomeId,
    atypicalStats, parseSom, prototypeOf, toGenerationEntry, toGenerationJson,
} from './species';

// The real library, not a fake: a mock would keep passing when the wire format or the
// classifier layout changed, which is exactly what these helpers depend on.
const service = new FEService();
let genomes: string[] = [];
let embeddedSom = '';

beforeAll(async () => {
    await service.init();
    embeddedSom = service.getTrainedSOM();
    for (let i = 0; i < 3; i++) genomes.push((await service.makeFlower()).genome);
}, 60_000);

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('speciesName', () => {
    it('gives every cell of the embedded 12x8 map its own name', () => {
        const som = parseSom(embeddedSom);
        const names = new Set<string>();
        for (let y = 0; y < som.h; y++) for (let x = 0; x < som.w; x++) names.add(speciesName(x, y, som.w));
        expect(names.size).toBe(som.w * som.h);
    });

    it('keeps names unique on grids wider and taller than the word lists', () => {
        const names = new Set<string>();
        for (let y = 0; y < 30; y++) for (let x = 0; x < 30; x++) names.add(speciesName(x, y, 30));
        expect(names.size).toBe(900);
    });

    it('is stable', () => {
        expect(speciesName(0, 0, 12)).toBe('Slender Aster');
        expect(speciesName(3, 2, 12)).toBe('Stout Lotus');
    });
});

describe('cellKey', () => {
    it('is x,y for a match and "none" for a flower that could not be classified', () => {
        expect(cellKey({ x: 3, y: 5 })).toBe('3,5');
        expect(cellKey(null)).toBe(NO_CELL);
    });
});

describe('fingerprint', () => {
    it('is stable and tells two classifiers apart', () => {
        expect(fingerprint(embeddedSom)).toBe(fingerprint(embeddedSom));
        expect(fingerprint(embeddedSom)).not.toBe(fingerprint(embeddedSom + ' '));
    });
});

describe('genomeId', () => {
    it('sha256Hex matches the standard test vectors', () => {
        expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
        expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
        expect(sha256Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'))
            .toBe('248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1');
    });

    it('gives the same id with and without crypto.subtle', async () => {
        const inputs = [genomes[0], 'é€𝄞 multi-byte', 'x'.repeat(55), 'x'.repeat(56), 'x'.repeat(64)];
        const withSubtle = await Promise.all(inputs.map(genomeId));
        vi.stubGlobal('crypto', {});
        const without = await Promise.all(inputs.map(genomeId));
        expect(without).toEqual(withSubtle);
        withSubtle.forEach(id => expect(id).toMatch(/^[0-9a-f]{16}$/));
    });

    it('tells two genomes apart and repeats for the same one', async () => {
        expect(await genomeId(genomes[0])).toBe(await genomeId(genomes[0]));
        expect(await genomeId(genomes[0])).not.toBe(await genomeId(genomes[1]));
    });
});

describe('atypicalStats', () => {
    it('says nothing about fewer flowers than it needs', () => {
        expect(atypicalStats(Array(MIN_FLOWERS_FOR_ATYPICAL - 1).fill(1))).toBeNull();
    });

    it('is the mean plus two standard deviations', () => {
        const distances = [...Array(10).fill(1), ...Array(10).fill(3)];
        const stats = atypicalStats(distances)!;
        expect(stats.n).toBe(20);
        expect(stats.mean).toBe(2);
        expect(stats.std).toBe(1);
        expect(stats.above).toBe(4);
    });
});

describe('the embedded classifier', () => {
    it('parses to the layout the guide draws: 12x8 nodes of 267 values, 16x16 silhouette', () => {
        const som = parseSom(embeddedSom);
        expect([som.w, som.h, som.dim, som.n]).toEqual([12, 8, 267, 16]);
        expect(som.weights).toHaveLength(12 * 8 * 267);
    });

    it('has a silhouette of alphas in [0, 1] for every cell', () => {
        const som = parseSom(embeddedSom);
        for (let y = 0; y < som.h; y++) {
            for (let x = 0; x < som.w; x++) {
                const silhouette = prototypeOf(som, x, y);
                expect(silhouette).toHaveLength(256);
                expect(Math.min(...silhouette)).toBeGreaterThanOrEqual(0);
                expect(Math.max(...silhouette)).toBeLessThanOrEqual(1);
            }
        }
    });

    it('refuses a layout that does not add up', () => {
        const broken = JSON.parse(embeddedSom);
        broken.som.weights = broken.som.weights.slice(1);
        expect(() => parseSom(JSON.stringify(broken))).toThrow('unexpected classifier layout');
    });
});

describe('the Generation wire format', () => {
    it('an entry is the inner Flower object of the genome', () => {
        const entry = toGenerationEntry(genomes[0]);
        expect(entry).toEqual(JSON.parse(genomes[0]).Flower);
        expect(entry).not.toHaveProperty('Flower');
    });

    it('rejects text that is not a flower genome', () => {
        expect(() => toGenerationEntry('{}')).toThrow('not a flower genome');
        expect(() => toGenerationEntry('{"Flower": 3}')).toThrow('not a flower genome');
        expect(() => toGenerationEntry('nope')).toThrow();
    });

    it('is accepted by the library: every flower of the batch gets a species', async () => {
        const matches = await service.classifyBatch(toGenerationJson(genomes), SPECIES_ENVIRONMENT);
        expect(matches).toHaveLength(genomes.length);
        matches.forEach(match => {
            expect(match).not.toBeNull();
            expect(match!.x).toBeGreaterThanOrEqual(0);
            expect(match!.x).toBeLessThan(12);
            expect(match!.y).toBeGreaterThanOrEqual(0);
            expect(match!.y).toBeLessThan(8);
            expect(match!.distance).toBeGreaterThanOrEqual(0);
        });
    }, 60_000);

    it('a flower that cannot be used is a null match, never an error, so results line up', async () => {
        const batch = `{"Generation":[${JSON.stringify(toGenerationEntry(genomes[0]))},{}]}`;
        const matches = await service.classifyBatch(batch, SPECIES_ENVIRONMENT);
        expect(matches).toHaveLength(2);
        expect(matches[0]).not.toBeNull();
        expect(matches[1]).toBeNull();
    }, 60_000);
});
