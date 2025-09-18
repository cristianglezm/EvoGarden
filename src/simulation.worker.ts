/// <reference lib="webworker" />

import { SimulationEngine } from './lib/simulationEngine';
import { flowerService } from './services/flowerService';
import { TICK_RATE_MS } from './constants';
import type { SimulationParams, Flower } from './types';
import { createNewFlower, createInitialMobileActors } from './lib/simulationInitializer';

let isRunning = false;
let gameLoopTimeoutId: number | undefined;
let engine: SimulationEngine | null = null;
let isLoadingState = false;
let flowerWorkerPort: MessagePort | null = null;

const INIT_TIMEOUT_MS = 15000;

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

const handleFlowerWorkerMessage = (e: MessageEvent) => {
    if (engine) {
        engine.handleFlowerWorkerMessage(e.data);
    }
};

self.onmessage = async (e: MessageEvent) => {
    const { type, payload } = e.data;
    switch (type) {
        case 'init-ports':
            flowerWorkerPort = payload.flowerWorkerPort;
            if (flowerWorkerPort) {
                flowerWorkerPort.onmessage = handleFlowerWorkerMessage;
            }
            break;
        case 'update-params':
            if (isLoadingState) return;
            isRunning = false;
            if (gameLoopTimeoutId) clearTimeout(gameLoopTimeoutId);

            if (!engine) {
                if (!(await initializeWasm())) return;
                engine = new SimulationEngine(payload as SimulationParams, flowerService);
                const stem = await flowerService.makeStem();
                engine.setStemImage(stem.image);
            } else {
                engine.setParams(payload as SimulationParams);
            }

            if (flowerWorkerPort) {
                engine.setFlowerWorkerPort(flowerWorkerPort, payload);
            } else {
                console.error("Simulation worker could not set flower worker port on engine.");
            }
            
            const params = payload as SimulationParams;
            const flowerPromises = Array.from({ length: params.initialFlowers }, () => 
                createNewFlower(flowerService, params, -1, -1)
            );
            const initialFlowers = (await Promise.all(flowerPromises)).filter((f): f is Flower => f !== null);
            const initialMobileActors = createInitialMobileActors(params);
            
            // Get all possible grid coordinates
            const allCoords: { x: number; y: number }[] = [];
            for (let y = 0; y < params.gridHeight; y++) {
                for (let x = 0; x < params.gridWidth; x++) {
                    allCoords.push({ x, y });
                }
            }
            
            // Shuffle coordinates to randomize placement
            for (let i = allCoords.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [allCoords[i], allCoords[j]] = [allCoords[j], allCoords[i]];
            }

            // Assign unique coordinates to flowers, truncating if necessary
            if (initialFlowers.length > allCoords.length) {
                console.warn(`Attempting to spawn ${initialFlowers.length} flowers on a ${allCoords.length}-cell grid. Capping at grid size.`);
                initialFlowers.splice(allCoords.length);
            }
            initialFlowers.forEach((flower, index) => {
                const coord = allCoords[index];
                flower.x = coord.x;
                flower.y = coord.y;
            });

            // Assign random coordinates to mobile actors (can overlap)
            initialMobileActors.forEach(actor => {
                actor.x = Math.floor(Math.random() * params.gridWidth);
                actor.y = Math.floor(Math.random() * params.gridHeight);
            });
            
            const allActors = [...initialFlowers, ...initialMobileActors];
            
            engine.initializeGridWithActors(allActors);
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
             
             if (flowerWorkerPort) {
                engine.setFlowerWorkerPort(flowerWorkerPort, payload.params);
             } else {
                console.error("Simulation worker could not set flower worker port on engine during load.");
             }
             
             // Generate the stem image directly in this worker to avoid deadlocks
             const stemForLoad = await flowerService.makeStem();
             engine.setStemImage(stemForLoad.image);

             await engine.loadState(payload);
             
             self.postMessage({ type: 'load-complete', payload: engine.getGridState() });
             isLoadingState = false;
            break;
    }
};
