import { useCallback, useEffect, useRef, useState } from 'react';
import { summarizeCollection, type GuideSummary } from '../lib/speciesGuide';
import type { SpeciesGrid, SpeciesSource } from '../services/speciesSource';
import type { SpeciesLimits } from '../lib/speciesRepository';
import type { SeedBankEntry } from '../types';

export type SpeciesCollection =
    | { status: 'loading' }
    | { status: 'unavailable' }
    | {
          status: 'ready';
          grid: SpeciesGrid;
          summary: GuideSummary;
          images: Record<string, string>;
          limits: SpeciesLimits;
          storage: { usage: number; quota: number } | null;
      };

// by the entries, not the array: a caller that builds a new array of the same champions must not make a read at every render
const sameEntries = (a: SeedBankEntry[], b: SeedBankEntry[]) => a.length === b.length && a.every((entry, i) => entry === b[i]);

/**
 * The collection for the field guide, read when it is enabled and again every `intervalMs` while
 * it is: the collection changes in the flower worker, which has no way to call the page.
 * Images are read once, when they are first wanted; a sample's genome comes with its image and is
 * far larger than it.
 */
export function useSpeciesCollection(source: SpeciesSource, champions: SeedBankEntry[], enabled: boolean, intervalMs = 3000) {
    const [collection, setCollection] = useState<SpeciesCollection>({ status: 'loading' });
    const images = useRef<Record<string, string>>({});
    const wanted = useRef<string[]>([]);
    const latestChampions = useRef(champions);
    latestChampions.current = champions;
    const busy = useRef(false);
    // something asked for a read while one was under way: it may have been asked after that one looked
    const again = useRef(false);
    const alive = useRef(true);

    const load = useCallback(
        async function run(): Promise<void> {
            if (busy.current) {
                again.current = true;
                return;
            }
            busy.current = true;
            try {
                const grid = source.grid();
                const [rows, championIds, limits, storage] = await Promise.all([
                    source.samples(),
                    source.championIds(latestChampions.current),
                    source.limits(),
                    source.storage().catch(() => null),
                ]);
                const summary = summarizeCollection(rows, grid, championIds);
                const missing = [...summary.cells.flatMap(c => c.representativeId ?? []), ...wanted.current].filter(id => !(id in images.current));
                if (missing.length > 0) Object.assign(images.current, await source.images([...new Set(missing)]));
                if (alive.current) setCollection({ status: 'ready', grid, summary, images: { ...images.current }, limits, storage });
            } catch (error) {
                console.error('Field guide: could not read the species collection.', error);
                if (alive.current) setCollection(previous => (previous.status === 'ready' ? previous : { status: 'unavailable' }));
            } finally {
                busy.current = false;
                if (again.current) {
                    again.current = false;
                    if (alive.current) void run();
                }
            }
        },
        [source]
    );

    // The champions mark their species: a change of them is a reason to read, not to wait for the poll.
    const seenChampions = useRef(champions);
    useEffect(() => {
        if (sameEntries(seenChampions.current, champions)) return;
        seenChampions.current = champions;
        if (enabled) void load();
    }, [champions, enabled, load]);

    useEffect(() => {
        if (!enabled) return;
        alive.current = true;
        load();
        const timer = setInterval(load, intervalMs);
        return () => {
            alive.current = false;
            clearInterval(timer);
        };
    }, [enabled, load, intervalMs]);

    /** Asks for the images of samples that are not shown on the map (the records of one species). */
    const wantImages = useCallback(
        (ids: string[]) => {
            const missing = ids.filter(id => !(id in images.current) && !wanted.current.includes(id));
            if (missing.length === 0) return;
            wanted.current = [...wanted.current, ...missing];
            load();
        },
        [load]
    );

    return { collection, wantImages, refresh: load };
}
