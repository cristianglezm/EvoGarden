import { useState, useEffect, useRef, useCallback } from 'react';
import type { Grid, SimulationParams, AppEvent } from '../types';
import { useChallengeStore } from '../stores/challengeStore';
import { useAnalyticsStore } from '../stores/analyticsStore';
import { eventService } from '../services/eventService';

interface UseSimulationProps {
    setIsLoading: (loading: boolean) => void;
}

export const useSimulation = ({ setIsLoading }: UseSimulationProps) => {
    const [grid, setGrid] = useState<Grid>([]);
    const [isRunning, _setIsRunning] = useState(false);
    const [isWorkerInitialized, setIsWorkerInitialized] = useState(false);
    const workerRef = useRef<Worker | null>(null);
    const isRunningRef = useRef(isRunning);
    
    // Effect to initialize and terminate the worker
    useEffect(() => {
        // Create the worker
        const worker = new Worker(new URL('../simulation.worker.ts', import.meta.url), {
            type: 'module',
        });
        workerRef.current = worker;
        setIsWorkerInitialized(true);
        
        // Listen for messages from the worker
        worker.onmessage = (e: MessageEvent) => {
            const { type, payload } = e.data;
            switch (type) {
                case 'gridUpdate':
                    setGrid(payload.grid);
                    break;
                case 'events-batch': {
                    const { events, summary } = payload;
                    useChallengeStore.getState().processTick(summary);
                    useAnalyticsStore.getState().addDataPoint(summary);
                    for (const event of (events as AppEvent[])) {
                        // Enrich event with the tick number from the summary
                        eventService.dispatch({ ...event, tick: summary.tick });
                    }
                    break;
                }
                case 'load-complete':
                    // This message now carries the grid state.
                    // We update the grid and signal that loading is finished
                    // in the same event handler to prevent race conditions.
                    if (payload?.grid) {
                        setGrid(payload.grid);
                    }
                    setIsLoading(false);
                    break;
                case 'initialized':
                    // This is a signal that the worker is ready and has sent its initial grid.
                    // We can now hide the main loading screen.
                    setIsLoading(false);
                    break;
                // Note: 'state-response' is handled by a separate listener in App.tsx
                // to avoid re-renders of the entire simulation hook.
            }
        };

        // Cleanup: terminate the worker when the component unmounts
        return () => {
            worker.terminate();
            workerRef.current = null;
            setIsWorkerInitialized(false);
        };
    }, [setIsLoading]);

    // Explicit function to reset the simulation with new parameters
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

    return { grid, isRunning, setIsRunning, workerRef, resetWithNewParams, isWorkerInitialized };
};
