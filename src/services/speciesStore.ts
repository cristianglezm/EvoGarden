import type { EvoGardenDB } from './db';
import type { SpeciesStore, SpeciesTx } from '../types';

export function createDexieSpeciesStore(database: EvoGardenDB): SpeciesStore {
    const { speciesSamples: samples, speciesGenomes: genomes } = database;

    // Only Dexie calls inside: awaiting anything else would let the transaction commit early.
    const tx: SpeciesTx = {
        get: id => samples.get(id),
        inCell: cell => samples.where('cell').equals(cell).toArray(),
        ofKind: kind => samples.where('kind').equals(kind).toArray(),
        distances: () => samples.orderBy('d').keys() as Promise<number[]>,
        genome: id => genomes.get(id),
        stale: (fp, limit) => samples.where('fp').notEqual(fp).limit(limit).toArray(),
        all: () => samples.toArray(),
        async put(sample, genome, image) {
            await samples.put(sample);
            await genomes.put(image === undefined ? { id: sample.id, genome } : { id: sample.id, genome, image });
        },
        async update(sample) {
            await samples.put(sample);
        },
        async remove(ids) {
            await samples.bulkDelete(ids);
            await genomes.bulkDelete(ids);
        },
    };

    return {
        transaction: fn => database.transaction('rw', [samples, genomes], () => fn(tx)),
    };
}
