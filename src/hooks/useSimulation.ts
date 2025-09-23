import { useState, useEffect, useRef, useCallback } from 'react';
import type { SimulationParams, AppEvent, CellContent, ActorDelta, TickSummary } from '../types';
import { useChallengeStore } from '../stores/challengeStore';
import { eventService } from '../services/eventService';

interface UseSimulationProps {
    setIsLoading: (loading: boolean) => void;
}

export const useSimulation = ({ setIsLoading }: UseSimulationProps) => {
    const [actors, setActors] = useState<Map<string, CellContent>>(new Map());
    const [isRunning, _setIsRunning] = useState(false);
    const [isWorkerInitialized, setIsWorkerInitialized] = useState(false);
    const [workerError, setWorkerError] = useState<Error | null>(null);
    const [latestSummary, setLatestSummary] = useState<TickSummary | null>(null);
    const workerRef = useRef<Worker | null>(null);
    const flowerWorkerRef = useRef<Worker | null>(null);
    const isRunningRef = useRef(isRunning);
    const latestSummaryRef = useRef<TickSummary | null>(null);
    
    // Effect to initialize and terminate the workers
    useEffect(() => {
        const simWorker = new Worker(new URL('../simulation.worker.ts', import.meta.url), {
            type: 'module',
        });
        workerRef.current = simWorker;

        const flowerWorker = new Worker(new URL('../flower.worker.ts', import.meta.url), {
            type: 'module',
        });
        flowerWorkerRef.current = flowerWorker;

        const errorHandler = (event: ErrorEvent) => {
            console.error("A worker encountered an error:", event.message, event);
            setWorkerError(new Error(`A critical simulation component failed. Please refresh the page. Error: ${event.message}`));
            setIsLoading(false); // Stop loading on error
        };
        simWorker.onerror = errorHandler;
        flowerWorker.onerror = errorHandler;

        const channel = new MessageChannel();
        simWorker.postMessage({ type: 'init-ports', payload: { flowerWorkerPort: channel.port1 } }, [channel.port1]);
        flowerWorker.postMessage({ type: 'init-ports', payload: { simWorkerPort: channel.port2 } }, [channel.port2]);
        
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
            flowerWorker.terminate();
            workerRef.current = null;
            flowerWorkerRef.current = null;
            setIsWorkerInitialized(false);
        };
    }, [setIsLoading]);

    const resetWithNewParams = useCallback((params: SimulationParams) => {
        workerRef.current?.postMessage({ type: 'update-params', payload: params });
        latestSummaryRef.current = null;
        setLatestSummary(null);
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

    return { actors, isRunning, setIsRunning, workerRef, resetWithNewParams, isWorkerInitialized, latestSummaryRef, workerError, latestSummary };
};
