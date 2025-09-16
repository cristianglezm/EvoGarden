import { create } from 'zustand';
import type { LogEntry, AppEvent } from '../types';

interface EventLogState {
    entries: LogEntry[];
    addEntry: (entry: AppEvent) => void;
    reset: () => void;
}

const MAX_LOG_ENTRIES = 100;

export const useEventLogStore = create<EventLogState>((set, get) => ({
    entries: [],
    addEntry: (entry) => {
        const newEntry: LogEntry = {
            ...entry,
            id: `log-${Date.now()}-${Math.random()}`,
        };
        const newEntries = [newEntry, ...get().entries];
        if (newEntries.length > MAX_LOG_ENTRIES) {
            newEntries.pop();
        }
        set({ entries: newEntries });
    },
    reset: () => set({ entries: [] }),
}));
