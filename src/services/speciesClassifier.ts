import type { FEService as FEServicePackage } from '@cristianglezm/flower-evolver-wasm';
import { SPECIES_ENVIRONMENT, fingerprint, toGenerationEntry } from '../lib/species';
import type { SpeciesClassifier, SpeciesMatch } from '../types';

// Takes the instance instead of making one: every wasm instance has its own 30 MB heap, and
// each thread that classifies already holds one for the flowers.
type SomBackend = Pick<FEServicePackage, 'classify' | 'classifyBatch' | 'getSOM' | 'getTrainedSOM' | 'getVersion'>;

// The library answers `null` for an entry it cannot use, so an unusable genome is sent as one
// instead of failing the whole batch, and the results keep lining up with the input.
const UNUSABLE_ENTRY = {};

export function createSpeciesClassifier(service: SomBackend): SpeciesClassifier {
    let cachedFingerprint: string | null = null;
    const classifierJson = () => service.getSOM() || service.getTrainedSOM();

    return {
        // Nothing here loads or trains a classifier, so the one in use never changes while the
        // instance lives.
        get fingerprint() {
            return (cachedFingerprint ??= fingerprint(classifierJson()));
        },
        classifierJson,
        get version() {
            return service.getVersion();
        },
        classify(genome: string): Promise<SpeciesMatch | null> {
            return service.classify(genome, SPECIES_ENVIRONMENT);
        },
        async classifyBatch(genomes: string[]): Promise<Array<SpeciesMatch | null>> {
            if (genomes.length === 0) return [];
            const entries = genomes.map(genome => {
                try {
                    return toGenerationEntry(genome);
                } catch {
                    return UNUSABLE_ENTRY;
                }
            });
            return service.classifyBatch(JSON.stringify({ Generation: entries }), SPECIES_ENVIRONMENT);
        },
    };
}
