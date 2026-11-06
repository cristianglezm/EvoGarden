import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Challenge, ChallengeState, TickSummary } from '../types';

export const initialChallenges: Challenge[] = [
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
    { id: 'peak-performer', title: 'Peak Performer', description: 'Evolve a flower with 100 max health.', goal: 100, progress: 0, completed: false, metric: 'maxHealth', aggregator: 'max' },
    { id: 'hive-1', title: 'Apiary Ascendancy', description: 'Sustain a hive with a total of 50 bees.', goal: 50, progress: 0, completed: false, metric: 'beeCount', aggregator: 'max' },
    { id: 'hive-2', title: 'Sweet Success', description: 'Accumulate 500 honey across all hives.', goal: 500, progress: 0, completed: false, metric: 'totalHoney', aggregator: 'max' },
    { id: 'colony-1', title: 'For the Colony!', description: 'Grow the total ant population to 50.', goal: 50, progress: 0, completed: false, metric: 'antCount', aggregator: 'max' },
    { id: 'pest-1', title: 'Infestation', description: 'Reach a population of 20 cockroaches.', goal: 20, progress: 0, completed: false, metric: 'cockroachCount', aggregator: 'max' },
    { id: 'metamorphosis-1', title: 'Butterfly Effect', description: 'Evolve a thriving butterfly population of 25.', goal: 25, progress: 0, completed: false, metric: 'butterflyCount', aggregator: 'max' },
    { id: 'healing-garden', title: 'Garden of Life', description: 'Evolve a flower with a healing property of 20% or more.', goal: 0.2, progress: 0, completed: false, metric: 'maxHealingRate', aggregator: 'max' },
    // The species collection (the field guide has 96 species): about a tenth, a quarter and a half of them
    { id: 'species-1', title: 'Field Naturalist', description: 'Discover 10 species of flowers for the field guide.', goal: 10, progress: 0, completed: false, metric: 'speciesDiscovered', aggregator: 'max' },
    { id: 'species-2', title: 'Taxonomist', description: 'Discover 24 species of flowers for the field guide.', goal: 24, progress: 0, completed: false, metric: 'speciesDiscovered', aggregator: 'max' },
    { id: 'species-3', title: 'Keeper of the Garden', description: 'Discover 48 species of flowers: half of the field guide.', goal: 48, progress: 0, completed: false, metric: 'speciesDiscovered', aggregator: 'max' },
    { id: 'atypical-1', title: 'Strange Bloom', description: 'Find an atypical flower: one that fits none of the species well.', goal: 1, progress: 0, completed: false, metric: 'atypicalFound', aggregator: 'max' },
    // Species alive in the garden at the same time (the goals are a guess: tune them from real gardens)
    { id: 'biodiversity-1', title: 'Mixed Meadow', description: 'Have 10 different species of flowers alive in the garden at once.', goal: 10, progress: 0, completed: false, metric: 'speciesAlive', aggregator: 'max' },
    { id: 'biodiversity-2', title: 'Living Gallery', description: 'Have 20 different species of flowers alive in the garden at once.', goal: 20, progress: 0, completed: false, metric: 'speciesAlive', aggregator: 'max' },
    { id: 'biodiversity-3', title: 'Botanical Paradise', description: 'Have 30 different species of flowers alive in the garden at once.', goal: 30, progress: 0, completed: false, metric: 'speciesAlive', aggregator: 'max' },
    // New challenges for specialized insects
    { id: 'specialist-ladybug', title: 'Pest Patrol', description: 'Establish a ladybug population of 20 to control pests.', goal: 20, progress: 0, completed: false, metric: 'ladybugCount', aggregator: 'max' },
    { id: 'specialist-beetle', title: 'A Helping Hand', description: 'Cultivate a beetle population of 15 to support your garden.', goal: 15, progress: 0, completed: false, metric: 'beetleCount', aggregator: 'max' },
    { id: 'specialist-snail', title: 'Slow and Steady', description: 'Reach a population of 25 snails.', goal: 25, progress: 0, completed: false, metric: 'snailCount', aggregator: 'max' },
    { id: 'specialist-scorpion', title: 'Desert Predators', description: 'Sustain a formidable group of 5 scorpions.', goal: 5, progress: 0, completed: false, metric: 'scorpionCount', aggregator: 'max' },
    { id: 'specialist-spider', title: 'Arachnophilia', description: 'Host a population of 10 spiders in your garden.', goal: 10, progress: 0, completed: false, metric: 'spiderCount', aggregator: 'max' },
];

// Progress of the challenges for the values of the metrics (a tick of the simulation, or what the page read elsewhere).
function applyMetrics(challenges: Challenge[], values: Partial<TickSummary>): Challenge[] | null {
    let hasChanged = false;
    const updated = challenges.map(challenge => {
        if (challenge.completed) return challenge;

        const metricValue = values[challenge.metric];
        if (typeof metricValue !== 'number' || Number.isNaN(metricValue)) return challenge;

        // For sums, we use the cumulative value directly
        const newProgress = challenge.aggregator === 'max' ? Math.max(challenge.progress, metricValue) : metricValue;
        if (newProgress === challenge.progress) return challenge;

        hasChanged = true;
        return { ...challenge, progress: newProgress, completed: newProgress >= challenge.goal };
    });
    return hasChanged ? updated : null;
}

export const useChallengeStore = create<ChallengeState>()(
    persist(
        (set, get) => ({
            challenges: initialChallenges,
            processTick: (summary: TickSummary) => {
                const updated = applyMetrics(get().challenges, summary);
                if (updated) set({ challenges: updated });
            },
            processMetrics: (values: Partial<TickSummary>) => {
                const updated = applyMetrics(get().challenges, values);
                if (updated) set({ challenges: updated });
            },
        }),
        {
            name: 'evogarden-challenge-storage',
            // What was saved is the list of challenges as they were then: a challenge added since would never show up for a
            // player who already has a save. The challenges are the game's, the progress is the save's.
            version: 1,
            migrate: persisted => persisted as ChallengeState,
            merge: (persisted, current) => {
                const saved = (persisted as { challenges?: Challenge[] } | undefined)?.challenges;
                if (!Array.isArray(saved)) return current;
                return {
                    ...current,
                    challenges: initialChallenges.map(challenge => {
                        const before = saved.find(s => s?.id === challenge.id);
                        if (!before) return challenge;
                        return {
                            ...challenge,
                            progress: Number.isFinite(before.progress) ? before.progress : challenge.progress,
                            completed: before.completed === true,
                        };
                    }),
                };
            },
        }
    )
);
