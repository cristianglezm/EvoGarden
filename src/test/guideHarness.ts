import 'fake-indexeddb/auto';
import { vi } from 'vitest';
import { FEService } from '@cristianglezm/flower-evolver-wasm';
import { db } from '../services/db';
import { createSpeciesClassifier } from '../services/speciesClassifier';
import { createSpeciesSource } from '../services/speciesSource';
import { createDexieSpeciesStore } from '../services/speciesStore';
import { SpeciesRepository } from '../lib/speciesRepository';
import type { SpeciesCandidate } from '../lib/speciesRepository';
import type { SpeciesClassifier } from '../types';

/**
 * What the component tests of the field guide stand on: the real classifier of fe-wasm, a real
 * IndexedDB, and the collection written the way the flower worker writes it. Only the canvas is
 * replaced: jsdom has none.
 */
export async function createGuideHarness() {
    const service = new FEService();
    await service.init();
    const classifier: SpeciesClassifier = createSpeciesClassifier(service);
    const source = createSpeciesSource(db, () => classifier);
    const repository = new SpeciesRepository(createDexieSpeciesStore(db));

    return {
        classifier,
        source,
        repository,
        reset: () => Promise.all([db.speciesSamples.clear(), db.speciesGenomes.clear(), db.speciesMeta.clear(), db.seedBank.clear()]),
        /** A flower of the species (x, y), as the flower worker would keep it. */
        offer: (genome: string, x: number, y: number, extra: Partial<SpeciesCandidate> = {}) =>
            repository.offer({ genome, match: { x, y, distance: 1 }, fp: classifier.fingerprint, sex: 'both', ...extra }),
        /** A flower of the species (x, y) that has died: it takes the records it beats. */
        record: (genome: string, x: number, y: number, extra: Partial<SpeciesCandidate> = {}) =>
            repository.record({ genome, match: { x, y, distance: 1 }, fp: classifier.fingerprint, sex: 'both', ...extra }),
    };
}

/** jsdom has no canvas: a context that remembers what was drawn. */
export function stubCanvas() {
    const putImageData = vi.fn();
    const context = {
        createImageData: (w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
        putImageData,
    };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D);
    return { putImageData };
}
