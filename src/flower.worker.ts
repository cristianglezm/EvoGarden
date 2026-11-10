/// <reference lib="webworker" />

import { flowerService } from './services/flowerService';
import { createNewFlower } from './lib/simulationInitializer';
import { db } from './services/db';
import { createSpeciesRuntime } from './lib/speciesRuntime';
import { initializeWasm, reportFatal } from './lib/workerWasm';
import type { WorkerRole } from './lib/asyncFlowerFactory';
import type { SimulationParams, FlowerCreationRequest, SpeciesRecordRequest, SpeciesRequest } from './types';

let simWorkerPort: MessagePort | null = null;
let currentParams: SimulationParams | null = null;

// --- Queue System for Flower Creation ---
let requestQueue: FlowerCreationRequest[] = [];
let cancellationQueue: string[] = []; // New queue for cancellation IDs
let isProcessing = false;
// The garden asks for flowers faster than the worker makes them, so "species when nothing is waiting" never came:
// after each flower, one species job goes before the next flower.
let speciesTurn = false;

// The simulation sends the parameters and the first requests as soon as it has the port, while the
// wasm service is still starting: what comes early waits for it, in the order it came.
let ready: Promise<boolean> = Promise.resolve(false);

// What the simulation asked this worker to do. Without a species worker it does the species too, as
// it did before there was one; with one, it only makes flowers.
let handlesSpecies = true;
// replaced at start when the simulation says how many species jobs to take at once
let speciesRuntime = createSpeciesRuntime(flowerService, db, 'Flower Worker');
const getSpeciesJobs = () => speciesRuntime.jobs();

/**
 * Processes the flower request queue sequentially. It first clears any
 * cancelled requests before starting a new genetics task.
 */
const processQueue = async () => {
    if (isProcessing) {
        return;
    }

    // Batch process cancellations before starting a new task
    if (cancellationQueue.length > 0) {
        const cancelledIds = new Set(cancellationQueue);
        requestQueue = requestQueue.filter(req => !cancelledIds.has(req.requestId));
        cancellationQueue = [];
    }

    const speciesWaiting = handlesSpecies && (speciesRuntime.peek()?.hasWork() ?? false);
    if (requestQueue.length === 0 || (speciesTurn && speciesWaiting)) {
        // A flower and then a species: nothing to create, or the flower that was just made has had its turn.
        // A job in hand is finished, whatever arrives meanwhile.
        if (speciesWaiting) {
            isProcessing = true;
            speciesTurn = false;
            const result = await getSpeciesJobs()!.runNext();
            if (result) simWorkerPort?.postMessage({ type: 'species-classified', payload: result });
            isProcessing = false;
            setTimeout(processQueue, 0);
            return;
        }
        isProcessing = false;
        return;
    }

    isProcessing = true;

    const request = requestQueue.shift();
    if (!request) {
        isProcessing = false;
        // Use setTimeout to avoid deep recursion and allow message queue to clear.
        setTimeout(processQueue, 0);
        return;
    }

    // From taking the request to having the flower and its image: the wait in the queue is not the worker's time.
    const startedAt = performance.now();
    const newFlower = await createNewFlower(
        flowerService,
        currentParams!,
        request.x,
        request.y,
        request.parentGenome1,
        request.parentGenome2,
        request.flowerId
    );
    const durationMs = performance.now() - startedAt;

    // After async work, check if the request was cancelled while processing.
    const wasCancelled = cancellationQueue.some(id => id === request.requestId);

    if (!wasCancelled) {
        if (newFlower) {
            simWorkerPort?.postMessage({
                type: 'flower-created',
                payload: { requestId: request.requestId, flower: newFlower, durationMs },
            });
        } else {
            simWorkerPort?.postMessage({
                type: 'flower-creation-failed',
                payload: { requestId: request.requestId },
            });
        }
    }

    speciesTurn = true;
    isProcessing = false;
    // After finishing, immediately try to process the next item.
    setTimeout(processQueue, 0);
};

// Main message handler for messages coming from the main thread (App.tsx)
self.onmessage = async (e: MessageEvent) => {
    const { type, payload } = e.data;

    switch (type) {
        case 'init-ports':
            simWorkerPort = payload.simWorkerPort;
            if (simWorkerPort) {
                // Set up listener for messages from the simulation worker
                simWorkerPort.onmessage = handleSimWorkerMessage;
            }
            handlesSpecies = !payload.roles || (payload.roles as WorkerRole[]).includes('species');
            // Next to a worker that only classifies, this one helps when it has nothing to make: it takes the
            // batches it is given, in calls of the size it was told, and leaves what one worker has to do (the
            // migration of the collection, the champions) to the one that does it.
            if (payload.speciesBatch) speciesRuntime = createSpeciesRuntime(flowerService, db, 'Flower Worker', { batchSize: payload.speciesBatch });
            const startsSpecies = payload.primarySpecies !== false;
            ready = initializeWasm(flowerService, 'Flower Worker');
            if (!(await ready)) {
                reportFatal(new Error('Flower Worker: the genetics service could not start.'));
                break;
            }
            if (handlesSpecies && startsSpecies) {
                await speciesRuntime.start();
                if (!isProcessing) processQueue();
            }
            break;
    }
};

// Handler for messages from the simulation worker via the MessageChannel
const handleSimWorkerMessage = async (e: MessageEvent) => {
    if (!(await ready)) return;
    const { type, payload } = e.data;

    switch (type) {
        case 'update-params':
            currentParams = payload;
            flowerService.setParams({ radius: currentParams!.flowerDetailRadius, numLayers: 2, P: 6.0, bias: 1.0 });
            break;

        case 'request-flower':
            if (!currentParams) {
                console.error('Flower worker received request before params were set.');
                return;
            }

            requestQueue.push(payload);
            // Don't start processing immediately if already busy. The loop will pick it up.
            if (!isProcessing) {
                processQueue();
            }
            break;

        case 'cancel-flower-request': {
            // Add to cancellation queue instead of filtering immediately
            cancellationQueue.push(payload.requestId);
            break;
        }

        case 'cancel-all-requests': {
            requestQueue = [];
            cancellationQueue = [];
            speciesRuntime.peek()?.cancelAll();
            break;
        }

        case 'species-batch':
            if (!handlesSpecies) break;
            for (const job of payload.jobs as { type: string; payload: unknown }[]) {
                if (job.type === 'classify-flower') getSpeciesJobs()?.enqueue(job.payload as SpeciesRequest);
                else if (job.type === 'record-flower') getSpeciesJobs()?.enqueueRecord(job.payload as SpeciesRecordRequest);
            }
            if (!isProcessing) processQueue();
            break;
        case 'classify-flower':
            if (!handlesSpecies) break;
            getSpeciesJobs()?.enqueue(payload as SpeciesRequest);
            if (!isProcessing) {
                processQueue();
            }
            break;

        case 'record-flower':
            if (!handlesSpecies) break;
            getSpeciesJobs()?.enqueueRecord(payload as SpeciesRecordRequest);
            if (!isProcessing) {
                processQueue();
            }
            break;
    }
};
