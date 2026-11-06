/// <reference lib="webworker" />

import { flowerService } from './services/flowerService';
import { db } from './services/db';
import { createSpeciesRuntime } from './lib/speciesRuntime';
import { initializeWasm } from './lib/workerWasm';
import type { SpeciesRecordRequest, SpeciesRequest } from './types';

/**
 * The species work in a thread of its own: classifying a flower takes about as long as making one,
 * and in the flower worker it had to wait for the flowers. It owns a wasm instance, the collection,
 * the migration after a classifier change and the champions; the flowers are not its work.
 */
let simWorkerPort: MessagePort | null = null;
let ready: Promise<boolean> = Promise.resolve(false);
let running = false;
// This worker has nothing else to do between two jobs, so it classifies what waits in batches: a call costs
// about 50 ms before its first flower and about 25 ms for each one, so 32 at a time is about 2.4 times as fast
// as one by one, for a call of about a second (four in a browser) that cannot be interrupted.
const SPECIES_BATCH = 32;
const SPECIES_MIGRATION_CHUNK = 30;
const runtime = createSpeciesRuntime(flowerService, db, 'Species Worker', { batchSize: SPECIES_BATCH, migrationChunk: SPECIES_MIGRATION_CHUNK });

// One job after another until nothing is left. Every job awaits the database, so the messages that
// come meanwhile are heard before the next job: a cancel-all drops what waits, and a job in hand is finished.
const run = async () => {
    if (running) return;
    running = true;
    try {
        const jobs = runtime.jobs();
        while (jobs?.hasWork()) {
            const result = await jobs.runNext();
            if (result) simWorkerPort?.postMessage({ type: 'species-classified', payload: result });
        }
    } finally {
        running = false;
    }
};

// Messages that come while the wasm service starts wait for it, in the order they came.
const handleSimWorkerMessage = async (e: MessageEvent) => {
    if (!(await ready)) return;
    const { type, payload } = e.data;
    switch (type) {
        case 'species-batch':
            // what the simulation had waiting, all at once, so the first classification call has all of it
            for (const job of payload.jobs as { type: string; payload: unknown }[]) {
                if (job.type === 'classify-flower') runtime.jobs()?.enqueue(job.payload as SpeciesRequest);
                else if (job.type === 'record-flower') runtime.jobs()?.enqueueRecord(job.payload as SpeciesRecordRequest);
            }
            run();
            break;
        case 'classify-flower':
            runtime.jobs()?.enqueue(payload as SpeciesRequest);
            run();
            break;
        case 'record-flower':
            runtime.jobs()?.enqueueRecord(payload as SpeciesRecordRequest);
            run();
            break;
        case 'cancel-all-requests':
            runtime.jobs()?.cancelAll();
            break;
    }
};

self.onmessage = async (e: MessageEvent) => {
    const { type, payload } = e.data;
    if (type !== 'init-ports') return;
    simWorkerPort = payload.simWorkerPort;
    ready = initializeWasm(flowerService, 'Species Worker');
    if (simWorkerPort) simWorkerPort.onmessage = handleSimWorkerMessage;
    if (await ready) {
        await runtime.start();
        run();
    }
};
