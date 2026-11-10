import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSpeciesChallenges } from './useSpeciesChallenges';
import { useChallengeStore, initialChallenges } from '../stores/challengeStore';
import type { SpeciesSource } from '../services/speciesSource';
import type { SpeciesSample } from '../types/species';
import type { TickSummary } from '../types';

const FP = 'current';
const sample = (cell: string, extra: Partial<SpeciesSample> = {}): SpeciesSample => {
    const [x, y] = cell === 'none' ? [null, null] : cell.split(',').map(Number);
    return { id: `${cell}-${Math.random()}`, cell, x, y, d: 1, fp: FP, kind: 'sample', founder: false, records: [], sex: 'both', createdAt: 0, ...extra };
};
const MINUTE = 10_000;
const progress = (id: string) => useChallengeStore.getState().challenges.find(c => c.id === id)!.progress;
const answered = (n: number) => ({ workers: { species: { answered: n } } }) as unknown as TickSummary;

let rows: SpeciesSample[];
let samples: ReturnType<typeof vi.fn>;
let grid: ReturnType<typeof vi.fn>;
let source: SpeciesSource;

const settle = () =>
    act(async () => {
        await vi.advanceTimersByTimeAsync(0);
    });
const wait = (ms: number) =>
    act(async () => {
        await vi.advanceTimersByTimeAsync(ms);
    });

beforeEach(() => {
    vi.useFakeTimers();
    useChallengeStore.setState({ challenges: initialChallenges.map(c => ({ ...c })) });
    rows = [sample('1,1'), sample('1,1'), sample('2,3', { kind: 'atypical' }), sample('4,4')];
    samples = vi.fn(async () => rows);
    grid = vi.fn(() => ({ w: 12, h: 8, fp: FP }));
    source = { samples, grid } as unknown as SpeciesSource;
});

afterEach(() => {
    vi.useRealTimers();
});

const hook = (summary: TickSummary | null = null, options: { retries?: number } = {}) =>
    renderHook(({ summary }) => useSpeciesChallenges(summary, { source, minIntervalMs: MINUTE, ...options }), { initialProps: { summary } });

