import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AnalyticsState, TickSummary, AnalyticsDataPoint } from '../types';

const MAX_HISTORY_LENGTH = 1000; // Store the last 1000 ticks

export const useAnalyticsStore = create<AnalyticsState>()(
    persist(
        (set, get) => ({
            history: [],
            addDataPoint: (summary: TickSummary) => {
                const newPoint: AnalyticsDataPoint = {
                    tick: summary.tick,
                    flowers: summary.flowerCount,
                    insects: summary.insectCount,
                    birds: summary.birdCount,
                    reproductions: summary.reproductions,
                    insectsEaten: summary.insectsEaten,
                    eggsLaid: summary.eggsLaid,
                    insectsBorn: summary.insectsBorn,
                    eggsEaten: summary.eggsEaten,
                    insectsDiedOfOldAge: summary.insectsDiedOfOldAge,
                    avgHealth: summary.avgHealth,
                    maxHealth: summary.maxHealth,
                    maxToxicity: summary.maxToxicity,
                    avgStamina: summary.avgStamina,
                    maxStamina: summary.maxStamina,
                    avgNutrientEfficiency: summary.avgNutrientEfficiency,
                    avgMaturationPeriod: summary.avgMaturationPeriod,
                    avgVitality: summary.avgVitality,
                    avgAgility: summary.avgAgility,
                    avgStrength: summary.avgStrength,
                    avgIntelligence: summary.avgIntelligence,
                    avgLuck: summary.avgLuck,
                };
                
                const newHistory = [...get().history, newPoint];
                
                // Keep the history array from growing indefinitely
                if (newHistory.length > MAX_HISTORY_LENGTH) {
                    newHistory.shift();
                }

                set({ history: newHistory });
            },
            reset: () => set({ history: [] }),
        }),
        {
            name: 'evogarden-analytics-storage',
        }
    )
);
