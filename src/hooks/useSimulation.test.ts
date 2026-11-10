import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSimulation } from './useSimulation';
import { DEFAULT_SIM_PARAMS } from '../constants';
import type { ActorDelta, Bird, CellContent, Flower, Insect } from '../types';

// --- Mock Worker Setup ---
const mockWorkerInstances: { postMessage: ReturnType<typeof vi.fn>; terminate: ReturnType<typeof vi.fn>; onmessage: ((e: MessageEvent) => void) | null }[] = [];
vi.stubGlobal('Worker', class MockWorker {
  constructor(_scriptURL: string | URL, _options?: WorkerOptions) {
    const instance = {
        postMessage: vi.fn(),
        terminate: vi.fn(),
        onmessage: null as ((e: MessageEvent) => void) | null,
    };
    mockWorkerInstances.push(instance);
    return instance;
  }
});

// --- Mock MessageChannel Setup ---
const channels: { port1: { postMessage: ReturnType<typeof vi.fn> }; port2: { postMessage: ReturnType<typeof vi.fn> } }[] = [];
vi.stubGlobal('MessageChannel', class MockMessageChannel {
    port1 = { postMessage: vi.fn() };
    port2 = { postMessage: vi.fn() };
    constructor() { channels.push(this); }
});

describe('useSimulation hook', () => {
    const mockSetIsLoading = vi.fn();

    const cores = (n: number | undefined) => vi.spyOn(navigator, 'hardwareConcurrency', 'get').mockReturnValue(n as number);

    beforeEach(() => {
        vi.clearAllMocks();
        mockWorkerInstances.length = 0;
        channels.length = 0;
        mockSetIsLoading.mockClear();
        cores(4);
    });

    afterEach(() => {
        vi.restoreAllMocks();
        window.history.replaceState({}, '', '/');
    });

    describe('with cores for it', () => {
        it('creates the simulation, flower and species workers on mount', () => {
            renderHook(() => useSimulation({ setIsLoading: mockSetIsLoading }));
            expect(mockWorkerInstances.length).toBe(3);
        });

        it('connects each of the other two workers to the simulation with a channel of its own', () => {
            renderHook(() => useSimulation({ setIsLoading: mockSetIsLoading }));
            const [sim, flower, species] = mockWorkerInstances;
            expect(channels).toHaveLength(2);
            const [toFlower, toSpecies] = channels;

            expect(sim.postMessage).toHaveBeenCalledWith(
                { type: 'init-ports', payload: { flowerWorkerPorts: [toFlower.port1], speciesWorkerPort: toSpecies.port1 } },
                [toFlower.port1, toSpecies.port1],
            );
            expect(flower.postMessage).toHaveBeenCalledWith(
                { type: 'init-ports', payload: { simWorkerPort: toFlower.port2, roles: ['creation', 'species'], speciesBatch: 8, primarySpecies: false } },
                [toFlower.port2],
            );
            expect(species.postMessage).toHaveBeenCalledWith(
                { type: 'init-ports', payload: { simWorkerPort: toSpecies.port2 } },
                [toSpecies.port2],
            );
        });

        it('terminates the three workers on unmount', () => {
            const { unmount } = renderHook(() => useSimulation({ setIsLoading: mockSetIsLoading }));
            unmount();
            for (const worker of mockWorkerInstances) expect(worker.terminate).toHaveBeenCalledTimes(1);
        });

        it('stops loading and says so when the species worker fails', () => {
            renderHook(() => useSimulation({ setIsLoading: mockSetIsLoading }));
            const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
            act(() => { (mockWorkerInstances[2] as unknown as { onerror: (e: unknown) => void }).onerror({ message: 'boom' }); });
            quiet.mockRestore();
            expect(mockSetIsLoading).toHaveBeenCalledWith(false);
        });
    });

    describe('without cores for it', () => {
        it('has the flower worker do the species too, as before the species worker', () => {
            cores(2);
            renderHook(() => useSimulation({ setIsLoading: mockSetIsLoading }));
            const [sim, flower] = mockWorkerInstances;
            expect(mockWorkerInstances.length).toBe(2);
            expect(sim.postMessage).toHaveBeenCalledWith(
                { type: 'init-ports', payload: { flowerWorkerPorts: [channels[0].port1] } },
                [channels[0].port1],
            );
            expect(flower.postMessage).toHaveBeenCalledWith(
                { type: 'init-ports', payload: { simWorkerPort: channels[0].port2 } },
                [channels[0].port2],
            );
        });

        it('terminates both workers on unmount', () => {
            cores(2);
            const { unmount } = renderHook(() => useSimulation({ setIsLoading: mockSetIsLoading }));
            unmount();
            for (const worker of mockWorkerInstances) expect(worker.terminate).toHaveBeenCalledTimes(1);
        });
    });

    describe('the seed bank', () => {
        it('tells the simulation to read its champions again', () => {
            const { result } = renderHook(() => useSimulation({ setIsLoading: mockSetIsLoading }));
            const [sim] = mockWorkerInstances;
            result.current.reloadChampions();
            expect(sim.postMessage).toHaveBeenCalledWith({ type: 'reload-champions' });
        });
    });

    describe('with more than one worker that makes flowers', () => {
        it('starts as many as the address asks, each with a channel of its own to the simulation', () => {
            cores(8);
            window.history.replaceState({}, '', '/?creationWorkers=3');
            renderHook(() => useSimulation({ setIsLoading: mockSetIsLoading }));
            // simulation, three that make flowers, species
            expect(mockWorkerInstances.length).toBe(5);
            expect(channels).toHaveLength(4);
            const [sim, f1, f2, f3, species] = mockWorkerInstances;
            expect(sim.postMessage).toHaveBeenCalledWith(
                { type: 'init-ports', payload: { flowerWorkerPorts: [channels[0].port1, channels[1].port1, channels[2].port1], speciesWorkerPort: channels[3].port1 } },
                [channels[0].port1, channels[1].port1, channels[2].port1, channels[3].port1],
            );
            [f1, f2, f3].forEach((worker, i) => {
                expect(worker.postMessage).toHaveBeenCalledWith(
                    { type: 'init-ports', payload: { simWorkerPort: channels[i].port2, roles: ['creation', 'species'], speciesBatch: 8, primarySpecies: false } },
                    [channels[i].port2],
                );
            });
            expect(species.postMessage).toHaveBeenCalledWith(
                { type: 'init-ports', payload: { simWorkerPort: channels[3].port2 } },
                [channels[3].port2],
            );
        });

        it('leaves the species to the first of them, and only that one, when there is no species worker', () => {
            cores(2);
            window.history.replaceState({}, '', '/?creationWorkers=2');
            renderHook(() => useSimulation({ setIsLoading: mockSetIsLoading }));
            const [, f1, f2] = mockWorkerInstances;
            expect(mockWorkerInstances.length).toBe(3);
            expect(f1.postMessage).toHaveBeenCalledWith({ type: 'init-ports', payload: { simWorkerPort: channels[0].port2 } }, [channels[0].port2]);
            expect(f2.postMessage).toHaveBeenCalledWith({ type: 'init-ports', payload: { simWorkerPort: channels[1].port2, roles: ['creation'] } }, [channels[1].port2]);
        });

        it('terminates every one of them on unmount, and stops loading when any fails', () => {
            cores(8);
            window.history.replaceState({}, '', '/?creationWorkers=2');
            const { unmount } = renderHook(() => useSimulation({ setIsLoading: mockSetIsLoading }));
            const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
            act(() => { (mockWorkerInstances[2] as unknown as { onerror: (e: unknown) => void }).onerror({ message: 'boom' }); });
            quiet.mockRestore();
            expect(mockSetIsLoading).toHaveBeenCalledWith(false);
            unmount();
            expect(mockWorkerInstances).toHaveLength(4);
            for (const worker of mockWorkerInstances) expect(worker.terminate).toHaveBeenCalledTimes(1);
        });
    });

    describe('when the player chose the number of workers', () => {
        afterEach(() => { window.localStorage.removeItem('evoGarden-workers'); });

        it('starts that many: one that only classifies and the rest for flowers', () => {
            cores(8);
            window.localStorage.setItem('evoGarden-workers', '3');
            renderHook(() => useSimulation({ setIsLoading: mockSetIsLoading }));
            // simulation, two for flowers, species
            expect(mockWorkerInstances.length).toBe(4);
        });

        it('starts one worker that does everything when the choice is one', () => {
            cores(8);
            window.localStorage.setItem('evoGarden-workers', '1');
            renderHook(() => useSimulation({ setIsLoading: mockSetIsLoading }));
            expect(mockWorkerInstances.length).toBe(2);
        });

        it('lets the address win over the choice', () => {
            cores(8);
            window.localStorage.setItem('evoGarden-workers', '3');
            window.history.replaceState({}, '', '/?creationWorkers=1');
            renderHook(() => useSimulation({ setIsLoading: mockSetIsLoading }));
            expect(mockWorkerInstances.length).toBe(3);
        });

        it('goes on with the cores when what was saved is not a number of workers', () => {
            cores(8);
            window.localStorage.setItem('evoGarden-workers', 'lots');
            renderHook(() => useSimulation({ setIsLoading: mockSetIsLoading }));
            // simulation, three for flowers, species
            expect(mockWorkerInstances.length).toBe(5);
        });
    });

    describe('when the address says', () => {
        it('goes without the species worker on a machine with cores, and all the workers make flowers', () => {
            window.history.replaceState({}, '', '/?speciesWorker=0');
            renderHook(() => useSimulation({ setIsLoading: mockSetIsLoading }));
            // four cores are two workers: simulation and two for flowers
            expect(mockWorkerInstances.length).toBe(3);
        });

        it('has the species worker on a machine without', () => {
            cores(1);
            window.history.replaceState({}, '', '/?speciesWorker=1');
            renderHook(() => useSimulation({ setIsLoading: mockSetIsLoading }));
            expect(mockWorkerInstances.length).toBe(3);
        });
    });

    it('sends "start" and "pause" messages to the simulation worker', () => {
        const { result } = renderHook(() => useSimulation({ setIsLoading: mockSetIsLoading }));
        const simWorker = mockWorkerInstances[0];

        act(() => {
            result.current.setIsRunning(true);
        });
        expect(result.current.isRunning).toBe(true);
        expect(simWorker.postMessage).toHaveBeenCalledWith({ type: 'start' });

        act(() => {
            result.current.setIsRunning(false);
        });
        expect(result.current.isRunning).toBe(false);
        expect(simWorker.postMessage).toHaveBeenCalledWith({ type: 'pause' });
    });

    it('sends "update-params" message to the simulation worker when resetWithNewParams is called', () => {
        const { result } = renderHook(() => useSimulation({ setIsLoading: mockSetIsLoading }));
        const simWorker = mockWorkerInstances[0];
        const newParams = { ...DEFAULT_SIM_PARAMS, gridWidth: 25 };

        act(() => {
            result.current.resetWithNewParams(newParams);
        });

        expect(simWorker.postMessage).toHaveBeenCalledWith({ type: 'update-params', payload: newParams });
    });

    it('updates actor state correctly from worker messages', () => {
        const { result } = renderHook(() => useSimulation({ setIsLoading: mockSetIsLoading }));
        const simWorker = mockWorkerInstances[0];
        
        // 1. Initial state from 'init-complete'
        const initialActorsList: CellContent[] = [
            { id: 'flower-1', type: 'flower', x: 0, y: 0, health: 100 } as Flower,
            { id: 'insect-1', type: 'insect', x: 1, y: 1, lifespan: 50, emoji: '🦋' } as Insect,
        ];

        const initialGrid: (CellContent[])[][] = [
            [[initialActorsList[0]], []],
            [[], [initialActorsList[1]]],
        ];

        const initMessage = {
            data: {
                type: 'init-complete',
                payload: {
                    grid: initialGrid,
                    params: { ...DEFAULT_SIM_PARAMS, gridWidth: 2, gridHeight: 2 }
                }
            }
        } as MessageEvent;
        
        act(() => {
            if (simWorker.onmessage) simWorker.onmessage(initMessage);
        });
        
        const initialActorsMap = result.current.actors;
        expect(initialActorsMap.size).toBe(2);
        expect(initialActorsMap.get('flower-1')).toEqual(initialActorsList[0]);
        expect(initialActorsMap.get('insect-1')).toEqual(initialActorsList[1]);

        // 2. Deltas from 'tick-update'
        const birdActor: Bird = { id: 'bird-1', type: 'bird', x: 1, y: 0, target: null, patrolTarget: null };
        const deltas: ActorDelta[] = [
            { type: 'update', id: 'flower-1', changes: { health: 90 } },
            { type: 'remove', id: 'insect-1' },
            { type: 'add', actor: birdActor },
        ];
        const tickMessage = {
            data: {
                type: 'tick-update',
                payload: {
                    deltas,
                    events: [],
                    summary: { tick: 1, flowerCount: 1, insectCount: 0, birdCount: 1 }
                }
            }
        } as MessageEvent;

        act(() => {
            if (simWorker.onmessage) simWorker.onmessage(tickMessage);
        });

        // 3. Assert final actors map state
        const finalActorsMap = result.current.actors;
        expect(finalActorsMap.size).toBe(2);
        
        const updatedFlower = finalActorsMap.get('flower-1') as Flower;
        expect(updatedFlower).toBeDefined();
        expect(updatedFlower.health).toBe(90);
        
        expect(finalActorsMap.has('insect-1')).toBe(false);
        
        const addedBird = finalActorsMap.get('bird-1') as Bird;
        expect(addedBird).toBeDefined();
        expect(addedBird.id).toBe('bird-1');
        expect(addedBird).toEqual(birdActor);
    });
    
    it('does not change state for unhandled message types', () => {
        const { result } = renderHook(() => useSimulation({ setIsLoading: mockSetIsLoading }));
        const simWorker = mockWorkerInstances[0];
        
        const initialActors = result.current.actors;
        const mockMessage = { data: { type: 'some-other-type', payload: {} } } as MessageEvent;

        act(() => {
           if(simWorker.onmessage) {
               simWorker.onmessage(mockMessage);
           }
        });

        expect(result.current.actors).toBe(initialActors);
    });
});
