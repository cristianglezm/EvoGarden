import { useState, useEffect, useRef, useCallback } from 'react';
import type { SimulationParams, AppEvent, CellContent, ActorDelta, TickSummary, Coord } from '../types';
import { useChallengeStore } from '../stores/challengeStore';
import { eventService } from '../services/eventService';
import { planWorkers } from '../lib/workerPlan';
import { readWorkerSetting } from '../lib/workerSetting';
import { SPECIES_BATCH_HELPER } from '../lib/asyncFlowerFactory';

interface UseSimulationProps {
    setIsLoading: (loading: boolean) => void;
}

// Some contexts refuse to give out localStorage at all: the player's choice is then just not read.
const browserStorage = (): Storage | undefined => {
    try {
        return window.localStorage;
    } catch {
        return undefined;
    }
};

export const useSimulation = ({ setIsLoading }: UseSimulationProps) => {
    const [actors, setActors] = useState<Map<string, CellContent>>(new Map());
    const [isRunning, _setIsRunning] = useState(false);
    const [isWorkerInitialized, setIsWorkerInitialized] = useState(false);
    const [workerError, setWorkerError] = useState<Error | null>(null);
    const [latestSummary, setLatestSummary] = useState<TickSummary | null>(null);
    const workerRef = useRef<Worker | null>(null);
    const flowerWorkersRef = useRef<Worker[]>([]);
    const speciesWorkerRef = useRef<Worker | null>(null);
    const isRunningRef = useRef(isRunning);
    const latestSummaryRef = useRef<TickSummary | null>(null);
    
    // Effect to initialize and terminate the workers
    useEffect(() => {
        const simWorker = new Worker(new URL('../simulation.worker.ts', import.meta.url), {
            type: 'module',
        });
        workerRef.current = simWorker;

        // The species work has a worker of its own when there are cores for it; without it the first worker
        // that makes flowers does it too, a flower and then a species.
        const { speciesWorker: wantsSpeciesWorker, creationWorkers } = planWorkers({ hardwareConcurrency: navigator.hardwareConcurrency, search: window.location.search, workers: readWorkerSetting(browserStorage()) });

        const errorHandler = (event: ErrorEvent) => {
            console.error("A worker encountered an error:", event.message, event);
            setWorkerError(new Error(`A critical simulation component failed. Please refresh the page. Error: ${event.message}`));
            setIsLoading(false); // Stop loading on error
        };
        simWorker.onerror = errorHandler;

        // Each worker has a channel of its own to the simulation worker, which keeps the one queue of requests.
        // The URL has to be written inside `new Worker(...)`: that is the only form Vite compiles into a worker.
        // Passed to a helper it is copied as a TypeScript file the browser cannot run (scripts/checkBuild.mjs checks it).
        const connect = (worker: Worker) => {
            worker.onerror = errorHandler;
            return { worker, channel: new MessageChannel() };
        };
        const flowers = Array.from({ length: creationWorkers }, () =>
            connect(new Worker(new URL('../flower.worker.ts', import.meta.url), { type: 'module' })));
        const species = wantsSpeciesWorker
            ? connect(new Worker(new URL('../species.worker.ts', import.meta.url), { type: 'module' }))
            : null;
        flowerWorkersRef.current = flowers.map(f => f.worker);
        speciesWorkerRef.current = species?.worker ?? null;

        const simPorts = [...flowers.map(f => f.channel.port1), ...(species ? [species.channel.port1] : [])];
        simWorker.postMessage({
            type: 'init-ports',
            payload: { flowerWorkerPorts: flowers.map(f => f.channel.port1), ...(species && { speciesWorkerPort: species.channel.port1 }) },
        }, simPorts);
        flowers.forEach(({ worker, channel }, i) => {
            // Without a species worker the first one keeps all the roles, which is what a worker does without `roles`.
            // Next to one, every flower worker classifies when it has nothing to make, in small batches, and leaves
            // the migration and the champions to the species worker.
            const alone = !species && i === 0;
            const payload = species
                ? { simWorkerPort: channel.port2, roles: ['creation', 'species'], speciesBatch: SPECIES_BATCH_HELPER, primarySpecies: false }
                : { simWorkerPort: channel.port2, ...(!alone && { roles: ['creation'] }) };
            worker.postMessage({ type: 'init-ports', payload }, [channel.port2]);
        });
        species?.worker.postMessage({ type: 'init-ports', payload: { simWorkerPort: species.channel.port2 } }, [species.channel.port2]);
        
        setIsWorkerInitialized(true);
        
        simWorker.onmessage = (e: MessageEvent) => {
            const { type, payload } = e.data;
            switch (type) {
                case 'init-complete':
                case 'load-complete': {
                    const newActors = new Map<string, CellContent>();
                    payload.grid.flat(2).forEach((actor: CellContent) => {
                        if (actor) newActors.set(actor.id, actor);
                    });
                    setActors(newActors);
                    setLatestSummary(null);
                    setIsLoading(false);
                    break;
                }
                case 'tick-update': {
                    const { deltas, events, summary } = payload;
                    
                    latestSummaryRef.current = summary;
                    setLatestSummary(summary);

                    setActors(currentActors => {
                        const newActors = new Map(currentActors);
                        for (const delta of (deltas as ActorDelta[])) {
                            switch (delta.type) {
                                case 'add':
                                    newActors.set(delta.actor.id, delta.actor);
                                    break;
                                case 'remove':
                                    newActors.delete(delta.id);
                                    break;
                                case 'update': {
                                    const actorToUpdate = newActors.get(delta.id);
                                    if (actorToUpdate) {
                                        newActors.set(delta.id, { ...actorToUpdate, ...delta.changes } as CellContent);
                                    }
                                    break;
                                }
                            }
                        }
                        return newActors;
                    });
                    
                    useChallengeStore.getState().processTick(summary);
                    for (const event of (events as AppEvent[])) {
                        eventService.dispatch({ ...event, tick: summary.tick });
                    }
                    break;
                }
            }
        };

        return () => {
            simWorker.terminate();
            flowers.forEach(({ worker }) => worker.terminate());
            species?.worker.terminate();
            workerRef.current = null;
            flowerWorkersRef.current = [];
            speciesWorkerRef.current = null;
            setIsWorkerInitialized(false);
        };
    }, [setIsLoading]);

    const resetWithNewParams = useCallback((params: SimulationParams) => {
        workerRef.current?.postMessage({ type: 'update-params', payload: params });
        latestSummaryRef.current = null;
        setLatestSummary(null);
    }, []);
    
    const updateLiveParams = useCallback((params: SimulationParams) => {
        workerRef.current?.postMessage({ type: 'set-live-params', payload: params });
    }, []);


    const setIsRunning = (running: React.SetStateAction<boolean>) => {
        const newIsRunning = typeof running === 'function' ? running(isRunningRef.current) : running;
        isRunningRef.current = newIsRunning;
        _setIsRunning(newIsRunning);

        if (newIsRunning) {
            workerRef.current?.postMessage({ type: 'start' });
        } else {
            workerRef.current?.postMessage({ type: 'pause' });
        }
    };

    const triggerWeatherEvent = useCallback((eventType: 'heatwave' | 'coldsnap' | 'heavyrain' | 'drought') => {
        workerRef.current?.postMessage({ type: 'trigger-weather', payload: { eventType } });
    }, []);

    const introduceSpecies = useCallback((emoji: string, count: number) => {
        workerRef.current?.postMessage({ type: 'introduce-species', payload: { emoji, count } });
    }, []);

    const introduceStationary = useCallback((actorType: 'hive' | 'antColony', count: number) => {
        workerRef.current?.postMessage({ type: 'introduce-stationary', payload: { actorType, count } });
    }, []);
    
    const plantChampionSeed = useCallback((genome: string, sex: 'male' | 'female' | 'both', position: Coord) => {
        workerRef.current?.postMessage({ type: 'plant-champion-seed', payload: { genome, sex, position } });
    }, []);

    return { actors, isRunning, setIsRunning, workerRef, resetWithNewParams, updateLiveParams, isWorkerInitialized, latestSummaryRef, workerError, latestSummary, triggerWeatherEvent, introduceSpecies, introduceStationary, plantChampionSeed };
};
