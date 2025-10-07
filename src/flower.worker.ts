/// <reference lib="webworker" />

import { flowerService } from './services/flowerService';
import { createNewFlower } from './lib/simulationInitializer';
import type { SimulationParams, FlowerCreationRequest } from './types';

let simWorkerPort: MessagePort | null = null;
let currentParams: SimulationParams | null = null;

const INIT_TIMEOUT_MS = 15000;

// --- Queue System for Flower Creation ---
let requestQueue: FlowerCreationRequest[] = [];
let cancellationQueue: string[] = []; // New queue for cancellation IDs
let isProcessing = false;

// Initialize the WASM service for this worker thread.
const initializeWasm = async (): Promise<boolean> => {
    try {
        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Flower Worker WASM Initialization timed out.")), INIT_TIMEOUT_MS)
        );
        await Promise.race([flowerService.initialize(), timeoutPromise]);
        return true;
    } catch (error) {
        console.error("Flower Worker: FEService initialization failed.", error);
        return false;
    }
};

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

    if (requestQueue.length === 0) {
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
    
    const newFlower = await createNewFlower(flowerService, currentParams!, request.x, request.y, request.parentGenome1, request.parentGenome2, request.flowerId);
    
    // After async work, check if the request was cancelled while processing.
    const wasCancelled = cancellationQueue.some(id => id === request.requestId);

    if (!wasCancelled) {
        if (newFlower) {
            simWorkerPort?.postMessage({
                type: 'flower-created',
                payload: { requestId: request.requestId, flower: newFlower }
            });
        } else {
            simWorkerPort?.postMessage({
                type: 'flower-creation-failed',
                payload: { requestId: request.requestId }
            });
        }
    }
    
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
            await initializeWasm();
            break;
    }
};

// Handler for messages from the simulation worker via the MessageChannel
const handleSimWorkerMessage = (e: MessageEvent) => {
    const { type, payload } = e.data;
    
    switch (type) {
        case 'update-params':
            currentParams = payload;
            flowerService.setParams({ radius: currentParams!.flowerDetailRadius, numLayers: 2, P: 6.0, bias: 1.0 });
            break;

        case 'request-flower':
            if (!currentParams) {
                console.error("Flower worker received request before params were set.");
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
            break;
        }
    }
};