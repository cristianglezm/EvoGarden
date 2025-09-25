import { Dexie, type Table } from 'dexie';
import type { Flower, Insect, SeedBankEntry } from '../types';

export class EvoGardenDB extends Dexie {
  savedFlowers!: Table<Flower, string>;
  savedInsects!: Table<Insect, string>;
  seedBank!: Table<SeedBankEntry, string>;
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
  }
}
export const db = new EvoGardenDB();
