import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { SimulationView } from './components/SimulationView';
import { Controls } from './components/Controls';
import { FlowerDetailsPanel } from './components/FlowerDetailsPanel';
import type { Flower, SimulationParams } from './types';
import { DEFAULT_SIM_PARAMS } from './constants';
import { LogoIcon, SettingsIcon, XIcon, LoaderIcon, TrophyIcon } from './components/icons';
import { useSimulation } from './hooks/useSimulation';
import { ToastContainer } from './components/ToastContainer';
import { flowerService } from './services/flowerService';
import { useToastStore } from './stores/toastStore';
import { DataPanel } from './components/DataPanel';
import { useAnalyticsStore } from './stores/analyticsStore';

const SAVE_KEY = 'evoGarden-savedState';
const INIT_TIMEOUT_MS = 15000; // 15 seconds for initialization and loading

export default function App(): React.ReactNode {
  const [params, setParams] = useState<SimulationParams>(DEFAULT_SIM_PARAMS);
  const [selectedFlowerId, setSelectedFlowerId] = useState<string | null>(null);
  const [isControlsOpen, setIsControlsOpen] = useState(false);
  const [isDataPanelOpen, setIsDataPanelOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSavedState, setHasSavedState] = useState(false);
  const [isServiceInitialized, setIsServiceInitialized] = useState(false);
  const wasRunningBeforeSelectionRef = useRef(false);

  // Refs for "click outside" logic
  const detailsPanelRef = useRef<HTMLDivElement>(null);
  const controlsButtonRef = useRef<HTMLButtonElement>(null);
  const controlsPanelRef = useRef<HTMLDivElement>(null);
  const simulationViewRef = useRef<HTMLDivElement>(null);


  const { grid, isRunning, setIsRunning, workerRef, resetWithNewParams, isWorkerInitialized } = useSimulation({ setIsLoading });

  // Check for a saved state on initial load
  useEffect(() => {
    setHasSavedState(!!localStorage.getItem(SAVE_KEY));
  }, []);
  
  // Effect for one-time WASM initialization and auto-loading/initialization.
  useEffect(() => {
    // This effect should only run once, when the worker is created and ready to receive messages.
    if (!isWorkerInitialized) {
        return;
    }

    const initAndLoad = async () => {
        try {
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error("Initialization timed out.")), INIT_TIMEOUT_MS)
            );

            // Race the main thread WASM initialization against the timeout
            await Promise.race([flowerService.initialize(), timeoutPromise]);
            setIsServiceInitialized(true);

            // The listener for 'initialized' or 'load-complete' is now inside the useSimulation hook,
            // which will set isLoading to false at the appropriate time.

            const savedStateJSON = localStorage.getItem(SAVE_KEY);
            if (savedStateJSON) {
                const savedState = JSON.parse(savedStateJSON);
                workerRef.current!.postMessage({ type: 'load-state', payload: savedState });
                // Sync main thread state immediately
                setParams(savedState.params);
                setIsRunning(false);
                setSelectedFlowerId(null);
                useToastStore.getState().addToast({ message: 'Loaded last saved garden!', type: 'info' });
            } else {
                // Initialize with default params
                workerRef.current!.postMessage({ type: 'update-params', payload: DEFAULT_SIM_PARAMS });
                setParams(DEFAULT_SIM_PARAMS);
            }
        } catch (err) {
            console.error("Failed to initialize on main thread:", err);
            setError("Failed to load core simulation components. This could be due to a network issue or an unsupported browser. Please refresh the page to try again.");
            setIsLoading(false);
        }
    };

    initAndLoad();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isWorkerInitialized]); // Depend on a state variable, which is safe.

  // Effect to sync the main-thread flower service with params, needed for 3D viewer.
  useEffect(() => {
      if (isServiceInitialized) {
        flowerService.setParams({ radius: params.flowerDetailRadius, numLayers: 2, P: 6.0, bias: 1.0 });
      }
  }, [params.flowerDetailRadius, isServiceInitialized]);


  const selectedFlower = useMemo(() => {
    if (!selectedFlowerId || !grid) return null;
    for (const row of grid) {
        for (const cell of row) {
            const flower = cell.find(
                (entity): entity is Flower => entity.type === 'flower' && entity.id === selectedFlowerId
            );
            if (flower) {
                return flower;
            }
        }
    }
    return null;
  }, [selectedFlowerId, grid]);

  const handleParamsChange = (newParams: SimulationParams) => {
    setIsRunning(false); // Stop the simulation on reset
    setParams(newParams);
    resetWithNewParams(newParams); // Explicitly tell the worker to reset
    setSelectedFlowerId(null);
    setIsControlsOpen(false); // Close panel on apply
    useAnalyticsStore.getState().reset(); // Reset analytics data
  };
  
  const handleSelectFlower = useCallback((flower: Flower | null) => {
    setSelectedFlowerId(flower?.id ?? null);
    if (flower) {
        // A flower is selected. Store the current running state and then pause.
        wasRunningBeforeSelectionRef.current = isRunning;
        setIsRunning(false);
    } else {
        // Deselecting. If the simulation was running before, resume it.
        if (wasRunningBeforeSelectionRef.current) {
            setIsRunning(true);
        }
    }
  }, [isRunning, setIsRunning]);

  // Effect to handle clicking outside of the details panel to close it.
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
        if (!selectedFlowerId) return; // Only run if a flower is selected

        const isClickInsideDetails = detailsPanelRef.current?.contains(event.target as Node);
        const isClickInsideControlsButton = controlsButtonRef.current?.contains(event.target as Node);
        const isClickInsideControlsPanel = controlsPanelRef.current?.contains(event.target as Node);
        const isClickInsideSimulationView = simulationViewRef.current?.contains(event.target as Node);

        // If the click is on the canvas, its own handler will manage selection/deselection.
        // If the click is inside any other interactive panel, do nothing.
        if (isClickInsideSimulationView || isClickInsideDetails || isClickInsideControlsButton || isClickInsideControlsPanel) {
            return;
        }

        // Otherwise, the click was outside all interactive areas, so deselect the flower.
        handleSelectFlower(null);
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
        document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [selectedFlowerId, handleSelectFlower]);

  const handleSaveSimulation = useCallback(() => {
    if (!workerRef.current || isSaving) return;
    
    setIsSaving(true);
    setIsRunning(false); // Pause simulation to get a stable state

    const messageHandler = (e: MessageEvent) => {
        if (e.data.type === 'state-response') {
            const stateToSave = e.data.payload;
            localStorage.setItem(SAVE_KEY, JSON.stringify(stateToSave));
            setHasSavedState(true);
            useToastStore.getState().addToast({ message: 'Garden state saved!', type: 'success' });
            
            // Clean up the listener
            workerRef.current?.removeEventListener('message', messageHandler);
            setIsSaving(false);
        }
    };
    
    workerRef.current.addEventListener('message', messageHandler);
    workerRef.current.postMessage({ type: 'get-state' });

  }, [workerRef, setIsRunning, isSaving]);

  const handleLoadSimulation = useCallback(() => {
    const savedStateJSON = localStorage.getItem(SAVE_KEY);
    if (savedStateJSON && workerRef.current) {
        setIsLoading(true); // Show the full-screen loader
        
        const savedState = JSON.parse(savedStateJSON);
        workerRef.current.postMessage({ type: 'load-state', payload: savedState });

        // Sync main thread state
        setParams(savedState.params);
        setIsRunning(false);
        setSelectedFlowerId(null);
        setIsControlsOpen(false); // Close panel on load
        useToastStore.getState().addToast({ message: 'Loaded last saved garden!', type: 'info' });

    } else {
        useToastStore.getState().addToast({ message: 'No saved state found.', type: 'error' });
    }
  }, [workerRef, setIsRunning]);


  if (error) {
    return (
      <div className="min-h-screen bg-background text-accent-red flex items-center justify-center p-4 text-center">
        <h1 className="text-2xl">{error}</h1>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background text-primary flex flex-col items-center justify-center">
        <LoaderIcon className="w-16 h-16 text-tertiary animate-spin" />
        <p className="mt-4 text-xl">Initializing EvoGarden...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-primary flex flex-col font-sans relative overflow-hidden">
      <header className="bg-background p-2 shadow-lg flex items-center justify-between z-10">
        <div className="flex items-center space-x-3">
          <LogoIcon className="h-8 w-8 text-tertiary" />
          <h1 className="text-2xl font-bold tracking-wider text-tertiary">Evo<span className="text-accent">Garden</span></h1>
        </div>
      </header>
      
      <main className="grow flex flex-col lg:flex-row p-4 gap-4 bg-surface">
        {selectedFlower && (
          <aside ref={detailsPanelRef} className="w-full lg:w-96 shrink-0">
            <FlowerDetailsPanel 
              flower={selectedFlower} 
              isRunning={isRunning}
              setIsRunning={setIsRunning}
            />
          </aside>
        )}
        
        <div ref={simulationViewRef} className="grow flex flex-col h-full">
          <SimulationView 
            params={params}
            grid={grid}
            onSelectFlower={handleSelectFlower}
            selectedFlowerId={selectedFlowerId}
          />
        </div>
      </main>

       {/* UI Buttons */}
      <div className="fixed top-20 right-4 z-20 flex flex-col space-y-2">
            <button
                ref={controlsButtonRef}
                onClick={() => setIsControlsOpen(true)}
                className="p-3 bg-tertiary/80 hover:bg-tertiary text-surface rounded-md shadow-lg transition-colors duration-200"
                aria-label="Open controls panel"
                title="Open Controls"
            >
                <SettingsIcon className="w-6 h-6" />
            </button>
             <button
                onClick={() => setIsDataPanelOpen(true)}
                className="p-3 bg-tertiary/80 hover:bg-tertiary text-surface rounded-md shadow-lg transition-colors duration-200"
                aria-label="Open data panel"
                title="Open Challenges & Analytics"
            >
                <TrophyIcon className="w-6 h-6" />
            </button>
      </div>
      
      <DataPanel isOpen={isDataPanelOpen} onClose={() => setIsDataPanelOpen(false)} />

      {/* Controls Panel Overlay */}
      <div 
        className={`fixed inset-0 bg-black/50 z-30 transition-opacity duration-300 ${isControlsOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={() => setIsControlsOpen(false)}
      ></div>
      
      {/* Controls Panel Content */}
      <aside ref={controlsPanelRef} className={`fixed top-0 right-0 h-full bg-surface z-40 transition-transform duration-300 ease-in-out ${isControlsOpen ? 'translate-x-0' : 'translate-x-full'} w-full max-w-sm`}>
         <div className="h-full flex flex-col">
            <header className="flex items-center justify-between p-2 bg-background">
                 <h2 className="text-xl font-bold text-primary-light ml-2">Controls</h2>
                 <button 
                    onClick={() => setIsControlsOpen(false)} 
                    className="p-1 text-primary-light hover:bg-black/20 rounded-full"
                    aria-label="Close controls panel"
                >
                    <XIcon className="w-6 h-6" />
                </button>
            </header>
            <div className="p-4 overflow-y-auto">
                <Controls 
                    params={params} 
                    onParamsChange={handleParamsChange} 
                    isRunning={isRunning}
                    setIsRunning={setIsRunning}
                    onSave={handleSaveSimulation}
                    onStart={() => setIsControlsOpen(false)}
                    onLoad={handleLoadSimulation}
                    hasSavedState={hasSavedState}
                    isSaving={isSaving}
                />
            </div>
         </div>
      </aside>

      <ToastContainer />
    </div>
  );
}
