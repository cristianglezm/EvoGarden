import { create } from 'zustand';
import type { ToastMessage, AppEvent } from '../types';

interface ToastState {
  toasts: ToastMessage[];
  addToast: (toast: AppEvent) => void;
  removeToast: (id: string) => void;
}

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  addToast: (toast) => {
    const existingToast = get().toasts.find(
      (t) => t.message === toast.message && t.type === toast.type
    );

    if (existingToast) {
      // Update existing toast: increment count and update key to refresh timer
      set((state) => ({
        toasts: state.toasts.map((t) =>
          t.id === existingToast.id
            ? { ...t, count: (t.count || 1) + 1, key: Date.now() }
            : t
        ),
      }));
    } else {
      // Add a new toast if no similar one exists
      const newToastWithId: ToastMessage = {
        ...toast,
        id: `toast-${Date.now()}-${Math.random()}`,
        count: 1,
        key: Date.now(),
      };
      set((state) => ({
        toasts: [...state.toasts, newToastWithId],
      }));
    }
  },
  removeToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((toast) => toast.id !== id),
    })),
}));
