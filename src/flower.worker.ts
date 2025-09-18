/// <reference lib="webworker" />

import { flowerService } from './services/flowerService';
import { createNewFlower } from './lib/simulationInitializer';
import type { SimulationParams } from './types';

let simWorkerPort: MessagePort | null = null;
let currentParams: SimulationParams | null = null;

const INIT_TIMEOUT_MS = 15000;

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
            
            // Fire-and-forget to allow the worker to accept new requests immediately
            // while processing this one in the background.
            (async () => {
                const { requestId, x, y, parentGenome1, parentGenome2 } = payload;
                const newFlower = await createNewFlower(flowerService, currentParams!, x, y, parentGenome1, parentGenome2);
                
                if (newFlower) {
                    simWorkerPort?.postMessage({
                        type: 'flower-created',
                        payload: { requestId, flower: newFlower }
                    });
                } else {
                    simWorkerPort?.postMessage({
                        type: 'flower-creation-failed',
                        payload: { requestId }
                    });
                }
            })();
            break;
    }
};
