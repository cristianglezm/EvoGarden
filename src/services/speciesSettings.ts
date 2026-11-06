import type { EvoGardenDB } from './db';
import type { SpeciesLimits } from '../lib/speciesRepository';

const LIMITS_KEY = 'limits';

/**
 * The limits the player chose for the collection. They are kept in IndexedDB next to the collection
 * because the flower worker, which applies them, has no localStorage and no way to be called.
 */
export interface SpeciesSettings {
    read(): Promise<Partial<SpeciesLimits> | undefined>;
    write(limits: Partial<SpeciesLimits>): Promise<void>;
}

export function createSpeciesSettings(database: EvoGardenDB): SpeciesSettings {
    return {
        async read() {
            const stored = await database.speciesMeta.get(LIMITS_KEY);
            return stored?.value as Partial<SpeciesLimits> | undefined;
        },
        async write(limits) {
            await database.speciesMeta.put({ key: LIMITS_KEY, value: limits });
        },
    };
}
