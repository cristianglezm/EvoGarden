// @vitest-environment node
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { FEService } from '@cristianglezm/flower-evolver-wasm';
import { createSpeciesClassifier } from './speciesClassifier';
import { flowerService } from './flowerService';
import { SPECIES_ENVIRONMENT, fingerprint, parseSom } from '../lib/species';
import type { SpeciesMatch } from '../types';

// The real library: the contract worth pinning is what it does with bad input and which
// environment it is given, and a fake would only echo what the wrapper assumes.
const service = new FEService();
const classifier = createSpeciesClassifier(service);
let genomes: string[] = [];

function expectInsideTheMap(match: SpeciesMatch | null) {
    const som = parseSom(classifier.classifierJson());
    expect(match).not.toBeNull();
    expect(match!.x).toBeGreaterThanOrEqual(0);
    expect(match!.x).toBeLessThan(som.w);
    expect(match!.y).toBeGreaterThanOrEqual(0);
    expect(match!.y).toBeLessThan(som.h);
    expect(match!.distance).toBeGreaterThanOrEqual(0);
}

beforeAll(async () => {
    await service.init();
    for (let i = 0; i < 3; i++) genomes.push((await service.makeFlower()).genome);
}, 60_000);

afterEach(() => {
    vi.restoreAllMocks();
});

describe('the classifier in use', () => {
    it('is the one embedded in the wasm module, and its fingerprint is stable', () => {
        expect(classifier.classifierJson()).toBe(service.getTrainedSOM());
        expect(classifier.fingerprint).toBe(fingerprint(service.getTrainedSOM()));
        expect(classifier.fingerprint).toBe(classifier.fingerprint);
    });
});

describe('classify', () => {
    it('places a flower on the map', async () => {
        expectInsideTheMap(await classifier.classify(genomes[0]));
    }, 60_000);

    it('always classifies under the default environment, so a genome keeps its species', async () => {
        const classify = vi.spyOn(service, 'classify');
        await classifier.classify(genomes[0]);
        expect(classify).toHaveBeenCalledWith(genomes[0], SPECIES_ENVIRONMENT);
    }, 60_000);

    it.each([
        ['an object that is not a flower', '{}'],
        ['a flower without genomes', '{"Flower":{}}'],
        ['text that is not JSON', 'nope'],
        ['an empty string', ''],
    ])('gives null for %s instead of throwing', async (_name, genome) => {
        await expect(classifier.classify(genome)).resolves.toBeNull();
    });
});

describe('classifyBatch', () => {
    it('gives one match per genome, in order', async () => {
        const matches = await classifier.classifyBatch(genomes);
        expect(matches).toHaveLength(genomes.length);
        matches.forEach(expectInsideTheMap);
    }, 60_000);

    it('sends the library the always-default environment too', async () => {
        const classifyBatch = vi.spyOn(service, 'classifyBatch');
        await classifier.classifyBatch([genomes[0]]);
        expect(classifyBatch.mock.calls[0][1]).toBe(SPECIES_ENVIRONMENT);
    }, 60_000);

    it('keeps the results lined up with the input when some genomes are unusable', async () => {
        const matches = await classifier.classifyBatch(['nope', genomes[0], '{}', '{"Flower":3}', genomes[1], '']);
        expect(matches).toHaveLength(6);
        expect(matches.map(m => m === null)).toEqual([true, false, true, true, false, true]);
        expectInsideTheMap(matches[1]);
        expectInsideTheMap(matches[4]);
    }, 60_000);

    it('is null for every genome when none is usable, not an error', async () => {
        await expect(classifier.classifyBatch(['nope', '{}'])).resolves.toEqual([null, null]);
    });

    it('is empty for no genomes', async () => {
        await expect(classifier.classifyBatch([])).resolves.toEqual([]);
    });

    it('gives the same flower the same species twice in a batch, or a neighbour of it', async () => {
        const [first, second] = await classifier.classifyBatch([genomes[0], genomes[0]]);
        expectInsideTheMap(first);
        expectInsideTheMap(second);
        // The library does not promise the same cell: a flower on the edge between two lands on either (about one in
        // a hundred flowers did, in the cell next to it, the map wrapping around). A flower in the other end of the
        // map would be a mistake of the batch, not of the classifier.
        const som = parseSom(classifier.classifierJson());
        const apart = (a: number, b: number, size: number) => Math.min(Math.abs(a - b), size - Math.abs(a - b));
        expect(apart(first!.x, second!.x, som.w)).toBeLessThanOrEqual(1);
        expect(apart(first!.y, second!.y, som.h)).toBeLessThanOrEqual(1);
    }, 60_000);
});

describe('flowerService.speciesClassifier', () => {
    // First: the singleton is still uninitialised here.
    it('needs the service to be initialised, like every other call', () => {
        expect(() => flowerService.speciesClassifier).toThrow('has not been initialized');
    });

    it('shares the wasm instance of the service and is made once', async () => {
        await flowerService.initialize();
        const species = flowerService.speciesClassifier;
        expect(flowerService.speciesClassifier).toBe(species);
        expect(species.fingerprint).toBe(classifier.fingerprint);
        expectInsideTheMap(await species.classify(genomes[0]));
    }, 60_000);
});
