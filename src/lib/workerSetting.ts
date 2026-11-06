/** Where the player's choice of how many workers to use is kept (workers are created at start, so it applies on reload). */
export const WORKERS_KEY = 'evoGarden-workers';

export const MAX_WORKERS = 8;

export const isWorkerCount = (n: unknown): n is number =>
    typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= MAX_WORKERS;

/**
 * How many workers to start when the player has not chosen. The page and the simulation take two threads and
 * two more are left for the browser and the system (a 4-core laptop was fastest with three flower workers and
 * the species worker on 8 logical processors): the workers are the logical processors minus four, at least
 * two. With three or fewer one worker does everything. `hardwareConcurrency` counts logical processors and a
 * browser may hide or reduce it, so when it is not known the answer is two.
 */
export function automaticWorkers(hardwareConcurrency: number | undefined): number {
    if (typeof hardwareConcurrency !== 'number' || !Number.isFinite(hardwareConcurrency) || hardwareConcurrency < 1) return 2;
    if (hardwareConcurrency <= 3) return 1;
    return Math.min(MAX_WORKERS, Math.max(2, Math.floor(hardwareConcurrency) - 4));
}

/** The number the player chose, or null for automatic (nothing saved, or something that is not a number of workers). */
export function readWorkerSetting(storage: Pick<Storage, 'getItem'> | undefined): number | null {
    try {
        const saved = storage?.getItem(WORKERS_KEY);
        if (saved === null || saved === undefined || !/^\d+$/.test(saved)) return null;
        const n = Number(saved);
        return isWorkerCount(n) ? n : null;
    } catch {
        return null;
    }
}

/** Saves the choice (null for automatic); says whether it could be saved. */
export function writeWorkerSetting(storage: Pick<Storage, 'setItem' | 'removeItem'> | undefined, workers: number | null): boolean {
    if (!storage) return false;
    if (workers !== null && !isWorkerCount(workers)) return false;
    try {
        if (workers === null) storage.removeItem(WORKERS_KEY);
        else storage.setItem(WORKERS_KEY, String(workers));
        return true;
    } catch {
        return false;
    }
}
