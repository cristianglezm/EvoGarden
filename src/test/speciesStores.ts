import 'fake-indexeddb/auto';
import type { SpeciesGenome, SpeciesSample, SpeciesStore, SpeciesTx } from '../types';
import { db } from '../services/db';
import { createDexieSpeciesStore } from '../services/speciesStore';

// Values are cloned on the way in and out, like IndexedDB does, so a test cannot pass by sharing an object.
const clone = <T>(value: T): T => structuredClone(value);

/** A storage with the same contract as the Dexie one: atomic, isolated, rolled back on error. */
export function createMemorySpeciesStore(): SpeciesStore {
    let samples = new Map<string, SpeciesSample>();
    let genomes = new Map<string, SpeciesGenome>();
    let tail: Promise<unknown> = Promise.resolve();

    return {
        transaction<T>(fn: (tx: SpeciesTx) => Promise<T>): Promise<T> {
            const run = tail.then(async () => {
                const workingSamples = new Map(samples);
                const workingGenomes = new Map(genomes);
                const tx: SpeciesTx = {
                    get: async id => clone(workingSamples.get(id)),
                    inCell: async cell => [...workingSamples.values()].filter(s => s.cell === cell).map(clone),
                    ofKind: async kind => [...workingSamples.values()].filter(s => s.kind === kind).map(clone),
                    distances: async () => [...workingSamples.values()].flatMap(s => (s.d === null ? [] : [s.d])).sort((a, b) => a - b),
                    genome: async id => clone(workingGenomes.get(id)),
                    stale: async (fp, limit) =>
                        [...workingSamples.values()]
                            .filter(s => s.fp !== fp)
                            .slice(0, limit)
                            .map(clone),
                    all: async () => [...workingSamples.values()].map(clone),
                    async put(sample, genome, image) {
                        workingSamples.set(sample.id, clone(sample));
                        workingGenomes.set(sample.id, image === undefined ? { id: sample.id, genome } : { id: sample.id, genome, image });
                    },
                    async update(sample) {
                        workingSamples.set(sample.id, clone(sample));
                    },
                    async remove(ids) {
                        ids.forEach(id => {
                            workingSamples.delete(id);
                            workingGenomes.delete(id);
                        });
                    },
                };
                const result = await fn(tx);
                samples = workingSamples;
                genomes = workingGenomes;
                return result;
            });
            tail = run.catch(() => undefined);
            return run;
        },
    };
}

export const speciesStoreFactories: Array<[string, () => Promise<SpeciesStore>]> = [
    ['memory', async () => createMemorySpeciesStore()],
    [
        'dexie',
        async () => {
            await Promise.all([db.speciesSamples.clear(), db.speciesGenomes.clear()]);
            return createDexieSpeciesStore(db);
        },
    ],
];
