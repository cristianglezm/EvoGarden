import type { Flower, FlowerSeed, SimulationParams, CellContent, FlowerCreationRequest, WorkersSummary } from '../types';
import { SEED_HEALTH } from '../constants';

interface CompletedFlowerPayload {
    requestId: string;
    flower: Flower | null; // Flower can be null on creation failure
}

export interface CompletedFlowerResult {
    flowersToAdd: Flower[];
    seedsToRemove: string[];
}

/** What a worker does for the simulation: it makes flowers, or classifies them, or both. */
export type WorkerRole = 'creation' | 'species';

export interface WorkerPortSpec {
    port: MessagePort;
    roles: WorkerRole[];
}

interface WorkerState extends WorkerPortSpec {
    /** the flower requests this worker has not answered yet */
    inFlight: Set<string>;
    produced: number;
    failed: number;
    /** what the worker said it took for its last flowers */
    durations: number[];
    /** the species jobs it was given and has not answered: while there are any it makes no flowers */
    speciesInFlight: number;
}

const AVERAGE_OVER = 50;
// Requests a worker holds at a time: the one it is making and the next, which is already there when it finishes,
// so it is never idle. The rest wait here, where one that is cancelled costs nothing and any free worker can take it.
const IN_FLIGHT_PER_WORKER = 2;
// Species jobs given to a worker at once. A classification call cannot be interrupted, so a worker that only
// classifies takes a big batch (it has nothing else to do), and a flower worker that was idle a small one (the
// flowers that arrive meanwhile go to the other workers, or wait for this one).
const SPECIES_BATCH_DEDICATED = 32;
export const SPECIES_BATCH_HELPER = 8;
// Classifications that may wait here (about 20 kB each, the genome and the image). The collection is a sample, and
// many of the answers are `dropped` anyway because the cell is full: when the workers cannot keep up, the oldest
// flowers go and the newest are classified, instead of a queue that grows for ever. Records are never dropped.
export const SPECIES_QUEUE_LIMIT = 200;

type SpeciesMessage = { type: string; payload?: unknown };
// Enough to know about the seeds that died a moment ago; ids are never reused, so older ones are of no use.
const CANCELS_REMEMBERED = 5000;
const RATE_WINDOW_MS = 10_000;

export class AsyncFlowerFactory {
    private workers: WorkerState[] = [];
    private completedFlowersQueue: CompletedFlowerPayload[] = [];
    private stemImageData: string | null = null;
    private pendingRequests = new Set<string>();
    private requestOwner = new Map<string, WorkerState>();
    private listeners = new Map<string, (payload: any) => void>();
    private producedAt: number[] = [];
    private seedsDiscarded = 0;
    private seedsCancelled = 0;
    private discardedAfterCancel = 0;
    private cancelledIds = new Set<string>();
    private statsSince: number;
    // Requests that no worker has been given yet, in the order they were asked.
    private waiting: FlowerCreationRequest[] = [];
    // The same for the species work.
    private speciesWaiting: SpeciesMessage[] = [];
    private speciesDispatchScheduled = false;
    private speciesDroppedListener: ((message: SpeciesMessage) => void) | null = null;
    private readonly inFlightPerWorker: number;
    private readonly speciesQueueLimit: number;

    constructor(private readonly now: () => number = () => Date.now(), options: { inFlightPerWorker?: number; speciesQueueLimit?: number } = {}) {
        this.statsSince = now();
        this.speciesQueueLimit = Math.max(1, Math.floor(options.speciesQueueLimit ?? SPECIES_QUEUE_LIMIT));
        this.inFlightPerWorker = Math.max(1, Math.floor(options.inFlightPerWorker ?? IN_FLIGHT_PER_WORKER));
    }

    /** One worker that does everything: what the game had before it had more than one. */
    public setFlowerWorkerPort(port: MessagePort, params: SimulationParams) {
        this.setWorkerPorts([{ port, roles: ['creation', 'species'] }], params);
    }

