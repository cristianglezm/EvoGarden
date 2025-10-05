import React, { useState, useCallback, useEffect, useRef } from 'react';
import { SimulationView } from './components/SimulationView';
import { Controls } from './components/Controls';
import { FlowerDetailsPanel } from './components/FlowerDetailsPanel';
import type { CellContent, Flower, SimulationParams, Grid, Insect, Cockroach } from './types';
import { DEFAULT_SIM_PARAMS } from './constants';
import { LogoIcon, SettingsIcon, XIcon, LoaderIcon, TrophyIcon, GitHubIcon } from './components/icons';
import { useSimulation } from './hooks/useSimulation';
import { useActorTracker } from './hooks/useActorTracker';
import { ToastContainer } from './components/ToastContainer';
import { flowerService } from './services/flowerService';
import { eventService } from './services/eventService';
import { DataPanel } from './components/DataPanel';
import { useAnalyticsStore } from './stores/analyticsStore';
import { db } from './services/db';
import { useEventLogStore } from './stores/eventLogStore';
import { FullEventLogPanel } from './components/FullEventLogPanel';
import { ActorSelectionPanel } from './components/ActorSelectionPanel';
import { InsectDetailsPanel } from './components/InsectDetailsPanel';
import { EggDetailsPanel } from './components/EggDetailsPanel';
import { GenericActorDetailsPanel } from './components/GenericActorDetailsPanel';
import { StatusPanel } from './components/StatusPanel';

const META_SAVE_KEY = 'evoGarden-savedState-meta';
const INIT_TIMEOUT_MS = 15000; // 15 seconds for initialization and loading

/**
 * Rehydrates the simulation grid by fetching detailed actor data (flowers, insects)
 * from IndexedDB and merging it with the placeholder data from the metadata.
 * This supports backward compatibility with older save files that stored full actor data
 * in localStorage.
 * @param metadata The saved state metadata from localStorage.
 * @returns A promise that resolves to the fully rehydrated grid.
 */
const rehydrateGrid = async (metadata: any): Promise<Grid> => {
    const flowers = await db.savedFlowers.toArray();
    const insects = await db.savedInsects.toArray();

    const hasFlowerPlaceholders = metadata.grid.flat(2).some((a: any) => a.type === 'flower' && a.genome === undefined);
    if (flowers.length === 0 && hasFlowerPlaceholders) {
        throw new Error("Metadata found, but no flowers in the database. Save file may be corrupt.");
    }
    
    const hasInsectPlaceholders = metadata.grid.flat(2).some((a: any) => a.type === 'insect' && a.lifespan === undefined);
    if (insects.length === 0 && hasInsectPlaceholders) {
        throw new Error("Metadata found, but no insects in the database. Save file may be corrupt.");
    }

    const actorMap = new Map<string, CellContent>([
        ...flowers.map((f): [string, CellContent] => [f.id, f]),
        ...insects.map((i): [string, CellContent] => [i.id, i])
    ]);

    return metadata.grid.map((row: CellContent[][]) => 
        row.map((cell: CellContent[]) => 
            cell.map((actor: CellContent) => {
                // Only rehydrate placeholders to maintain compatibility with old saves
                if ((actor.type === 'flower' && (actor as Flower).genome === undefined) || (actor.type === 'insect' && (actor as Insect).lifespan === undefined)) {
                    return actorMap.get(actor.id) || null;
                }
                return actor;
            }).filter((actor): actor is CellContent => actor !== null)
        )
    );
};


