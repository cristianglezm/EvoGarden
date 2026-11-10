import { describe, it, expect } from 'vitest';
import { normalizeSamples } from './speciesMigration';
import { DEFAULT_SPECIES_LIMITS, type SpeciesLimits } from './speciesRepository';
import type { SpeciesSample } from '../types';

const limits = (overrides: Partial<SpeciesLimits> = {}): SpeciesLimits => ({ ...DEFAULT_SPECIES_LIMITS, ...overrides });

function row(id: string, cell: string, d: number | null, extra: Partial<SpeciesSample> = {}): SpeciesSample {
    const [x, y] = cell === 'none' ? [null, null] : cell.split(',').map(Number);
    return {
        id,
        cell,
        x,
        y,
        d,
        fp: 'new',
        kind: cell === 'none' ? 'unclassified' : 'sample',
        founder: false,
        records: [],
        sex: 'both',
        createdAt: 1,
        ...extra,
    };
}

// What the collection looks like after applying what normalizeSamples says.
function apply(samples: SpeciesSample[], l = limits()) {
    const { changed, removed } = normalizeSamples(samples, l);
    const byId = new Map(samples.map(s => [s.id, s]));
    changed.forEach(s => byId.set(s.id, s));
    removed.forEach(id => byId.delete(id));
    return [...byId.values()];
}
const get = (samples: SpeciesSample[], id: string) => samples.find(s => s.id === id)!;