    /**
     * Replaces the workers. A port that was already there keeps what it has in flight, so setting
     * the same ports again (the simulation does it at every start and load) does not lose requests.
     */
    public setWorkerPorts(specs: WorkerPortSpec[], params: SimulationParams) {
        const next = specs.map(spec => {
            const known = this.workers.find(w => w.port === spec.port);
            return known ? Object.assign(known, { roles: spec.roles }) : { ...spec, inFlight: new Set<string>(), produced: 0, failed: 0, durations: [], speciesInFlight: 0 };
        });
        for (const gone of this.workers.filter(w => !next.includes(w))) {
            gone.port.onmessage = null;
            for (const id of gone.inFlight) {
                this.requestOwner.delete(id);
                this.pendingRequests.delete(id);
            }
        }
        this.workers = next;
        for (const worker of this.workers) {
            worker.port.onmessage = (e: MessageEvent) => this.handleMessage(e.data, worker);
        }
        this.updateParams(params);
        // after the parameters, which a worker needs before its first request; a new worker takes what waits
        this.dispatch();
    }

    /** The ports have one handler each, so other kinds of message from the workers come through here. */
    public onMessage(type: string, listener: (payload: any) => void) {
        this.listeners.set(type, listener);
    }

    /**
     * Species work. A lone worker that makes flowers and classifies gets it at once, a job at a time, and
     * alternates between the two itself. Otherwise it waits here, and goes in batches to a worker that only
     * classifies, or to a flower worker that has nothing to make (see dispatchSpecies).
     */
    public postToSpeciesWorker(message: SpeciesMessage) {
        const capable = this.workers.filter(w => w.roles.includes('species'));
        if (capable.length === 0) return;
        const dedicated = capable.some(w => !w.roles.includes('creation'));
        if (!dedicated && capable.length === 1) {
            capable[0].port.postMessage(message);
            return;
        }
        this.speciesWaiting.push(message);
        // what is asked in the same tick goes together, not the first one alone
        if (!this.speciesDispatchScheduled) {
            this.speciesDispatchScheduled = true;
            queueMicrotask(() => {
                this.speciesDispatchScheduled = false;
                this.dispatch();
            });
        }
    }

    /** Told of each classification the bounded queue let go, so whoever asked for it does not wait for an answer. */
    public onSpeciesDropped(listener: (message: SpeciesMessage) => void) {
        this.speciesDroppedListener = listener;
    }

    public setStemImage(imageData: string) {
        this.stemImageData = imageData;
    }

    /** Only the workers that make flowers need them. */
    public updateParams(params: SimulationParams) {
        for (const worker of this.workers) {
            if (worker.roles.includes('creation')) worker.port.postMessage({ type: 'update-params', payload: params });
        }
    }
    
    public reset() {
        this.completedFlowersQueue = [];
        this.pendingRequests.clear();
        this.requestOwner.clear();
        this.waiting = [];
        this.speciesWaiting = [];
        for (const worker of this.workers) {
            worker.inFlight.clear();
            worker.speciesInFlight = 0;
            worker.port.postMessage({ type: 'cancel-all-requests' });
        }
        this.resetStats();
    }

    /** What the workers have done counts from the start of a game or the load of one. */
    public resetStats() {
        this.producedAt = [];
        this.seedsDiscarded = 0;
        this.seedsCancelled = 0;
        this.discardedAfterCancel = 0;
        this.cancelledIds.clear();
        this.statsSince = this.now();
        for (const worker of this.workers) {
            worker.produced = 0;
            worker.failed = 0;
            worker.durations = [];
        }
    }

    public getStats(): Omit<WorkersSummary, 'species'> {
        const now = this.now();
        const creators = this.workers.filter(w => w.roles.includes('creation'));
        const nameOf = (worker: WorkerState) => `Flower worker ${creators.indexOf(worker) + 1}`;
        const speciesWorkers = this.workers.filter(w => w.roles.includes('species'));
        const dedicated = speciesWorkers.find(w => !w.roles.includes('creation'));
        const recent = this.producedAt.filter(t => t > now - RATE_WINDOW_MS).length;
        // In the first seconds the rate is over the time there has been, not over ten seconds that did not happen.
        const seconds = Math.min(Math.max(now - this.statsSince, 1000), RATE_WINDOW_MS) / 1000;
        return {
            queued: this.waiting.length,
            flowerWorkers: creators.map(worker => ({
                name: nameOf(worker),
                inFlight: worker.inFlight.size,
                produced: worker.produced,
                failed: worker.failed,
                avgMs: worker.durations.length > 0 ? worker.durations.reduce((a, b) => a + b, 0) / worker.durations.length : null,
            })),
            speciesWorker: dedicated ? 'Species worker' : speciesWorkers[0] ? nameOf(speciesWorkers[0]) : null,
            produced: creators.reduce((sum, w) => sum + w.produced, 0),
            failed: creators.reduce((sum, w) => sum + w.failed, 0),
            flowersPerSecond: recent / seconds,
            seedsDiscarded: this.seedsDiscarded,
            seedsCancelled: this.seedsCancelled,
            discardedAfterCancel: this.discardedAfterCancel,
        };
    }

