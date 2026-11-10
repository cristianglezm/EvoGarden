import { useEffect, useRef } from 'react';
import type { TickSummary } from '../types';
import { summarizeCollection } from '../lib/speciesGuide';
import { defaultSpeciesSource } from '../services/defaultSpeciesSource';
import type { SpeciesSource } from '../services/speciesSource';
import { useChallengeStore } from '../stores/challengeStore';

interface Options {
    source?: SpeciesSource;
    /** The least time between two reads of the collection: it is read whole, and it changes in the workers. */
    minIntervalMs?: number;
    /** How many times it tries again when the classifier is not ready or the collection cannot be read. */
    retries?: number;
}

/**
 * The challenges about the species collection (the species found, an atypical flower). The simulation does not count
 * them: the collection outlives the game and is written by the workers. The page reads it when it starts and when a
 * species worker has answered something, never twice within `minIntervalMs`.
 */
export function useSpeciesChallenges(summary: TickSummary | null, { source = defaultSpeciesSource, minIntervalMs = 10_000, retries = 5 }: Options = {}): void {
    const read = useRef<() => void>(() => {});
    const answered = summary?.workers?.species.answered;
    // what the start already read for is not news
    const seen = useRef(answered);

    useEffect(() => {
        let alive = true;
        let busy = false;
        let again = false;
        let failures = 0;
        let lastRead = Number.NEGATIVE_INFINITY;
        let timer: ReturnType<typeof setTimeout> | null = null;

        const request = () => {
            if (!alive) return;
            if (busy) {
                again = true;
                return;
            }
            const wait = lastRead + minIntervalMs - Date.now();
            if (wait > 0) {
                timer ??= setTimeout(() => {
                    timer = null;
                    request();
                }, wait);
                return;
            }
            void readNow();
        };

        const readNow = async () => {
            busy = true;
            lastRead = Date.now();
            try {
                // the map in use says which samples count: without it there is nothing to read them against
                const grid = source.grid();
                const { discovered, atypical } = summarizeCollection(await source.samples(), grid);
                useChallengeStore.getState().processMetrics({ speciesDiscovered: discovered, atypicalFound: atypical });
            } catch {
                if (++failures <= retries) again = true;
            } finally {
                busy = false;
                if (again) {
                    again = false;
                    request();
                }
            }
        };

        read.current = () => {
            failures = 0;
            request();
        };
        request();
        return () => {
            alive = false;
            if (timer) clearTimeout(timer);
            read.current = () => {};
        };
    }, [source, minIntervalMs, retries]);

    // a species worker answered something: the collection may have changed
    useEffect(() => {
        if (answered === undefined || answered === seen.current) return;
        seen.current = answered;
        read.current();
    }, [answered]);
}
