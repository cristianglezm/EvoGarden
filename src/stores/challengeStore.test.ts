import { describe, it, expect, beforeEach } from 'vitest';
import { useChallengeStore, initialChallenges } from './challengeStore';
import type { Challenge, TickSummary } from '../types';

const STORAGE_KEY = 'evogarden-challenge-storage';
const fresh = () => useChallengeStore.getState().challenges;
const challenge = (id: string) => fresh().find(c => c.id === id) as Challenge;

beforeEach(async () => {
    localStorage.clear();
    // back to the initial challenges, as a player who never played has them
    useChallengeStore.setState({ challenges: initialChallenges.map(c => ({ ...c })) });
    localStorage.clear();
});

describe('the challenges of the species collection', () => {
    it('are three milestones of the species found, and one for an atypical flower', () => {
        expect(challenge('species-1')).toMatchObject({ goal: 10, metric: 'speciesDiscovered', aggregator: 'max', progress: 0, completed: false });
        expect(challenge('species-2')).toMatchObject({ goal: 24, metric: 'speciesDiscovered', aggregator: 'max' });
        expect(challenge('species-3')).toMatchObject({ goal: 48, metric: 'speciesDiscovered', aggregator: 'max' });
        expect(challenge('atypical-1')).toMatchObject({ goal: 1, metric: 'atypicalFound', aggregator: 'max' });
    });

    it('have their goals at about a tenth, a quarter and a half of the 96 species of the map', () => {
        expect([10, 24, 48]).toEqual([Math.round(96 * 0.1), 96 * 0.25, 96 * 0.5]);
    });

    it('have a title and a description each, and ids that are not repeated', () => {
        for (const id of ['species-1', 'species-2', 'species-3', 'atypical-1']) {
            expect(challenge(id).title.length).toBeGreaterThan(3);
            expect(challenge(id).description.length).toBeGreaterThan(10);
        }
        const ids = fresh().map(c => c.id);
        expect(new Set(ids).size).toBe(ids.length);
    });
});

describe('the challenges of the species alive at once', () => {
    it('are three, for ten, twenty and thirty species in the garden at the same time', () => {
        expect(challenge('biodiversity-1')).toMatchObject({ goal: 10, metric: 'speciesAlive', aggregator: 'max', progress: 0 });
        expect(challenge('biodiversity-2')).toMatchObject({ goal: 20, metric: 'speciesAlive', aggregator: 'max' });
        expect(challenge('biodiversity-3')).toMatchObject({ goal: 30, metric: 'speciesAlive', aggregator: 'max' });
        for (const id of ['biodiversity-1', 'biodiversity-2', 'biodiversity-3']) {
            expect(challenge(id).title.length).toBeGreaterThan(3);
            expect(challenge(id).description).toMatch(/alive/);
        }
    });

    it('are done by a tick of the simulation, and keep the most species there were at once', () => {
        const { processTick } = useChallengeStore.getState();
        processTick({ speciesAlive: 12 } as TickSummary);
        processTick({ speciesAlive: 4 } as TickSummary);
        expect(challenge('biodiversity-1')).toMatchObject({ progress: 12, completed: true });
        expect(challenge('biodiversity-2')).toMatchObject({ progress: 12, completed: false });
    });

    it('come to a player who already has a save', async () => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ state: { challenges: [{ id: 'species-1', progress: 7, completed: false }] }, version: 1 }));
        await useChallengeStore.persist.rehydrate();
        expect(challenge('species-1').progress).toBe(7);
        expect(challenge('biodiversity-3')).toMatchObject({ progress: 0, completed: false });
    });
});