    private countResult(worker: WorkerState, made: boolean, durationMs: unknown) {
        if (!made) {
            worker.failed++;
            return;
        }
        worker.produced++;
        if (typeof durationMs === 'number' && Number.isFinite(durationMs) && durationMs >= 0) {
            worker.durations.push(durationMs);
            if (worker.durations.length > AVERAGE_OVER) worker.durations.shift();
        }
        const now = this.now();
        this.producedAt.push(now);
        while (this.producedAt.length > 0 && this.producedAt[0] <= now - RATE_WINDOW_MS) this.producedAt.shift();
    }

    private handleMessage(data: { type: string, payload: any }, worker: WorkerState) {
        const { type, payload } = data;
        if (type === 'flower-created' || type === 'flower-creation-failed') {
            this.countResult(worker, type === 'flower-created' && !!payload.flower, payload.durationMs);
            this.completedFlowersQueue.push(payload);
            this.pendingRequests.delete(payload.requestId);
            this.release(payload.requestId);
            this.dispatch();
        } else {
            // an answer frees the worker once it has given every one of its batch
            if (type === 'species-classified') worker.speciesInFlight = Math.max(0, worker.speciesInFlight - 1);
            this.listeners.get(type)?.(payload);
            if (type === 'species-classified') this.dispatch();
        }
    }

    public requestNewFlower(
        nextActorState: Map<string, CellContent>,
        x: number,
        y: number,
        parentGenome1: string | undefined,
        parentGenome2: string | undefined,
        getNextId: (type: string, x: number, y: number) => string
    ): FlowerSeed | null {
        if (!this.workers.some(w => w.roles.includes('creation')) || !this.stemImageData) {
            console.error("AsyncFlowerFactory not ready to request a new flower.");
            return null;
        }

        let totalHealth = 0;
        let flowerCount = 0;
        for (const actor of nextActorState.values()) {
            if (actor.type === 'flower') {
                totalHealth += (actor as Flower).health;
                flowerCount++;
            }
        }
        
        const avgHealth = flowerCount > 0 ? totalHealth / flowerCount : SEED_HEALTH;
        const seedHealth = Math.max(1, Math.round(avgHealth));

        const requestId = getNextId('seed', x, y);
        const flowerId = getNextId('flower', x, y);
        
        const requestPayload: FlowerCreationRequest = {
            requestId, flowerId, x, y, parentGenome1, parentGenome2
        };

        this.pendingRequests.add(requestId);
        this.waiting.push(requestPayload);
        this.dispatch();

        return { id: requestId, type: 'flowerSeed', x, y, imageData: this.stemImageData, health: seedHealth, maxHealth: seedHealth, age: 0 };
    }
    
    public cancelFlowerRequest(requestId: string) {
        // Counted and remembered even when the request has finished: its result may be on the way, and then the
        // flower is lost because the cancel came too late, which is not the same as a flower nobody cancelled.
        this.seedsCancelled++;
        this.cancelledIds.add(requestId);
        if (this.cancelledIds.size > CANCELS_REMEMBERED) this.cancelledIds.delete(this.cancelledIds.values().next().value!);
        // Immediately remove from pending set to update UI counter
        this.pendingRequests.delete(requestId);

        // A request that no worker has yet is just forgotten: it costs nothing and nobody needs to be told.
        const waitingAt = this.waiting.findIndex(r => r.requestId === requestId);
        if (waitingAt >= 0) {
            this.waiting.splice(waitingAt, 1);
            return;
        }
        // Only the worker that holds the request has anything to cancel. Its place is free at once: a worker
        // cancels without answering, so there is no message to wait for.
        this.requestOwner.get(requestId)?.port.postMessage({
            type: 'cancel-flower-request',
            payload: { requestId }
        });
        this.release(requestId);
        this.dispatch();
    }

