import { Dexie, type Table } from 'dexie';
import type { Flower } from '../types';

export class EvoGardenDB extends Dexie {
  savedFlowers!: Table<Flower, string>;
  constructor() {
    super('EvoGardenDatabase');
    this.version(1).stores({
      savedFlowers: 'id' 
    });
  }
}
export const db = new EvoGardenDB();
