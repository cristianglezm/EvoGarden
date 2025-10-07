import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AnalyticsState, TickSummary, AnalyticsDataPoint } from '../types';

const MAX_HISTORY_LENGTH = 1000; // Store the last 1000 ticks

export const useAnalyticsStore = create<AnalyticsState>()(
    persist(
        (set, get) => ({
            history: [],
            addDataPoint: (data: { summary: TickSummary; renderTimeMs: number }) => {
                const { summary, renderTimeMs } = data;
                const newPoint: AnalyticsDataPoint = {
                    tick: summary.tick,
                    flowers: summary.flowerCount,
                    insects: summary.insectCount,
                    birds: summary.birdCount,
                    eagles: summary.eagleCount,
                    eggCount: summary.eggCount,
                    herbicidePlanes: summary.herbicidePlaneCount,
                    herbicideSmokes: summary.herbicideSmokeCount,
                    corpses: summary.corpseCount,
                    cockroaches: summary.cockroachCount,
                    caterpillars: summary.caterpillarCount,
                    butterflies: summary.butterflyCount,
                    cocoons: summary.cocoonCount,
                    beetles: summary.beetleCount,
                    ladybugs: summary.ladybugCount,
                    snails: summary.snailCount,
                    bees: summary.beeCount,
                    scorpionCount: summary.scorpionCount || 0,
                    antCount: summary.antCount || 0,
                    spiderCount: summary.spiderCount || 0,
                    hiveCount: summary.hiveCount,
                    colonyCount: summary.colonyCount || 0,
                    totalHoney: summary.totalHoney,
                    totalAntFood: summary.totalAntFood || 0,
                    reproductions: summary.reproductions,
                    insectsEaten: summary.insectsEaten,
                    eggsLaid: summary.eggsLaid,
                    insectsBorn: summary.insectsBorn,
                    eggsEaten: summary.eggsEaten,
                    cocoonsEaten: summary.cocoonsEaten,
                    insectsDiedOfOldAge: summary.insectsDiedOfOldAge,
                    totalBirdsHunted: summary.totalBirdsHunted,
                    totalHerbicidePlanesSpawned: summary.totalHerbicidePlanesSpawned,
                    nutrientCount: summary.nutrientCount,
                    flowerDensity: summary.flowerDensity,
                    avgHealth: summary.avgHealth,
                    maxHealth: summary.maxHealth,
                    maxToxicity: summary.maxToxicity,
                    maxHealingRate: summary.maxHealingRate,
                    avgStamina: summary.avgStamina,
                    maxStamina: summary.maxStamina,
                    avgNutrientEfficiency: summary.avgNutrientEfficiency,
                    avgMaturationPeriod: summary.avgMaturationPeriod,
                    avgVitality: summary.avgVitality,
                    avgAgility: summary.avgAgility,
                    avgStrength: summary.avgStrength,
                    avgIntelligence: summary.avgIntelligence,
                    avgLuck: summary.avgLuck,
                    tickTimeMs: summary.tickTimeMs,
                    renderTimeMs: renderTimeMs,
                    currentTemperature: summary.currentTemperature,
                    currentHumidity: summary.currentHumidity,
                    season: summary.season,
                    weatherEvent: summary.weatherEvent,
                    pendingFlowerRequests: summary.pendingFlowerRequests,
                    healingFlowerCount: summary.healingFlowerCount,
                    toxicFlowerCount: summary.toxicFlowerCount,
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
