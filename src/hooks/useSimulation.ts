import { useState, useEffect, useRef, useCallback } from 'react';
import type { SimulationParams, AppEvent, CellContent, ActorDelta } from '../types';
import { useChallengeStore } from '../stores/challengeStore';
import { useAnalyticsStore } from '../stores/analyticsStore';
import { eventService } from '../services/eventService';

interface UseSimulationProps {
    setIsLoading: (loading: boolean) => void;
}

export const useSimulation = ({ setIsLoading }: UseSimulationProps) => {
    const [actors, setActors] = useState<Map<string, CellContent>>(new Map());
    const [isRunning, _setIsRunning] = useState(false);
    const [isWorkerInitialized, setIsWorkerInitialized] = useState(false);
    const workerRef = useRef<Worker | null>(null);
    const isRunningRef = useRef(isRunning);
    
    // Effect to initialize and terminate the worker
    useEffect(() => {
        const worker = new Worker(new URL('../simulation.worker.ts', import.meta.url), {
            type: 'module',
        });
        workerRef.current = worker;
        setIsWorkerInitialized(true);
        
        worker.onmessage = (e: MessageEvent) => {
            const { type, payload } = e.data;
            switch (type) {
                case 'init-complete':
                case 'load-complete': {
                    const newActors = new Map<string, CellContent>();
                    payload.grid.flat(2).forEach((actor: CellContent) => {
                        if (actor) newActors.set(actor.id, actor);
                    });
                    setActors(newActors);
                    setIsLoading(false);
                    break;
                }
                case 'tick-update': {
                    const { deltas, events, summary } = payload;

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
                    useAnalyticsStore.getState().addDataPoint(summary);
                    for (const event of (events as AppEvent[])) {
                        eventService.dispatch({ ...event, tick: summary.tick });
                    }
                    break;
                }
            }
        };

        return () => {
            worker.terminate();
            workerRef.current = null;
            setIsWorkerInitialized(false);
        };
    }, [setIsLoading]);

    const resetWithNewParams = useCallback((params: SimulationParams) => {
        workerRef.current?.postMessage({ type: 'update-params', payload: params });
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

    return { actors, isRunning, setIsRunning, workerRef, resetWithNewParams, isWorkerInitialized };
};
