import { create } from 'zustand';
import type { LogEntry, AppEvent } from '../types';

interface EventLogState {
    entries: LogEntry[];
    addEntry: (entry: AppEvent) => void;
    reset: () => void;
}

const MAX_LOG_ENTRIES = 100;

export const useEventLogStore = create<EventLogState>((set) => ({
    entries: [],
    addEntry: (entry) => {
        set((state) => {
            const latestEntry = state.entries[0];
            if (
                latestEntry &&
                latestEntry.tick === entry.tick &&
                latestEntry.message === entry.message &&
                latestEntry.type === entry.type
            ) {
                // It's a duplicate in the same tick, update the latest one.
                const updatedEntries = [...state.entries];
                updatedEntries[0] = {
                    ...latestEntry,
                    count: (latestEntry.count || 1) + 1,
                    timestamp: entry.timestamp, // Keep the latest timestamp
                    id: `log-${Date.now()}-${Math.random()}`, // New key to force re-render
                };
                return { entries: updatedEntries };
            } else {
                // It's a new event, prepend it.
                const newEntry: LogEntry = {
                    ...entry,
                    id: `log-${Date.now()}-${Math.random()}`,
                    count: 1,
                };
                const newEntries = [newEntry, ...state.entries];
                if (newEntries.length > MAX_LOG_ENTRIES) {
                    newEntries.pop();
                }
                return { entries: newEntries };
            }
        });
    },
    reset: () => set({ entries: [] }),
}));
