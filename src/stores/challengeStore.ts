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
    { id: 'circle-of-life', title: 'Circle of Life', description: 'Witness an eagle successfully hunt a bird.', goal: 1, progress: 0, completed: false, metric: 'totalBirdsHunted', aggregator: 'sum' },
    { id: 'pest-control', title: 'Pest Control', description: 'Trigger a herbicide plane deployment.', goal: 1, progress: 0, completed: false, metric: 'totalHerbicidePlanesSpawned', aggregator: 'sum' },
    { id: 'bountiful-harvest', title: 'Bountiful Harvest', description: 'Have 10 nutrients on the grid at the same time.', goal: 10, progress: 0, completed: false, metric: 'nutrientCount', aggregator: 'max' },
    { id: 'avian-sanctuary-1', title: 'Avian Sanctuary', description: 'Reach a population of 10 birds.', goal: 10, progress: 0, completed: false, metric: 'birdCount', aggregator: 'max' },
    { id: 'avian-sanctuary-2', title: 'A Bigger Avian Sanctuary', description: 'Reach a population of 50 birds.', goal: 50, progress: 0, completed: false, metric: 'birdCount', aggregator: 'max' },
    { id: 'the-swarm-1', title: 'The Swarm', description: 'Reach a total insect population of 200.', goal: 200, progress: 0, completed: false, metric: 'insectCount', aggregator: 'max' },
    { id: 'the-swarm-2', title: 'Kill it with fire', description: 'Reach a total insect population of 1,000.', goal: 1000, progress: 0, completed: false, metric: 'insectCount', aggregator: 'max' },
    { id: 'unchecked-growth', title: 'Unchecked Growth', description: 'Fill 95% of the grid with flowers and seeds.', goal: 0.95, progress: 0, completed: false, metric: 'flowerDensity', aggregator: 'max' },
    { id: 'poison-garden', title: 'Poison Garden', description: 'Evolve a flower with a toxicity level over 80%.', goal: 0.8, progress: 0, completed: false, metric: 'maxToxicity', aggregator: 'max' },
    { id: 'peak-performer', title: 'Peak Performer', description: 'Evolve a flower with over 100 max health.', goal: 100, progress: 0, completed: false, metric: 'maxHealth', aggregator: 'max' },
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
