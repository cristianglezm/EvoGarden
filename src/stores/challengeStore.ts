import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Challenge, ChallengeState, TickSummary } from '../types';

const initialChallenges: Challenge[] = [
    { id: 'survival-1', title: 'Budding Survivor', description: 'Have a flower survive for 100 ticks.', goal: 100, progress: 0, completed: false, metric: 'maxFlowerAge', aggregator: 'max' },
    { id: 'survival-2', title: 'Perennial Power', description: 'Have a flower survive for 1,000 ticks.', goal: 1000, progress: 0, completed: false, metric: 'maxFlowerAge', aggregator: 'max' },
    { id: 'survival-3', title: 'Ancient Bloom', description: 'Have a flower survive for 10,000 ticks.', goal: 10000, progress: 0, completed: false, metric: 'maxFlowerAge', aggregator: 'max' },
    { id: 'predation-1', title: 'First Hunt', description: 'Have a bird eat a total of 10 insects.', goal: 10, progress: 0, completed: false, metric: 'totalInsectsEaten', aggregator: 'sum' },
    { id: 'predation-2', title: 'Seasoned Hunter', description: 'Have birds eat a total of 100 insects.', goal: 100, progress: 0, completed: false, metric: 'totalInsectsEaten', aggregator: 'sum' },
    { id: 'predation-3', title: 'Apex Predator', description: 'Have birds eat a total of 1,000 insects.', goal: 1000, progress: 0, completed: false, metric: 'totalInsectsEaten', aggregator: 'sum' },
];

export const useChallengeStore = create<ChallengeState>()(
    persist(
        (set, get) => ({
            challenges: initialChallenges,
            processTick: (summary: TickSummary) => {
                const { challenges } = get();
                let hasChanged = false;

                const updatedChallenges = challenges.map(challenge => {
                    if (challenge.completed) return challenge;

                    let newProgress = challenge.progress;
                    const metricValue = summary[challenge.metric];
                    
                    if (typeof metricValue !== 'number') return challenge;

                    if (challenge.aggregator === 'max') {
                        newProgress = Math.max(challenge.progress, metricValue);
                    } else if (challenge.aggregator === 'sum') {
                        // For sums, we use the cumulative value directly
                        newProgress = metricValue;
                    }
                    
                    if (newProgress !== challenge.progress) {
                        hasChanged = true;
                        const completed = newProgress >= challenge.goal;
                        return { ...challenge, progress: newProgress, completed };
                    }

                    return challenge;
                });

                if (hasChanged) {
                    set({ challenges: updatedChallenges });
                }
            },
        }),
        {
            name: 'evogarden-challenge-storage',
        }
    )
);