export default function App(): React.ReactNode {
  const [params, setParams] = useState<SimulationParams>(DEFAULT_SIM_PARAMS);
  const [selectedActor, setSelectedActor] = useState<CellContent | null>(null);
  const [actorsInSelectedCell, setActorsInSelectedCell] = useState<CellContent[]>([]);
  const [isControlsOpen, setIsControlsOpen] = useState(false);
  const [isDataPanelOpen, setIsDataPanelOpen] = useState(false);
  const [isFullLogOpen, setIsFullLogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingMessage, setLoadingMessage] = useState('Initializing EvoGarden...');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSavedState, setHasSavedState] = useState(false);
  const [isServiceInitialized, setIsServiceInitialized] = useState(false);
  const wasRunningBeforeSelectionRef = useRef(false);
  const wasRunningBeforeLogRef = useRef(false);

  // Refs for "click outside" logic
  const detailsPanelRef = useRef<HTMLDivElement>(null);
  const controlsButtonRef = useRef<HTMLButtonElement>(null);
  const controlsPanelRef = useRef<HTMLDivElement>(null);
  const simulationViewRef = useRef<HTMLDivElement>(null);
  const paramsRef = useRef(params);

  useEffect(() => {
    paramsRef.current = params;
  }, [params]);


  const { actors, isRunning, setIsRunning, workerRef, resetWithNewParams, isWorkerInitialized, latestSummaryRef, workerError, latestSummary } = useSimulation({ setIsLoading });
  const { trackedActorId, handleTrackActor, handleStopTracking } = useActorTracker({ actors, isRunning, setIsRunning, setSelectedActor, selectedActor });

  useEffect(() => {
    if (workerError) {
        setError(workerError.message);
    }
  }, [workerError]);

  // Initialize the main-thread event service
  useEffect(() => {
    eventService.initialize(() => paramsRef.current);
  }, []);

  // Check for a saved state on initial load
  useEffect(() => {
    setHasSavedState(!!localStorage.getItem(META_SAVE_KEY));
  }, []);
  
  // Effect for one-time WASM initialization and auto-loading/initialization.
  useEffect(() => {
    if (!isWorkerInitialized) return;

    const initAndLoad = async () => {
        try {
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error("Initialization timed out.")), INIT_TIMEOUT_MS)
            );

            // Race the main thread WASM initialization against the timeout
            await Promise.race([flowerService.initialize(), timeoutPromise]);
            setIsServiceInitialized(true);
            
            const metadataJSON = localStorage.getItem(META_SAVE_KEY);
            if (metadataJSON) {
                setLoadingMessage('Loading saved garden...');
                const metadata = JSON.parse(metadataJSON);
                const rehydratedGrid = await rehydrateGrid(metadata);

                const fullStateToLoad = { ...metadata, grid: rehydratedGrid };
                workerRef.current!.postMessage({ type: 'load-state', payload: fullStateToLoad });
                
                // Sync main thread state, merging with defaults to handle new params
                const loadedParams = { ...DEFAULT_SIM_PARAMS, ...fullStateToLoad.params };
                setParams(loadedParams);
                setIsRunning(false);
                setSelectedActor(null);
                eventService.dispatch({ message: 'Loaded last saved garden!', type: 'info', importance: 'high' });
            } else {
                // Initialize with default params
                setLoadingMessage('Creating a new garden...');
                workerRef.current!.postMessage({ type: 'update-params', payload: DEFAULT_SIM_PARAMS });
                setParams(DEFAULT_SIM_PARAMS);
            }
        } catch (err) {
            console.error("Failed to initialize or load on main thread:", err);
            setError("Failed to load core simulation components. This could be due to a network issue, a corrupt save file, or an unsupported browser. Please refresh the page to try again.");
            // Clear potentially corrupt state
            localStorage.removeItem(META_SAVE_KEY);
            await db.savedFlowers.clear();
            await db.savedInsects.clear();
            setIsLoading(false);
        }
    };

    initAndLoad();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isWorkerInitialized]);

  // Effect to sync the main-thread flower service with params, needed for 3D viewer.
  useEffect(() => {
      if (isServiceInitialized) {
        flowerService.setParams({ radius: params.flowerDetailRadius, numLayers: 2, P: 6.0, bias: 1.0 });
      }
  }, [params.flowerDetailRadius, isServiceInitialized]);

  const handleFrameRendered = useCallback((renderTimeMs: number) => {
      if (latestSummaryRef.current) {
          useAnalyticsStore.getState().addDataPoint({
              summary: latestSummaryRef.current,
              renderTimeMs,
          });
          // Consume the summary to prevent processing it multiple times if renders happen faster than ticks
          latestSummaryRef.current = null;
      }
  }, [latestSummaryRef]);

  const handleParamsChange = (newParams: SimulationParams) => {
    setLoadingMessage('Resetting simulation...');
    setIsLoading(true);
    setIsRunning(false); // Stop the simulation on reset
    setParams(newParams);
    resetWithNewParams(newParams); // Explicitly tell the worker to reset
    setSelectedActor(null);
    setActorsInSelectedCell([]);
    setIsControlsOpen(false); // Close panel on apply
    useAnalyticsStore.getState().reset(); // Reset analytics data
    useEventLogStore.getState().reset(); // Reset event log
  };

  const handleActorSelection = useCallback((actor: CellContent | null) => {
      if (trackedActorId) return; // Ignore selection changes while tracking
      setSelectedActor(actor);
      setActorsInSelectedCell([]); // Clear the list view once a final selection is made
      
      if (actor) {
          wasRunningBeforeSelectionRef.current = isRunning;
          setIsRunning(false);
      } else {
          if (wasRunningBeforeSelectionRef.current) {
              setIsRunning(true);
          }
      }
  }, [isRunning, setIsRunning, trackedActorId]);
  
  const handleHighlightActorById = useCallback((id: string | null) => {
    if (trackedActorId) return; 
    if (id === null) {
        if (actorsInSelectedCell.length === 0) {
            setSelectedActor(null);
        }
        return;
    }
    const actor = actors.get(id);
    setSelectedActor(actor || null);
}, [actors, trackedActorId, actorsInSelectedCell.length]);


  const handleCellClick = useCallback((actorsInCell: CellContent[]) => {
      if (trackedActorId) return; // If tracking, ignore cell clicks

      if (actorsInCell.length === 0) {
          handleActorSelection(null);
      } else if (actorsInCell.length === 1) {
          handleActorSelection(actorsInCell[0]);
      } else {
          // Multiple actors, show selection panel
          wasRunningBeforeSelectionRef.current = isRunning;
          setIsRunning(false);
          setActorsInSelectedCell(actorsInCell);
          setSelectedActor(null);
      }
  }, [handleActorSelection, isRunning, setIsRunning, trackedActorId]);

  // Effect to handle clicking outside of the details panel to close it.
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
        if (trackedActorId) return; // Ignore clicks when tracking

        if (!selectedActor && actorsInSelectedCell.length === 0) return;

        const isClickInsideDetails = detailsPanelRef.current?.contains(event.target as Node);
        const isClickInsideControlsButton = controlsButtonRef.current?.contains(event.target as Node);
        const isClickInsideControlsPanel = controlsPanelRef.current?.contains(event.target as Node);
        const isClickInsideSimulationView = simulationViewRef.current?.contains(event.target as Node);

        if (isClickInsideSimulationView || isClickInsideDetails || isClickInsideControlsButton || isClickInsideControlsPanel) {
            return;
        }

        handleActorSelection(null);
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
        document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [selectedActor, actorsInSelectedCell, handleActorSelection, trackedActorId]);

  const handleSaveSimulation = useCallback(async () => {
    if (!workerRef.current || isSaving) return;
    
    setIsSaving(true);
    setIsRunning(false); // Pause simulation to get a stable state

    try {
        const stateFromWorker = await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error("Timeout getting state from worker")), 5000);
            
            const messageHandler = (e: MessageEvent) => {
                if (e.data.type === 'state-response') {
                    workerRef.current?.removeEventListener('message', messageHandler);
                    clearTimeout(timeout);
                    resolve(e.data.payload);
                }
            };
            
            workerRef.current!.addEventListener('message', messageHandler);
            workerRef.current!.postMessage({ type: 'get-state' });
        });

        if (!stateFromWorker) throw new Error("Did not receive state from worker.");

        const fullState = stateFromWorker as { params: SimulationParams, grid: Grid, tick: number, totalInsectsEaten: number };
        const flowersToSave: Flower[] = [];
        const insectsToSave: (Insect | Cockroach)[] = [];

        // Create a "skeleton" grid with placeholders for flowers and insects
        const skeletonGrid = fullState.grid.map(row => 
            row.map(cell => 
                cell.map(actor => {
                    if (actor.type === 'flower') {
                        flowersToSave.push(actor as Flower);
                        return { id: actor.id, type: 'flower', x: actor.x, y: actor.y };
                    }
                    if (actor.type === 'insect' || actor.type === 'cockroach') {
                        insectsToSave.push(actor as (Insect | Cockroach));
                        return { id: actor.id, type: actor.type, x: actor.x, y: actor.y };
                    }
                    return actor;
                })
            )
        );

        const metadataToSave = {
            ...fullState,
            grid: skeletonGrid,
        };

        // Transactionally write to DB and localStorage
        await db.transaction('rw', db.savedFlowers, db.savedInsects, async () => {
            await db.savedFlowers.clear();
            await db.savedInsects.clear();
            await db.savedFlowers.bulkAdd(flowersToSave);
            await db.savedInsects.bulkAdd(insectsToSave as any); // Cast because Dexie types are strict
        });

        localStorage.setItem(META_SAVE_KEY, JSON.stringify(metadataToSave));
        
        setHasSavedState(true);
        eventService.dispatch({ message: 'Garden state saved!', type: 'success', importance: 'high' });
    } catch (err) {
        console.error("Save failed:", err);
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        eventService.dispatch({ message: `Save failed: ${errorMessage}`, type: 'error', importance: 'high' });
    } finally {
        setIsSaving(false);
    }
  }, [workerRef, isSaving, setIsRunning]);

  const handleLoadSimulation = useCallback(async () => {
    const metadataJSON = localStorage.getItem(META_SAVE_KEY);
    if (!metadataJSON || !workerRef.current) {
        eventService.dispatch({ message: 'No saved state found.', type: 'error', importance: 'high' });
        return;
    }
    
    setLoadingMessage('Loading saved garden...');
    setIsLoading(true);

    try {
        const metadata = JSON.parse(metadataJSON);
        const rehydratedGrid = await rehydrateGrid(metadata);

        const fullStateToLoad = { ...metadata, grid: rehydratedGrid };
        workerRef.current.postMessage({ type: 'load-state', payload: fullStateToLoad });

        const loadedParams = { ...DEFAULT_SIM_PARAMS, ...fullStateToLoad.params };
        setParams(loadedParams);
        setIsRunning(false);
        setSelectedActor(null);
        setIsControlsOpen(false);
        eventService.dispatch({ message: 'Loaded last saved garden!', type: 'info', importance: 'high' });
    } catch (err) {
        console.error("Load failed:", err);
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        eventService.dispatch({ message: `Load failed: ${errorMessage}`, type: 'error', importance: 'high' });
        setIsLoading(false);
        localStorage.removeItem(META_SAVE_KEY);
        await db.savedFlowers.clear();
        await db.savedInsects.clear();
        setHasSavedState(false);
    }
  }, [workerRef, setIsRunning]);

  const handleOpenFullLog = useCallback(() => {
    wasRunningBeforeLogRef.current = isRunning;
    setIsRunning(false);
    setIsFullLogOpen(true);
  }, [isRunning, setIsRunning]);

  const handleCloseFullLog = useCallback(() => {
    setIsFullLogOpen(false);
    setIsRunning(wasRunningBeforeLogRef.current);
  }, [setIsRunning]);


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
        <p className="mt-4 text-xl">{loadingMessage}</p>
      </div>
    );
  }

  const renderDetailsPanel = () => {
    if (actorsInSelectedCell.length > 0 && !trackedActorId) {
        return <ActorSelectionPanel actors={actorsInSelectedCell} onSelect={handleActorSelection} onClose={() => handleActorSelection(null)} />;
    }
    if (selectedActor) {
        switch(selectedActor.type) {
            case 'flower':
                return <FlowerDetailsPanel 
                            flower={selectedActor} 
                            isRunning={isRunning} 
                            setIsRunning={setIsRunning} 
                            onClose={() => handleActorSelection(null)}
                            onTrackActor={handleTrackActor}
                            onStopTracking={handleStopTracking}
                            trackedActorId={trackedActorId}
                        />;
            case 'insect':
            case 'cockroach':
                return <InsectDetailsPanel 
                            insect={selectedActor as (Insect | Cockroach)} 
                            onClose={() => handleActorSelection(null)} 
                            onStopTracking={handleStopTracking}
                            trackedActorId={trackedActorId}
                            onTrackActor={handleTrackActor}
                        />;
            case 'egg':
                return <EggDetailsPanel 
                            egg={selectedActor} 
                            onClose={() => handleActorSelection(null)}
                            onTrackActor={handleTrackActor}
                            onStopTracking={handleStopTracking}
                            trackedActorId={trackedActorId}
                        />;
            case 'bird':
            case 'eagle':
            case 'nutrient':
            case 'herbicidePlane':
            case 'herbicideSmoke':
            case 'flowerSeed':
            case 'corpse':
            case 'cocoon':
            case 'hive':
            case 'territoryMark':
            case 'antColony':
            case 'pheromoneTrail':
            case 'spiderweb':
                return <GenericActorDetailsPanel 
                            actor={selectedActor} 
                            onClose={() => handleActorSelection(null)}
                            onTrackActor={handleTrackActor}
                            onStopTracking={handleStopTracking}
                            trackedActorId={trackedActorId}
                        />;
            default:
                // Fallback for any unhandled type
                handleActorSelection(null);
                return null;
        }
    }
    return null;
  };