describe('useSpeciesChallenges', () => {
    it('reads the collection when it starts, and gives the challenges the species found and the atypical flowers', async () => {
        hook();
        await settle();
        expect(progress('species-1')).toBe(3);
        expect(progress('atypical-1')).toBe(1);
        expect(samples).toHaveBeenCalledTimes(1);
    });

    it('counts the species of the map in use only: not what another classifier placed, nor what has no species', async () => {
        rows = [sample('1,1'), sample('2,2', { fp: 'old' }), sample('3,3', { fp: 'old', kind: 'atypical' }), sample('none', { kind: 'unclassified' })];
        hook();
        await settle();
        expect(progress('species-1')).toBe(1);
        expect(progress('atypical-1')).toBe(0);
    });

    it('does not read the collection while the classifier is not ready: it is the map that says what is in use', async () => {
        grid.mockImplementation(() => {
            throw new Error('not initialised');
        });
        hook();
        await settle();
        expect(samples).not.toHaveBeenCalled();
        expect(progress('species-1')).toBe(0);
    });

    it('does not read again while the species answered are the same', async () => {
        const { rerender } = hook(answered(5));
        await settle();
        rerender({ summary: answered(5) });
        rerender({ summary: { ...answered(5), tick: 9 } as TickSummary });
        await wait(MINUTE * 3);
        expect(samples).toHaveBeenCalledTimes(1);
    });

    it('reads again when a worker answered something, once the time between reads has passed', async () => {
        rows = [sample('1,1')];
        const { rerender } = hook(answered(5));
        await settle();
        rows = [sample('1,1'), sample('2,2'), sample('3,3'), sample('4,4')];
        await wait(MINUTE);
        rerender({ summary: answered(6) });
        await settle();
        expect(samples).toHaveBeenCalledTimes(2);
        expect(progress('species-1')).toBe(4);
    });

    it('waits for the end of the time between reads, and makes one read for all the answers that came in it', async () => {
        const { rerender } = hook(answered(1));
        await settle();
        await wait(2000);
        for (let n = 2; n <= 6; n++) rerender({ summary: answered(n) });
        await settle();
        expect(samples).toHaveBeenCalledTimes(1);
        await wait(MINUTE - 2000 - 1);
        expect(samples).toHaveBeenCalledTimes(1);
        await wait(2);
        expect(samples).toHaveBeenCalledTimes(2);
        await wait(MINUTE * 2);
        expect(samples).toHaveBeenCalledTimes(2);
    });

    it('makes one more read for what was answered while it was reading', async () => {
        let release!: () => void;
        const slow = new Promise<void>(resolve => {
            release = resolve;
        });
        samples.mockImplementationOnce(async () => {
            await slow;
            return rows;
        });
        const { rerender } = hook(answered(1));
        await settle();
        rerender({ summary: answered(2) });
        await settle();
        expect(samples).toHaveBeenCalledTimes(1);
        release();
        await settle();
        await wait(MINUTE);
        expect(samples).toHaveBeenCalledTimes(2);
    });

    it('tries again later when the classifier was not ready, and gives the challenges what it finds then', async () => {
        grid.mockImplementationOnce(() => {
            throw new Error('not initialised');
        });
        hook();
        await settle();
        expect(progress('species-1')).toBe(0);
        await wait(MINUTE);
        expect(progress('species-1')).toBe(3);
    });

    it('tries again when the collection cannot be read, and does not throw', async () => {
        samples.mockRejectedValueOnce(new Error('closed'));
        hook();
        await settle();
        expect(progress('species-1')).toBe(0);
        await wait(MINUTE);
        expect(progress('species-1')).toBe(3);
    });

    it('gives up after the retries it was given, and tries again when a worker answers', async () => {
        grid.mockImplementation(() => {
            throw new Error('never');
        });
        const { rerender } = hook(answered(1), { retries: 2 });
        await settle();
        await wait(MINUTE * 10);
        expect(grid).toHaveBeenCalledTimes(3);
        grid.mockImplementation(() => ({ w: 12, h: 8, fp: FP }));
        rerender({ summary: answered(2) });
        await settle();
        expect(progress('species-1')).toBe(3);
    });

    it('does nothing for a summary that has no workers, or no summary at all', async () => {
        const { rerender } = hook(null);
        await settle();
        rerender({ summary: { tick: 3 } as TickSummary });
        await wait(MINUTE * 2);
        expect(samples).toHaveBeenCalledTimes(1);
    });

    it('does not read for a summary that lost its workers after having them: it is no answer', async () => {
        const { rerender } = hook(answered(5));
        await settle();
        await wait(MINUTE);
        rerender({ summary: { tick: 1 } as TickSummary });
        await wait(MINUTE * 2);
        expect(samples).toHaveBeenCalledTimes(1);
    });

    it('has the retries again when a worker answers after it gave up', async () => {
        grid.mockImplementation(() => {
            throw new Error('not yet');
        });
        const { rerender } = hook(answered(1), { retries: 1 });
        // start: one try and one retry, then it gives up
        await wait(MINUTE * 5);
        expect(grid.mock.calls.length).toBe(2);
        grid.mockClear();
        // a worker answers: the retries are its again
        rerender({ summary: answered(2) });
        await wait(MINUTE * 5);
        expect(grid).toHaveBeenCalledTimes(2);
    });

    it('does not make the read it kept for later when it went away while reading', async () => {
        let release!: () => void;
        const slow = new Promise<void>(resolve => {
            release = resolve;
        });
        samples.mockImplementationOnce(async () => {
            await slow;
            return rows;
        });
        const { rerender, unmount } = hook(answered(1));
        await settle();
        rerender({ summary: answered(2) });
        unmount();
        release();
        await wait(MINUTE * 3);
        expect(samples).toHaveBeenCalledTimes(1);
    });

    it('stops when it goes away: no read it was waiting to make', async () => {
        const { rerender, unmount } = hook(answered(1));
        await settle();
        rerender({ summary: answered(2) });
        unmount();
        await wait(MINUTE * 3);
        expect(samples).toHaveBeenCalledTimes(1);
    });

    it('does not give a challenge back what it lost: fewer species while the collection is classified again', async () => {
        const { rerender } = hook(answered(1));
        await settle();
        rows = [sample('1,1')];
        await wait(MINUTE);
        rerender({ summary: answered(2) });
        await settle();
        expect(progress('species-1')).toBe(3);
    });
});
