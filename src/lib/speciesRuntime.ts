import type { EvoGardenDB } from '../services/db';
import type { SpeciesClassifier } from '../types';
import { createDexieSpeciesStore } from '../services/speciesStore';
import { createSpeciesSettings } from '../services/speciesSettings';
import { SpeciesRepository } from './speciesRepository';
import { SpeciesJobs, championRequest, type SpeciesJobsOptions } from './speciesJobs';

/**
 * What a worker needs to do the species work: the jobs, made on first use (the classifier needs
 * the wasm service to be started), and what goes in at start. The flower worker has it when it
 * does the species itself, the species worker always.
 */
export function createSpeciesRuntime(
    service: { readonly speciesClassifier: SpeciesClassifier },
    database: EvoGardenDB,
    workerName: string,
    options?: SpeciesJobsOptions
) {
    let jobs: SpeciesJobs | null = null;

    const getJobs = (): SpeciesJobs | null => {
        if (jobs) return jobs;
        try {
            const settings = createSpeciesSettings(database);
            jobs = new SpeciesJobs(service.speciesClassifier, new SpeciesRepository(createDexieSpeciesStore(database)), () => settings.read(), options);
        } catch (error) {
            console.error(`${workerName}: the species collection is not available.`, error);
        }
        return jobs;
    };

    return {
        jobs: getJobs,
        /** The jobs if they were made already: for what must not make them (and fail) before the wasm service is started. */
        peek: (): SpeciesJobs | null => jobs,
        /**
         * The migration goes first: the records of the champions are of the species the new classifier makes.
         * The champions saved before the collection existed are put in it, so the field guide can tell
         * which species each one belongs to.
         */
        async start(): Promise<void> {
            getJobs()?.startMigration();
            try {
                const species = getJobs();
                if (!species) return;
                for (const entry of await database.seedBank.toArray()) species.enqueueRecord(championRequest(entry));
            } catch (error) {
                console.error(`${workerName}: could not queue the champions for the species collection.`, error);
            }
        },
    };
}
