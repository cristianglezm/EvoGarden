import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSimulation } from './useSimulation';
import { DEFAULT_SIM_PARAMS } from '../constants';

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

    it('updates the grid state when it receives a "gridUpdate" message from the worker', () => {
        const { result } = renderHook(() => useSimulation({ setIsLoading: mockSetIsLoading }));
        
        expect(result.current.grid).toEqual([]);

        const mockGrid = [[[{ type: 'flower', id: '1' }]]];
        // We have to cast here because MessageEvent is a complex type
        const mockMessage = { data: { type: 'gridUpdate', payload: { grid: mockGrid } } } as MessageEvent;

        act(() => {
            // Simulate the worker sending a message to the hook
            if (onmessageCallback) {
                onmessageCallback(mockMessage);
            }
        });

        expect(result.current.grid).toEqual(mockGrid);
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
