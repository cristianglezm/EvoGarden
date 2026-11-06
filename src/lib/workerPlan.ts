import type { WorkerPortSpec } from './asyncFlowerFactory';
import { automaticWorkers, isWorkerCount } from './workerSetting';

export interface WorkerPlan {
    /** Classification in a worker of its own, so it does not wait for the flowers to be made. */
    speciesWorker: boolean;
    /** Workers that make flowers: each one is a wasm instance, about 30 MB, and a core while it works. */
    creationWorkers: number;
}

export type PlanSource = { speciesWorker: 'address' | 'setting' | 'automatic'; creationWorkers: 'address' | 'setting' | 'automatic' };

const addressWorkers = (query: URLSearchParams): number | null => {
    const asked = query.get('creationWorkers');
    const count = asked !== null && /^\d+$/.test(asked) ? Number(asked) : NaN;
    return isWorkerCount(count) ? count : null;
};

/**
 * Which workers the game starts. The number of workers is what the player chose (`workers`, saved by the
 * Controls), or else comes from the cores (`automaticWorkers`); with two or more, one only classifies and the
 * rest make flowers and classify when they have none to make. The address decides by hand over both, so the
 * options can be compared on the same machine: `?speciesWorker=0|1` and `?creationWorkers=N`.
 */
export function planWorkers({ hardwareConcurrency, search = '', workers }: { hardwareConcurrency?: number; search?: string; workers?: number | null }): WorkerPlan {
    const query = new URLSearchParams(search);
    const total = isWorkerCount(workers) ? workers : automaticWorkers(hardwareConcurrency);

    const askedSpecies = query.get('speciesWorker');
    const speciesWorker = askedSpecies === '0' ? false : askedSpecies === '1' ? true : total >= 2;

    // without a species worker every worker makes flowers (the first one also classifies)
    const creationWorkers = addressWorkers(query) ?? Math.max(1, speciesWorker ? total - 1 : total);
    return { speciesWorker, creationWorkers };
}

/** Whether the address, the player's setting or the machine decided each part of the plan: a measurement has to say which. */
export function workerPlanSource(search: string, workers?: number | null): PlanSource {
    const query = new URLSearchParams(search);
    const species = query.get('speciesWorker');
    const fromSetting = isWorkerCount(workers) ? 'setting' : 'automatic';
    return {
        speciesWorker: species === '0' || species === '1' ? 'address' : fromSetting,
        creationWorkers: addressWorkers(query) !== null ? 'address' : fromSetting,
    };
}

/**
 * The workers the simulation talks to, with what each one does. Next to a species worker the flower workers
 * classify too when they have nothing to make; without one, the species go to the first worker that makes
 * flowers and only to it. The migration and the champions run in one place either way (`primarySpecies`).
 */
export function workerPortSpecs({ flowerWorkerPorts = [], speciesWorkerPort }: { flowerWorkerPorts?: MessagePort[]; speciesWorkerPort?: MessagePort | null }): WorkerPortSpec[] {
    const specs: WorkerPortSpec[] = flowerWorkerPorts.map((port, i) => ({
        port,
        roles: speciesWorkerPort || i === 0 ? ['creation', 'species'] : ['creation'],
    }));
    if (speciesWorkerPort) specs.push({ port: speciesWorkerPort, roles: ['species'] });
    return specs;
}
