import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSimulation } from './useSimulation';
import { DEFAULT_SIM_PARAMS } from '../constants';
import type { ActorDelta, Bird, CellContent, Flower, Insect } from '../types';

// --- Mock Worker Setup ---
const mockPostMessage = vi.fn();
const mockTerminate = vi.fn();
const mockWorkerConstructor = vi.fn(); // Spy specifically on the constructor call
let onmessageCallback: ((e: MessageEvent) => void) | null = null;

// Mock the global Worker class. This is crucial because JSDOM (Vitest's default environment)
// does not have a Worker implementation.
vi.stubGlobal('Worker', class MockWorker {
  constructor(scriptURL: string | URL, options?: WorkerOptions) {
    // Call our spy so we can track that the worker was created
    mockWorkerConstructor(scriptURL, options);
  }
  
  postMessage = mockPostMessage;
  terminate = mockTerminate;
  
  set onmessage(callback: ((e: MessageEvent) => void) | null) {
    onmessageCallback = callback;
  }
  get onmessage(): ((e: MessageEvent) => void) | null {
    return onmessageCallback;
  }
});

describe('useSimulation hook', () => {
    const mockSetIsLoading = vi.fn();

    beforeEach(() => {
        // Reset spies and the onmessage callback before each test to ensure isolation.
        vi.clearAllMocks();
        mockWorkerConstructor.mockClear(); // Also clear the constructor spy
        mockSetIsLoading.mockClear();
        onmessageCallback = null;
    });

    it('initializes and creates a worker on mount', () => {
        renderHook(() => useSimulation({ setIsLoading: mockSetIsLoading }));
        expect(mockWorkerConstructor).toHaveBeenCalledTimes(1);
    });

    it('terminates the worker on unmount', () => {
        const { unmount } = renderHook(() => useSimulation({ setIsLoading: mockSetIsLoading }));
        unmount();
        expect(mockTerminate).toHaveBeenCalledTimes(1);
    });

    it('sends "start" and "pause" messages to the worker', () => {
        const { result } = renderHook(() => useSimulation({ setIsLoading: mockSetIsLoading }));

        act(() => {
            result.current.setIsRunning(true);
        });
        expect(result.current.isRunning).toBe(true);
        expect(mockPostMessage).toHaveBeenCalledWith({ type: 'start' });

        act(() => {
            result.current.setIsRunning(false);
        });
        expect(result.current.isRunning).toBe(false);
        expect(mockPostMessage).toHaveBeenCalledWith({ type: 'pause' });
    });

    it('sends "update-params" message when resetWithNewParams is called', () => {
        const { result } = renderHook(() => useSimulation({ setIsLoading: mockSetIsLoading }));
        const newParams = { ...DEFAULT_SIM_PARAMS, gridWidth: 25 };

        act(() => {
            result.current.resetWithNewParams(newParams);
        });

        expect(mockPostMessage).toHaveBeenCalledWith({ type: 'update-params', payload: newParams });
    });

    it('updates actor state and derives grid correctly from "tick-update" deltas', () => {
        const { result } = renderHook(() => useSimulation({ setIsLoading: mockSetIsLoading }));
        
        // 1. Initial state from 'init-complete'
        const initialActors: CellContent[] = [
            { id: 'flower-1', type: 'flower', x: 0, y: 0, health: 100 } as Flower,
            { id: 'insect-1', type: 'insect', x: 1, y: 1, lifespan: 50, emoji: '🦋' } as Insect,
        ];

        // Construct a simple 2x2 grid for the initial payload
        const initialGrid: (CellContent[])[][] = [
            [[initialActors[0]], []],
            [[], [initialActors[1]]],
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
            if (onmessageCallback) onmessageCallback(initMessage);
        });
        
        expect(result.current.grid[0][0][0]).toEqual(initialActors[0]);
        expect(result.current.grid[1][1][0]).toEqual(initialActors[1]);

        // 2. Deltas from 'tick-update'
        const deltas: ActorDelta[] = [
            { type: 'update', id: 'flower-1', changes: { health: 90 } },
            { type: 'remove', id: 'insect-1' },
            { type: 'add', actor: { id: 'bird-1', type: 'bird', x: 1, y: 0 } as Bird },
        ];
        const tickMessage = {
            data: {
                type: 'tick-update',
                payload: {
                    deltas,
                    events: [],
                    summary: { tick: 1, flowerCount: 1, insectCount: 0, birdCount: 1 /* other props */ }
                }
            }
        } as MessageEvent;

        act(() => {
            if (onmessageCallback) onmessageCallback(tickMessage);
        });

        // 3. Assert final derived grid state
        const finalGrid = result.current.grid;
        // Flower updated
        expect(finalGrid[0][0].length).toBe(1);
        expect((finalGrid[0][0][0] as Flower).health).toBe(90);
        // Insect removed
        expect(finalGrid[1][1].length).toBe(0);
        // Bird added
        expect(finalGrid[0][1].length).toBe(1);
        expect(finalGrid[0][1][0].id).toBe('bird-1');
    });
    
    it('does not change state for unhandled message types', () => {
        const { result } = renderHook(() => useSimulation({ setIsLoading: mockSetIsLoading }));
        
        const initialGrid = result.current.grid;
        const mockMessage = { data: { type: 'some-other-type', payload: {} } } as MessageEvent;

        act(() => {
           if(onmessageCallback) {
               onmessageCallback(mockMessage);
           }
        });

        expect(result.current.grid).toBe(initialGrid); // Should not have changed
    });
});