describe('processMetrics', () => {
    it('moves the progress of the challenges of that metric, and completes the ones that reach their goal', () => {
        useChallengeStore.getState().processMetrics({ speciesDiscovered: 12 });
        expect(challenge('species-1')).toMatchObject({ progress: 12, completed: true });
        expect(challenge('species-2')).toMatchObject({ progress: 12, completed: false });
        expect(challenge('species-3')).toMatchObject({ progress: 12, completed: false });
    });

    it('completes at the goal exactly', () => {
        useChallengeStore.getState().processMetrics({ speciesDiscovered: 24 });
        expect(challenge('species-2').completed).toBe(true);
    });

    it('never takes progress back: a collection that is being classified again can show fewer species for a while', () => {
        const { processMetrics } = useChallengeStore.getState();
        processMetrics({ speciesDiscovered: 30 });
        processMetrics({ speciesDiscovered: 5 });
        expect(challenge('species-2')).toMatchObject({ progress: 30, completed: true });
        expect(challenge('species-3').progress).toBe(30);
    });

    it('leaves the challenges of other metrics alone, and the ones already completed', () => {
        const before = challenge('survival-1');
        useChallengeStore.getState().processMetrics({ speciesDiscovered: 50 });
        expect(challenge('survival-1')).toEqual(before);
        useChallengeStore.getState().processMetrics({ speciesDiscovered: 96 });
        expect(challenge('species-1').progress).toBe(50);
    });

    it('ignores a metric that is not a number, or is not there', () => {
        const before = fresh();
        useChallengeStore.getState().processMetrics({ speciesDiscovered: undefined, atypicalFound: Number.NaN });
        expect(fresh()).toEqual(before);
    });

    it('finds an atypical flower', () => {
        useChallengeStore.getState().processMetrics({ atypicalFound: 3 });
        expect(challenge('atypical-1')).toMatchObject({ progress: 3, completed: true });
    });

    it('is what a tick of the simulation does too: the same rules', () => {
        useChallengeStore.getState().processTick({ maxFlowerAge: 150 } as TickSummary);
        expect(challenge('survival-1')).toMatchObject({ progress: 150, completed: true });
    });
});

describe('the challenges a player saved before there were new ones', () => {
    const saved = (challenges: Partial<Challenge>[]) => localStorage.setItem(STORAGE_KEY, JSON.stringify({ state: { challenges }, version: 0 }));

    it('get the new ones, with no progress, and keep the progress they had', async () => {
        saved([
            {
                id: 'survival-1',
                title: 'Budding Survivor',
                description: 'x',
                goal: 100,
                progress: 100,
                completed: true,
                metric: 'maxFlowerAge',
                aggregator: 'max',
            },
            {
                id: 'predation-1',
                title: 'First Hunt',
                description: 'x',
                goal: 10,
                progress: 4,
                completed: false,
                metric: 'totalInsectsEaten',
                aggregator: 'sum',
            },
        ]);
        await useChallengeStore.persist.rehydrate();
        expect(challenge('survival-1')).toMatchObject({ progress: 100, completed: true });
        expect(challenge('predation-1')).toMatchObject({ progress: 4, completed: false });
        expect(challenge('species-1')).toMatchObject({ progress: 0, completed: false });
        expect(challenge('atypical-1')).toBeDefined();
        expect(fresh()).toHaveLength(new Set(fresh().map(c => c.id)).size);
    });

    it('take the text and the goal from the game, and the progress from the save', async () => {
        saved([
            { id: 'survival-2', title: 'old title', description: 'old', goal: 5, progress: 700, completed: false, metric: 'maxFlowerAge', aggregator: 'max' },
        ]);
        await useChallengeStore.persist.rehydrate();
        expect(challenge('survival-2')).toMatchObject({ title: 'Perennial Power', goal: 1000, progress: 700, completed: false });
    });

    it('lose nothing they completed, even if the goal moved', async () => {
        saved([{ id: 'survival-2', goal: 5, progress: 1000, completed: true }]);
        await useChallengeStore.persist.rehydrate();
        expect(challenge('survival-2').completed).toBe(true);
    });

    it('drop a challenge the game does not have any more', async () => {
        saved([{ id: 'gone-for-good' as never, title: 'x', description: 'x', goal: 1, progress: 1, completed: true, metric: 'tick', aggregator: 'max' }]);
        await useChallengeStore.persist.rehydrate();
        expect(fresh().some(c => (c.id as string) === 'gone-for-good')).toBe(false);
    });

    it('start from the initial ones when nothing was saved, or what was saved is broken', async () => {
        await useChallengeStore.persist.rehydrate();
        expect(fresh().length).toBeGreaterThan(25);
        localStorage.setItem(STORAGE_KEY, '{not json');
        await useChallengeStore.persist.rehydrate();
        expect(fresh().length).toBeGreaterThan(25);
        expect(challenge('species-1').progress).toBe(0);
    });

    it('start from the initial ones when the save has no list of challenges', async () => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ state: {}, version: 1 }));
        await useChallengeStore.persist.rehydrate();
        expect(fresh().map(c => c.id)).toEqual(initialChallenges.map(c => c.id));
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ state: { challenges: 'lots' }, version: 0 }));
        await useChallengeStore.persist.rehydrate();
        expect(fresh().map(c => c.id)).toEqual(initialChallenges.map(c => c.id));
    });

    it('saves from now on with a version, so the next challenge added is merged the same way', async () => {
        useChallengeStore.getState().processMetrics({ speciesDiscovered: 3 });
        const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
        expect(stored.version).toBe(1);
        expect(stored.state.challenges.find((c: Challenge) => c.id === 'species-1').progress).toBe(3);
    });
});
