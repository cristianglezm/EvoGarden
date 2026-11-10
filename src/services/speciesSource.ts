import type { EvoGardenDB } from './db';
import { DEFAULT_SPECIES_LIMITS, validateLimits, type SpeciesLimits } from '../lib/speciesRepository';
import { cellKey, genomeId, parseSom, speciesName } from '../lib/species';
import { createSpeciesSettings } from './speciesSettings';
import type { SeedBankCategory, SeedBankEntry, SpeciesClassifier, SpeciesMap, SpeciesSample } from '../types';

export type SpeciesGrid = SpeciesMap & { fp: string };

/** What the field guide reads: the map of the classifier in use and the collection. */
export interface SpeciesSource {
    /** Throws while the classifier is not ready. */
    grid(): SpeciesGrid;
    samples(): Promise<SpeciesSample[]>;
    /** The images of the samples that have one, by id. */
    images(ids: string[]): Promise<Record<string, string>>;
    genome(id: string): Promise<{ genome: string; image?: string } | undefined>;
    /** The id in the collection of the champion of each category. */
    championIds(champions: SeedBankEntry[]): Promise<Partial<Record<SeedBankCategory, string>>>;
    /** The species a genome is stored under, if it is in the collection. */
    speciesOf(genome: string): Promise<{ key: string; name: string } | null>;
    /**
     * The species of a flower that is in the garden: the stored one, or else the one the classifier gives it now
     * (`stored: false`; a flower whose cell was full is not kept). Nothing when it has no species or the
     * classifier is not ready. It never writes: the collection is the workers'.
     */
    speciesFor(genome: string): Promise<{ key: string; name: string; stored: boolean } | null>;
    /** The genomes of samples, by id. */
    genomes(ids: string[]): Promise<Record<string, string>>;
    /** The version of fe-wasm the classifier comes from. */
    version(): string;
    /** The limits in use: what the player chose over the defaults. */
    limits(): Promise<SpeciesLimits>;
    /** Chooses how many samples a species keeps; the flower worker applies it. */
    setCap(cap: number): Promise<void>;
    /** Lets go of every sample and genome. The cap the player chose and the Seed Bank stay. */
    clear(): Promise<void>;
    /** What this site stores and what the browser lets it, if the browser says. */
    storage(): Promise<{ usage: number; quota: number } | null>;
}

const browserStorage = async () => {
    const estimate = await globalThis.navigator?.storage?.estimate?.();
    return estimate?.usage !== undefined && estimate.quota !== undefined ? { usage: estimate.usage, quota: estimate.quota } : null;
};

export function createSpeciesSource(
    database: EvoGardenDB,
    classifier: () => SpeciesClassifier,
    storage: SpeciesSource['storage'] = browserStorage,
): SpeciesSource {
    const settings = createSpeciesSettings(database);
    let cached: SpeciesGrid | null = null;
    const grid = (): SpeciesGrid => {
        const { fingerprint, classifierJson } = classifier();
        if (!cached || cached.fp !== fingerprint) cached = { ...parseSom(classifierJson()), fp: fingerprint };
        return cached;
    };

    const speciesOf: SpeciesSource['speciesOf'] = async genome => {
        const sample = await database.speciesSamples.get(await genomeId(genome));
        if (!sample || sample.cell === 'none' || sample.fp !== grid().fp) return null;
        return { key: sample.cell, name: speciesName(sample.x!, sample.y!, grid().w) };
    };

    return {
        grid,
        samples: () => database.speciesSamples.toArray(),
        async images(ids) {
            const rows = await database.speciesGenomes.bulkGet(ids);
            const images: Record<string, string> = {};
            rows.forEach(row => { if (row?.image) images[row.id] = row.image; });
            return images;
        },
        genome: id => database.speciesGenomes.get(id),
        async championIds(champions) {
            const ids: Partial<Record<SeedBankCategory, string>> = {};
            for (const champion of champions) ids[champion.category] = await genomeId(champion.genome);
            return ids;
        },
        async genomes(ids) {
            const rows = await database.speciesGenomes.bulkGet(ids);
            const genomes: Record<string, string> = {};
            rows.forEach(row => { if (row) genomes[row.id] = row.genome; });
            return genomes;
        },
        version: () => classifier().version,
        async limits() {
            try {
                return validateLimits({ ...DEFAULT_SPECIES_LIMITS, ...(await settings.read()) });
            } catch {
                return DEFAULT_SPECIES_LIMITS;
            }
        },
        async setCap(cap) {
            validateLimits({ ...DEFAULT_SPECIES_LIMITS, cap });
            await settings.write({ ...(await settings.read()), cap });
        },
        async clear() {
            // One transaction: a reader never sees samples without their genomes
            await database.transaction('rw', database.speciesSamples, database.speciesGenomes, async () => {
                await database.speciesSamples.clear();
                await database.speciesGenomes.clear();
            });
        },
        storage,
        speciesOf,
        async speciesFor(genome) {
            try {
                const stored = await speciesOf(genome);
                if (stored) return { ...stored, stored: true };
                const match = await classifier().classify(genome);
                return match ? { key: cellKey(match), name: speciesName(match.x, match.y, grid().w), stored: false } : null;
            } catch {
                return null;
            }
        },
    };
}
