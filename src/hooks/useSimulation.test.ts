import { describe, it, expect, vi, beforeEach } from 'vitest';
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
const mockPort1 = { postMessage: vi.fn() };
const mockPort2 = { postMessage: vi.fn() };
vi.stubGlobal('MessageChannel', class MockMessageChannel {
    port1 = mockPort1;
    port2 = mockPort2;
});

describe('useSimulation hook', () => {
    const mockSetIsLoading = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        mockWorkerInstances.length = 0;
        mockSetIsLoading.mockClear();
    });

    it('initializes and creates two workers on mount', () => {
        renderHook(() => useSimulation({ setIsLoading: mockSetIsLoading }));
        expect(mockWorkerInstances.length).toBe(2);
    });

    it('sends init-ports message to both workers using MessageChannel', () => {
        renderHook(() => useSimulation({ setIsLoading: mockSetIsLoading }));
        expect(mockWorkerInstances.length).toBe(2);
        const simWorkerInstance = mockWorkerInstances[0];
        const flowerWorkerInstance = mockWorkerInstances[1];
        
        expect(simWorkerInstance.postMessage).toHaveBeenCalledWith(
            { type: 'init-ports', payload: { flowerWorkerPort: mockPort1 } },
            [mockPort1]
        );
        expect(flowerWorkerInstance.postMessage).toHaveBeenCalledWith(
            { type: 'init-ports', payload: { simWorkerPort: mockPort2 } },
            [mockPort2]
        );
    });

    it('terminates both workers on unmount', () => {
        const { unmount } = renderHook(() => useSimulation({ setIsLoading: mockSetIsLoading }));
        unmount();
        expect(mockWorkerInstances[0].terminate).toHaveBeenCalledTimes(1);
        expect(mockWorkerInstances[1].terminate).toHaveBeenCalledTimes(1);
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