const detailsPanel = renderDetailsPanel();


  return (
    <div className="min-h-screen bg-background text-primary flex flex-col font-sans relative overflow-hidden">
        <header className="bg-background p-2 shadow-lg flex items-start justify-between z-10 gap-4">
            <div className="flex items-center space-x-3 flex-shrink-0 pt-2">
                <LogoIcon className="h-8 w-8 text-tertiary" />
                <h1 className="text-2xl font-bold tracking-wider text-tertiary">Evo<span className="text-accent">Garden</span></h1>
            </div>
            
            <div className="flex-grow min-w-0 mx-4">
                <StatusPanel 
                    summary={latestSummary} 
                    onLogClick={handleOpenFullLog}
                    actors={actors}
                    onTrackActor={handleTrackActor}
                    onStopTracking={handleStopTracking}
                    trackedActorId={trackedActorId}
                    isRunning={isRunning}
                    setIsRunning={setIsRunning}
                    onHighlightActor={handleHighlightActorById}
                />
            </div>

            <a 
                href="https://github.com/cristianglezm/EvoGarden" 
                target="_blank" 
                rel="noopener"
                className="text-primary hover:text-tertiary transition-colors flex-shrink-0 flex items-center pt-2 m-auto"
                aria-label="View on GitHub"
                title="View on GitHub"
            >
                <GitHubIcon className="h-7 w-7" />
            </a>
        </header>
      
      <main className="grow flex flex-col lg:flex-row p-4 gap-4 bg-surface">
        {detailsPanel && (
            <aside ref={detailsPanelRef} className="w-full lg:w-96 shrink-0">
                {detailsPanel}
            </aside>
        )}
        
        <div ref={simulationViewRef} className="grow flex flex-col h-full">
          <SimulationView 
            params={params}
            actors={actors}
            onCellClick={handleCellClick}
            selectedActorId={selectedActor?.id ?? null}
            onFrameRendered={handleFrameRendered}
          />
        </div>
      </main>

       {/* UI Buttons */}
      <div className="fixed top-24 right-4 z-20 flex flex-col space-y-2">
            <button
                ref={controlsButtonRef}
                onClick={() => setIsControlsOpen(true)}
                className="p-3 bg-tertiary/80 hover:bg-tertiary text-surface rounded-md shadow-lg transition-colors duration-200 cursor-pointer"
                aria-label="Open controls panel"
                title="Open Controls"
            >
                <SettingsIcon className="w-6 h-6" />
            </button>
             <button
                onClick={() => setIsDataPanelOpen(true)}
                className="p-3 bg-tertiary/80 hover:bg-tertiary text-surface rounded-md shadow-lg transition-colors duration-200 cursor-pointer"
                aria-label="Open data panel"
                title="Open Challenges & Analytics"
            >
                <TrophyIcon className="w-6 h-6" />
            </button>
      </div>
      
      <DataPanel 
        isOpen={isDataPanelOpen} 
        onClose={() => setIsDataPanelOpen(false)}
        isRunning={isRunning}
        setIsRunning={setIsRunning}
      />
      <FullEventLogPanel isOpen={isFullLogOpen} onClose={handleCloseFullLog} />

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
            <div className="p-4 overflow-y-auto shadow-[inset_0_1px_1px_0_#000]">
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
