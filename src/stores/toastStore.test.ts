import { describe, it, expect, beforeEach } from 'vitest';
import { useToastStore } from './toastStore';
import { act } from '@testing-library/react';

describe('toastStore', () => {
    // Reset store state before each test
    beforeEach(() => {
        act(() => {
            useToastStore.setState({ toasts: [] });
        });
    });

    it('should initialize with an empty array of toasts', () => {
        const { toasts } = useToastStore.getState();
        expect(toasts).toEqual([]);
    });

    it('addToast should add a new toast message', () => {
        const newToast = { message: 'Test toast', type: 'success' as const };

        act(() => {
            useToastStore.getState().addToast(newToast);
        });

        const { toasts } = useToastStore.getState();
        expect(toasts).toHaveLength(1);
        expect(toasts[0].message).toBe('Test toast');
        expect(toasts[0].type).toBe('success');
        expect(toasts[0]).toHaveProperty('id');
    });

    it('removeToast should remove a toast by its id', () => {
        const toast1 = { message: 'Toast 1', type: 'info' as const };
        const toast2 = { message: 'Toast 2', type: 'error' as const };

        // Add two toasts
        act(() => {
            useToastStore.getState().addToast(toast1);
            useToastStore.getState().addToast(toast2);
        });
        
        let toasts = useToastStore.getState().toasts;
        expect(toasts).toHaveLength(2);

        // Get the ID of the first toast to remove it
        const idToRemove = toasts[0].id;

        act(() => {
            useToastStore.getState().removeToast(idToRemove);
        });

        toasts = useToastStore.getState().toasts;
        expect(toasts).toHaveLength(1);
        expect(toasts[0].message).toBe('Toast 2');
    });

    it('removeToast should do nothing if id does not exist', () => {
        const toast = { message: 'My Toast', type: 'info' as const };
        
        act(() => {
            useToastStore.getState().addToast(toast);
        });

        let { toasts } = useToastStore.getState();
        expect(toasts).toHaveLength(1);

        act(() => {
            useToastStore.getState().removeToast('non-existent-id');
        });

        toasts = useToastStore.getState().toasts;
        expect(toasts).toHaveLength(1);
    });
});