describe('normalizeSamples', () => {
    describe('founders', () => {
        it('is the oldest sample of each species, and only one', () => {
            const out = apply([
                row('late', '1,1', 1, { createdAt: 50, founder: true }),
                row('early', '1,1', 2, { createdAt: 10 }),
                row('other', '2,2', 1, { createdAt: 99 }),
            ]);
            expect(get(out, 'early').founder).toBe(true);
            expect(get(out, 'late').founder).toBe(false);
            expect(get(out, 'other').founder).toBe(true);
        });

        it('goes to the smaller id when two samples are as old', () => {
            const out = apply([row('b', '1,1', 1, { createdAt: 5 }), row('a', '1,1', 1, { createdAt: 5 })]);
            expect(get(out, 'a').founder).toBe(true);
            expect(get(out, 'b').founder).toBe(false);
        });

        it('is never a sample without a species', () => {
            const out = apply([row('lost', 'none', null, { founder: true })]);
            expect(get(out, 'lost').founder).toBe(false);
        });
    });

    describe('records', () => {
        it('are held once in a species that two species became: the best value of those that held it wins', () => {
            const out = apply([
                row('old', '1,1', 1, { createdAt: 1, records: ['longestLived', 'mostToxic'], age: 50, toxicity: 0.9 }),
                row('long', '1,1', 1, { createdAt: 2, records: ['longestLived'], age: 90 }),
            ]);
            expect(get(out, 'long').records).toEqual(['longestLived']);
            expect(get(out, 'old').records).toEqual(['mostToxic']);
        });

        it('go the right way for the most toxic and the most healing', () => {
            const out = apply([
                row('a', '1,1', 1, { records: ['mostToxic', 'mostHealing'], toxicity: 0.3 }),
                row('b', '1,1', 1, { records: ['mostToxic'], toxicity: 0.8 }),
                row('c', '1,1', 1, { records: ['mostHealing'], toxicity: -0.5 }),
            ]);
            expect(get(out, 'a').records).toEqual([]);
            expect(get(out, 'b').records).toEqual(['mostToxic']);
            expect(get(out, 'c').records).toEqual(['mostHealing']);
        });

        it('are not taken by a sample that never held one', () => {
            const out = apply([row('holder', '1,1', 1, { records: ['longestLived'], age: 10 }), row('plain', '1,1', 1, { age: 500 })]);
            expect(get(out, 'holder').records).toEqual(['longestLived']);
            expect(get(out, 'plain').records).toEqual([]);
        });

        it('give way to a holder that has a value when the other has none, and a tie goes to the older', () => {
            const out = apply([
                row('none', '1,1', 1, { createdAt: 1, records: ['longestLived'] }),
                row('valued', '1,1', 1, { createdAt: 2, records: ['longestLived'], age: 5 }),
                row('x', '2,2', 1, { createdAt: 9, records: ['longestLived'], age: 70 }),
                row('y', '2,2', 1, { createdAt: 3, records: ['longestLived'], age: 70 }),
            ]);
            expect(get(out, 'valued').records).toEqual(['longestLived']);
            expect(get(out, 'none').records).toEqual([]);
            expect(get(out, 'y').records).toEqual(['longestLived']);
            expect(get(out, 'x').records).toEqual([]);
        });

        it('are lost by a sample that has no species any more', () => {
            const out = apply([row('lost', 'none', null, { records: ['mostToxic'], toxicity: 0.9 })]);
            expect(get(out, 'lost').records).toEqual([]);
        });
    });

    describe('kinds', () => {
        // 30 samples at distance 1 and nothing else: anything farther is atypical
        const crowd = () => Array.from({ length: 30 }, (_, i) => row(`c${i}`, `${i},0`, 1, { createdAt: 100 + i }));

        it('make a sample far from its species atypical, and a founder never', () => {
            const out = apply([...crowd(), row('far', '0,0', 9, { createdAt: 500 }), row('far-founder', '40,0', 9, { createdAt: 1 })]);
            expect(get(out, 'far').kind).toBe('atypical');
            expect(get(out, 'far-founder').kind).toBe('sample');
        });

        it('make an atypical sample that is no longer far a sample again', () => {
            const out = apply([...crowd(), row('was-far', '0,0', 1, { kind: 'atypical', createdAt: 500 })]);
            expect(get(out, 'was-far').kind).toBe('sample');
        });

        it('say nothing about what is usual with too few samples', () => {
            const out = apply([row('a', '0,0', 1), row('b', '0,0', 50, { kind: 'atypical' })]);
            expect(get(out, 'b').kind).toBe('sample');
        });
    });

    describe('the caps', () => {
        it('let go the most typical samples of a species that has too many, never a founder or a holder', () => {
            const out = apply(
                [
                    row('founder', '1,1', 0.1, { createdAt: 1 }),
                    row('holder', '1,1', 0.2, { createdAt: 2, records: ['longestLived'], age: 9 }),
                    row('near', '1,1', 0.5, { createdAt: 3 }),
                    row('mid', '1,1', 2, { createdAt: 4 }),
                    row('far', '1,1', 3, { createdAt: 5 }),
                ],
                limits({ cap: 3 })
            );
            expect(out.map(s => s.id).sort()).toEqual(['far', 'founder', 'holder']);
        });

        it('may leave a species over a small cap when everything in it is protected', () => {
            const out = apply(
                [row('a', '1,1', 1, { createdAt: 1 }), row('b', '1,1', 1, { createdAt: 2, records: ['mostToxic'], toxicity: 1 })],
                limits({ cap: 1 })
            );
            expect(out).toHaveLength(2);
        });

        it('let go the least atypical of the atypical samples that are too many', () => {
            const crowd = Array.from({ length: 40 }, (_, i) => row(`c${i}`, `${i},0`, 1, { createdAt: 100 + i }));
            const odd = [4, 5, 6].map((d, i) => row(`odd${i}`, '0,0', d * 10, { createdAt: 900 + i }));
            const out = apply([...crowd, ...odd], limits({ atypicalCap: 2 }));
            expect(
                out
                    .filter(s => s.kind === 'atypical')
                    .map(s => s.id)
                    .sort()
            ).toEqual(['odd1', 'odd2']);
            expect(out.some(s => s.id === 'odd0')).toBe(false);
        });

        it('let go the oldest of the samples without a species that are too many', () => {
            const out = apply(
                [row('l1', 'none', null, { createdAt: 1 }), row('l2', 'none', null, { createdAt: 2 }), row('l3', 'none', null, { createdAt: 3 })],
                limits({ unclassifiedCap: 2 })
            );
            expect(out.map(s => s.id).sort()).toEqual(['l2', 'l3']);
        });
    });

    describe('a collection that is already as it should be', () => {
        it('has nothing to change', () => {
            const samples = [
                row('a', '1,1', 1, { createdAt: 1, founder: true, records: ['longestLived'], age: 10 }),
                row('b', '1,1', 2, { createdAt: 2 }),
                row('c', '2,2', 1, { createdAt: 3, founder: true }),
                row('lost', 'none', null, { createdAt: 4 }),
            ];
            expect(normalizeSamples(samples, limits())).toEqual({ changed: [], removed: [] });
        });

        it('is not touched: the samples it was given stay as they were', () => {
            const samples = [row('late', '1,1', 1, { createdAt: 50, founder: true }), row('early', '1,1', 2, { createdAt: 10 })];
            const copy = structuredClone(samples);
            normalizeSamples(samples, limits());
            expect(samples).toEqual(copy);
        });

        it('is the same when it is done twice', () => {
            const once = apply([
                row('a', '1,1', 1, { createdAt: 5 }),
                row('b', '1,1', 1, { createdAt: 1, founder: true, records: ['mostToxic'], toxicity: 0.4 }),
                row('c', '1,1', 3, { createdAt: 3, records: ['mostToxic'], toxicity: 0.9 }),
            ]);
            expect(normalizeSamples(once, limits())).toEqual({ changed: [], removed: [] });
        });
    });
});