    /** Gives what waits to the workers that are free: the flowers first, then the species work to what is left. */
    private dispatch(): void {
        this.dispatchFlowers();
        this.dispatchSpecies();
        this.trimSpecies();
    }

    /** What is left after the free workers took their batches: the oldest classifications beyond the limit go. */
    private trimSpecies(): void {
        let excess = this.speciesWaiting.length - this.speciesQueueLimit;
        if (excess < 1) return;
        const kept: SpeciesMessage[] = [];
        const dropped: SpeciesMessage[] = [];
        for (const message of this.speciesWaiting) {
            if (excess > 0 && message.type === 'classify-flower') {
                dropped.push(message);
                excess--;
            } else {
                kept.push(message);
            }
        }
        this.speciesWaiting = kept;
        for (const message of dropped) this.speciesDroppedListener?.(message);
    }

    private dispatchSpecies(): void {
        while (this.speciesWaiting.length > 0) {
            const next = this.nextSpeciesWorker();
            if (!next) return;
            const jobs = this.speciesWaiting.splice(0, next.size);
            next.worker.port.postMessage({ type: 'species-batch', payload: { jobs } });
            next.worker.speciesInFlight += jobs.length;
        }
    }

    /**
     * A worker that only classifies, when it has answered its last batch; else a flower worker that has nothing
     * to make, so classifying never slows the flowers down. The flowers were given out first, so a worker with
     * none in hand has none waiting for it either.
     */
    private nextSpeciesWorker(): { worker: WorkerState; size: number } | null {
        const dedicated = this.workers.find(w => w.roles.includes('species') && !w.roles.includes('creation') && w.speciesInFlight === 0);
        if (dedicated) return { worker: dedicated, size: SPECIES_BATCH_DEDICATED };
        const helper = this.workers.find(w =>
            w.roles.includes('species') && w.roles.includes('creation') && w.speciesInFlight === 0 && w.inFlight.size === 0);
        return helper ? { worker: helper, size: SPECIES_BATCH_HELPER } : null;
    }

    /** Gives the requests that wait to the workers that have a free place, the least busy first. */
    private dispatchFlowers(): void {
        while (this.waiting.length > 0) {
            const worker = this.leastBusyCreator();
            if (!worker) return;
            const request = this.waiting.shift()!;
            worker.port.postMessage({ type: 'request-flower', payload: request });
            worker.inFlight.add(request.requestId);
            this.requestOwner.set(request.requestId, worker);
        }
    }

    /** The worker that makes flowers with the fewest requests, if it has a free place. */
    private leastBusyCreator(): WorkerState | null {
        let best: WorkerState | null = null;
        for (const worker of this.workers) {
            if (!worker.roles.includes('creation') || worker.speciesInFlight > 0 || worker.inFlight.size >= this.inFlightPerWorker) continue;
            if (!best || worker.inFlight.size < best.inFlight.size) best = worker;
        }
        return best;
    }

    private release(requestId: string) {
        this.requestOwner.get(requestId)?.inFlight.delete(requestId);
        this.requestOwner.delete(requestId);
    }
    
    public getCompletedFlowers(actorState: Map<string, CellContent>): CompletedFlowerResult {
        const result: CompletedFlowerResult = { flowersToAdd: [], seedsToRemove: [] };
        if (this.completedFlowersQueue.length === 0) {
            return result;
        }

        for (const { requestId, flower } of this.completedFlowersQueue) {
            const seed = actorState.get(requestId);
            if (seed && seed.type === 'flowerSeed') {
                result.seedsToRemove.push(requestId);
                if (flower) {
                    flower.age += seed.age;
                    if (flower.age >= flower.maturationPeriod) {
                        flower.isMature = true;
                    }
                    result.flowersToAdd.push(flower);
                }
            } else if (flower) {
                // the seed died or was cancelled while the flower was made: the flower is lost
                this.seedsDiscarded++;
                if (this.cancelledIds.has(requestId)) this.discardedAfterCancel++;
            }
            this.cancelledIds.delete(requestId);
        }

        this.completedFlowersQueue = [];
        return result;
    }

    public getPendingRequestCount(): number {
        return this.pendingRequests.size;
    }
}