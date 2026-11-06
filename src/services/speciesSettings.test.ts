// @vitest-environment node
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from './db';
import { createSpeciesSettings } from './speciesSettings';

describe('the settings of the species collection', () => {
    beforeEach(async () => {
        await db.speciesMeta.clear();
    });

    it('have nothing chosen until the player chooses', async () => {
        expect(await createSpeciesSettings(db).read()).toBeUndefined();
    });

    it('give back what was chosen, and the last choice', async () => {
        const settings = createSpeciesSettings(db);
        await settings.write({ cap: 25 });
        expect(await settings.read()).toEqual({ cap: 25 });
        await settings.write({ cap: 100 });
        expect(await settings.read()).toEqual({ cap: 100 });
    });

    it('are read by another instance, as the flower worker reads what the page wrote', async () => {
        await createSpeciesSettings(db).write({ cap: 10 });
        expect(await createSpeciesSettings(db).read()).toEqual({ cap: 10 });
    });
});
