/// <reference lib="webworker" />

import { SimulationEngine } from './lib/simulationEngine';
import { flowerService } from './services/flowerService';
import { TICK_RATE_MS } from './constants';
import type { SimulationParams } from './types';

let isRunning = false;
let gameLoopTimeoutId: number | undefined;
let engine: SimulationEngine | null = null;
let isLoadingState = false;

const INIT_TIMEOUT_MS = 15000; // Match the main thread timeout

const initializeWasm = async (): Promise<boolean> => {
    try {
        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Worker WASM Initialization timed out.")), INIT_TIMEOUT_MS)
        );
        await Promise.race([flowerService.initialize(), timeoutPromise]);
        return true;
    } catch (error) {
        console.error("Worker: FEService initialization failed.", error);
        self.postMessage({ type: 'toast', payload: { message: 'Simulation engine failed to load.', type: 'error' } });
        return false;
    }
};

const gameLoop = async () => {
    if (!isRunning || !engine) return;

    const { events, summary, deltas } = await engine.calculateNextTick();

    self.postMessage({ type: 'tick-update', payload: { deltas, events, summary } });

    gameLoopTimeoutId = self.setTimeout(gameLoop, TICK_RATE_MS);
};

self.onmessage = async (e: MessageEvent) => {
    const { type, payload } = e.data;
    switch (type) {
        case 'update-params':
            if (isLoadingState) return;
            isRunning = false;
            if (gameLoopTimeoutId) clearTimeout(gameLoopTimeoutId);
            
            if (!engine) {
                if (!(await initializeWasm())) return;
                engine = new SimulationEngine(payload as SimulationParams, flowerService);
            } else {
                engine.setParams(payload as SimulationParams);
            }
            
            await engine.initializeGrid();
            self.postMessage({ type: 'init-complete', payload: engine.getGridState() });
            break;

        case 'start':
            if (!isRunning) {
                isRunning = true;
                gameLoop();
            }
            break;

        case 'pause':
            isRunning = false;
            if (gameLoopTimeoutId) clearTimeout(gameLoopTimeoutId);
            break;

        case 'get-state':
            if (engine) {
                const stateToSave = engine.getStateForSave();
                self.postMessage({ type: 'state-response', payload: stateToSave });
            }
            break;

        case 'load-state':
             isLoadingState = true;
             isRunning = false;
             if (gameLoopTimeoutId) clearTimeout(gameLoopTimeoutId);
             
             if (!engine) {
                 if (!(await initializeWasm())) {
                     isLoadingState = false;
                     return;
                 }
                 engine = new SimulationEngine(payload.params, flowerService);
             }
             
             await engine.loadState(payload);
             
             self.postMessage({ type: 'load-complete', payload: engine.getGridState() });
             isLoadingState = false;
            break;
    }
};
