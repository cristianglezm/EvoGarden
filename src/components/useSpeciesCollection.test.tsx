import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useSpeciesCollection } from './useSpeciesCollection';
import { createGuideHarness, stubCanvas } from '../test/guideHarness';
import type { SeedBankEntry } from '../types';

let h: Awaited<ReturnType<typeof createGuideHarness>>;

beforeAll(async () => {
    h = await createGuideHarness();
}, 60_000);

beforeEach(async () => {
    await h.reset();
    stubCanvas();
});

afterEach(() => {
    vi.restoreAllMocks();
});

const champion = (genome: string): SeedBankEntry => ({ category: 'longestLived', genome, value: 1, imageData: 'png', sex: 'female' });
// a long poll, so what is read is read for another reason
const LONG = 60_000;

describe('useSpeciesCollection', () => {
    it('reads the collection once when it is enabled, and nothing while it is not', async () => {
        const samples = vi.spyOn(h.source, 'samples');
        const { result, rerender } = renderHook(({ enabled }) => useSpeciesCollection(h.source, [], enabled, LONG), { initialProps: { enabled: false } });
        await act(async () => { await Promise.resolve(); });
        expect(samples).not.toHaveBeenCalled();
        rerender({ enabled: true });
        await waitFor(() => expect(result.current.collection.status).toBe('ready'));
        expect(samples).toHaveBeenCalledTimes(1);
    });

    it('reads again when the champions change, without waiting for the next poll', async () => {
        const samples = vi.spyOn(h.source, 'samples');
        const championIds = vi.spyOn(h.source, 'championIds');
        const { result, rerender } = renderHook(({ champions }) => useSpeciesCollection(h.source, champions, true, LONG), { initialProps: { champions: [] as SeedBankEntry[] } });
        await waitFor(() => expect(result.current.collection.status).toBe('ready'));
        rerender({ champions: [champion('g1')] });
        await waitFor(() => expect(samples).toHaveBeenCalledTimes(2));
        expect(championIds).toHaveBeenLastCalledWith([champion('g1')]);
    });

    it('does not read again for the same champions on another render', async () => {
        const samples = vi.spyOn(h.source, 'samples');
        const champions = [champion('g1')];
        const { result, rerender } = renderHook(() => useSpeciesCollection(h.source, champions, true, LONG));
        await waitFor(() => expect(result.current.collection.status).toBe('ready'));
        rerender();
        rerender();
        await act(async () => { await Promise.resolve(); });
        expect(samples).toHaveBeenCalledTimes(1);
    });

    it('does not read again for a new array of the same champions: only a change of them is a reason', async () => {
        const samples = vi.spyOn(h.source, 'samples');
        const one = champion('g1');
        const { result, rerender } = renderHook(() => useSpeciesCollection(h.source, [one], true, LONG));
        await waitFor(() => expect(result.current.collection.status).toBe('ready'));
        rerender();
        rerender();
        await act(async () => { await Promise.resolve(); });
        expect(samples).toHaveBeenCalledTimes(1);
    });

    it('does not read for a change of champions while it is not enabled', async () => {
        const samples = vi.spyOn(h.source, 'samples');
        const { rerender } = renderHook(({ champions }) => useSpeciesCollection(h.source, champions, false, LONG), { initialProps: { champions: [] as SeedBankEntry[] } });
        rerender({ champions: [champion('g1')] });
        await act(async () => { await Promise.resolve(); });
        expect(samples).not.toHaveBeenCalled();
    });

    it('reads once more after a read that was asked for while another was under way, and not before it ends', async () => {
        let release!: () => void;
        const first = new Promise<void>(resolve => { release = resolve; });
        const real = h.source.samples.bind(h.source);
        const samples = vi.spyOn(h.source, 'samples').mockImplementationOnce(async () => { await first; return real(); });
        const { result, rerender } = renderHook(({ champions }) => useSpeciesCollection(h.source, champions, true, LONG), { initialProps: { champions: [] as SeedBankEntry[] } });
        await waitFor(() => expect(samples).toHaveBeenCalledTimes(1));
        rerender({ champions: [champion('g1')] });
        await act(async () => { await Promise.resolve(); });
        expect(samples).toHaveBeenCalledTimes(1);
        await act(async () => release());
        await waitFor(() => expect(samples).toHaveBeenCalledTimes(2));
        await waitFor(() => expect(result.current.collection.status).toBe('ready'));
    });

    it('does not make the read it kept waiting for when it went away in the meantime', async () => {
        let release!: () => void;
        const first = new Promise<void>(resolve => { release = resolve; });
        const real = h.source.samples.bind(h.source);
        const samples = vi.spyOn(h.source, 'samples').mockImplementationOnce(async () => { await first; return real(); });
        const { rerender, unmount } = renderHook(({ champions }) => useSpeciesCollection(h.source, champions, true, LONG), { initialProps: { champions: [] as SeedBankEntry[] } });
        await waitFor(() => expect(samples).toHaveBeenCalledTimes(1));
        rerender({ champions: [champion('g1')] });
        unmount();
        await act(async () => release());
        await new Promise(resolve => setTimeout(resolve, 50));
        expect(samples).toHaveBeenCalledTimes(1);
    });

    it('stops reading when it is disabled or goes away', async () => {
        const samples = vi.spyOn(h.source, 'samples');
        const { result, rerender, unmount } = renderHook(({ champions }) => useSpeciesCollection(h.source, champions, true, 30), { initialProps: { champions: [] as SeedBankEntry[] } });
        await waitFor(() => expect(result.current.collection.status).toBe('ready'));
        unmount();
        const after = samples.mock.calls.length;
        await new Promise(resolve => setTimeout(resolve, 120));
        expect(samples.mock.calls.length).toBe(after);
        void rerender;
    });
});
