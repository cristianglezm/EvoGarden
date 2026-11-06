import { Dexie, type Table } from 'dexie';
import type { Flower, Insect, SeedBankEntry, SpeciesGenome, SpeciesMeta, SpeciesSample } from '../types';

export class EvoGardenDB extends Dexie {
  savedFlowers!: Table<Flower, string>;
  savedInsects!: Table<Insect, string>;
  seedBank!: Table<SeedBankEntry, string>;
  speciesSamples!: Table<SpeciesSample, string>;
  speciesGenomes!: Table<SpeciesGenome, string>;
  speciesMeta!: Table<SpeciesMeta, string>;
  constructor() {
    super('EvoGardenDatabase');
    this.version(2).stores({
      savedFlowers: 'id',
      seedBank: 'category',
    });
    // Version 3 adds the savedInsects table and must re-declare existing tables.
    this.version(3).stores({
      savedFlowers: 'id',
      seedBank: 'category',
      savedInsects: 'id'
    });
    // Version 4 adds the species collection. `d` is indexed only to read the distances without
    // the rows; an unclassified sample has none and `null` is not a valid key, so it is skipped.
    this.version(4).stores({
      savedFlowers: 'id',
      seedBank: 'category',
      savedInsects: 'id',
      speciesSamples: 'id, cell, fp, kind, d',
      speciesGenomes: 'id'
    });
    // Version 5 adds the settings of the species collection (the cap per species).
    this.version(5).stores({
      savedFlowers: 'id',
      seedBank: 'category',
      savedInsects: 'id',
      speciesSamples: 'id, cell, fp, kind, d',
      speciesGenomes: 'id',
      speciesMeta: 'key'
    });
  }
}
export const db = new EvoGardenDB();
