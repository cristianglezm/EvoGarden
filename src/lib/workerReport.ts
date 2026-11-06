import type { SpeciesStatus, WorkersSummary } from '../types';
import type { PlanSource, WorkerPlan } from './workerPlan';

export type WorkerSetup = PlanSource & { hardwareConcurrency?: number };

const STATUS_ORDER: SpeciesStatus[] = ['discovered', 'stored', 'unclassified', 'skipped', 'dropped', 'recorded', 'unchanged', 'failed'];

export const formatMs = (ms: number | null): string => (ms === null ? '–' : `${Math.round(ms)} ms`);

/** "discovered 3, stored 70": the statuses in a fixed order, so two reports can be compared. */
export function speciesStatusLine(byStatus: WorkersSummary['species']['byStatus']): string {
    const known = STATUS_ORDER.filter(status => byStatus[status]);
    const other = (Object.keys(byStatus) as SpeciesStatus[]).filter(status => byStatus[status] && !STATUS_ORDER.includes(status)).sort();
    const parts = [...known, ...other].map(status => `${status} ${byStatus[status]}`);
    return parts.length > 0 ? parts.join(', ') : 'none yet';
}

function setupText(cores: number | undefined, count: number, speciesWorker: boolean, setup: WorkerSetup): string {
    return `${cores ?? 'unknown'} cores, ${count} flower worker${count === 1 ? '' : 's'} (${setup.creationWorkers}), species worker ${speciesWorker ? 'on' : 'off'} (${setup.speciesWorker})`;
}

/** What the workers say about how they were set up. */
export function setupLine(workers: WorkersSummary, setup: WorkerSetup): string {
    return setupText(setup.hardwareConcurrency, workers.flowerWorkers.length, workers.speciesWorker === 'Species worker', setup);
}

/** The same, from the plan, for before the workers have said anything. */
export function plannedSetupLine(plan: WorkerPlan, setup: WorkerSetup): string {
    return setupText(setup.hardwareConcurrency, plan.creationWorkers, plan.speciesWorker, setup);
}

/** The seeds that died: how many requests were cancelled, and how many flowers were made for nothing. */
export function seedsLine(workers: WorkersSummary): string {
    const late = workers.discardedAfterCancel;
    const never = Math.max(0, workers.seedsDiscarded - late);
    return `Seeds: ${workers.seedsCancelled} cancelled, ${workers.seedsDiscarded} flowers thrown away (${late} after a cancel came too late, ${never} with no cancel)`;
}

/** What the species worker is called in a table, or null when nobody does the species work. */
export function speciesLabel(speciesWorker: string | null): string | null {
    if (speciesWorker === null) return null;
    return speciesWorker === 'Species worker' ? speciesWorker : `Species work (in ${speciesWorker})`;
}

/** The report the player pastes into a review: the same numbers as the details, as text. */
export function describeWorkers(workers: WorkersSummary, setup: WorkerSetup): string {
    const label = speciesLabel(workers.speciesWorker);
    const species = workers.species;
    return [
        'Workers',
        ...workers.flowerWorkers.map(w =>
            `${w.name}: ${w.inFlight} in flight, ${w.produced} produced, ${w.failed} failed, ${w.avgMs === null ? 'no time yet' : `${formatMs(w.avgMs)} per flower`}`),
        label === null
            ? 'Species work: no worker'
            : `${label}: ${species.waiting} waiting, ${species.answered} answered, ${species.byStatus.failed ?? 0} failed, ${species.avgMs === null ? 'no time yet' : `${formatMs(species.avgMs)} per flower`}`,
        `Flowers waiting for a worker: ${workers.queued}`,
        `Flowers produced: ${workers.produced} (${workers.flowersPerSecond.toFixed(1)} per second, last 10 s), seeds discarded: ${workers.seedsDiscarded}`,
        seedsLine(workers),
        `Species: ${speciesStatusLine(species.byStatus)}`,
        `Species dropped from the queue (too many waiting): ${species.dropped}`,
        `Setup: ${setupLine(workers, setup)}`,
    ].join('\n');
}
