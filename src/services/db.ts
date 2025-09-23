import { Dexie, type Table } from 'dexie';
import type { Flower, SeedBankEntry } from '../types';

export class EvoGardenDB extends Dexie {
  savedFlowers!: Table<Flower, string>;
  seedBank!: Table<SeedBankEntry, string>;
  constructor() {
    super('EvoGardenDatabase');
    this.version(2).stores({
      savedFlowers: 'id',
      seedBank: 'category',
    });
  }
}
export const db = new EvoGardenDB();
