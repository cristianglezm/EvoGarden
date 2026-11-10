import { describe, it, expect } from 'vitest';
import { summarizeCollection } from './speciesGuide';
import { speciesName } from './species';
import type { SpeciesSample } from '../types';

const grid = { w: 12, h: 8, fp: 'now' };

function row(id: string, cell: string, extra: Partial<SpeciesSample> = {}): SpeciesSample {
    const [x, y] = cell === 'none' ? [null, null] : cell.split(',').map(Number);
    return {
        id,
        cell,
        x,
        y,
        d: cell === 'none' ? null : 1,
        fp: 'now',
        kind: cell === 'none' ? 'unclassified' : 'sample',
        founder: false,
        records: [],
        sex: 'both',
        createdAt: 1,
        ...extra,
    };
}
const cellOf = (summary: ReturnType<typeof summarizeCollection>, key: string) => summary.cells.find(c => c.key === key)!;

describe('summarizeCollection', () => {
    it('has a cell for every species of the map, row by row, with its name', () => {
        const { cells, total, discovered } = summarizeCollection([], grid);
        expect(cells).toHaveLength(96);
        expect(total).toBe(96);
        expect(discovered).toBe(0);
        expect(cells[0]).toMatchObject({ key: '0,0', x: 0, y: 0, name: speciesName(0, 0, 12), discovered: false });
        expect(cells[13]).toMatchObject({ key: '1,1', x: 1, y: 1 });
        expect(cells[95]).toMatchObject({ key: '11,7' });
        expect(new Set(cells.map(c => c.name)).size).toBe(96);
    });

    it('counts the species that have a sample', () => {
        const s = summarizeCollection([row('a', '3,5'), row('b', '3,5'), row('c', '0,0')], grid);
        expect(s.discovered).toBe(2);
        expect(cellOf(s, '3,5')).toMatchObject({ discovered: true, samples: 2, atypical: 0 });
        expect(cellOf(s, '4,5').discovered).toBe(false);
    });

    it('counts the samples, the atypical ones and the ones without a species apart', () => {
        const s = summarizeCollection([row('a', '1,1'), row('b', '1,1', { kind: 'atypical' }), row('c', '2,2'), row('l1', 'none'), row('l2', 'none')], grid);
        expect(s).toMatchObject({ samples: 2, atypical: 1, unclassified: 2, discovered: 2 });
        expect(cellOf(s, '1,1')).toMatchObject({ samples: 1, atypical: 1 });
    });

    it('shows, for a species, the longest lived of its samples, else the one that discovered it, else the oldest', () => {
        const s = summarizeCollection(
            [
                row('a', '1,1', { createdAt: 5, founder: true }),
                row('b', '1,1', { createdAt: 9, records: ['longestLived'], age: 90 }),
                row('c', '2,2', { createdAt: 5, founder: true }),
                row('d', '2,2', { createdAt: 1 }),
                row('e', '3,3', { createdAt: 7 }),
                row('f', '3,3', { createdAt: 2 }),
            ],
            grid
        );
        expect(cellOf(s, '1,1').representativeId).toBe('b');
        expect(cellOf(s, '2,2').representativeId).toBe('c');
        expect(cellOf(s, '3,3').representativeId).toBe('f');
        expect(cellOf(s, '4,4').representativeId).toBeNull();
    });

    it('lists who holds each record of a species, with the values', () => {
        const s = summarizeCollection(
            [
                row('long', '1,1', { records: ['longestLived'], age: 90, sex: 'female' }),
                row('toxic', '1,1', { records: ['mostToxic'], toxicity: 0.7, sex: 'male' }),
                row('heal', '1,1', { records: ['mostHealing'], toxicity: -0.2 }),
            ],
            grid
        );
        expect(cellOf(s, '1,1').holders).toEqual([
            { category: 'longestLived', id: 'long', sex: 'female', age: 90 },
            { category: 'mostToxic', id: 'toxic', sex: 'male', toxicity: 0.7 },
            { category: 'mostHealing', id: 'heal', sex: 'both', toxicity: -0.2 },
        ]);
    });

    it('marks the species a champion of the garden belongs to', () => {
        const s = summarizeCollection([row('c1', '1,1'), row('c2', '4,4')], grid, { longestLived: 'c1', mostToxic: 'c1', mostHealing: 'c2' });
        expect(cellOf(s, '1,1').champions).toEqual(['longestLived', 'mostToxic']);
        expect(cellOf(s, '4,4').champions).toEqual(['mostHealing']);
        expect(cellOf(s, '0,0').champions).toEqual([]);
    });

    it('does not mark a champion that is not in the collection', () => {
        const s = summarizeCollection([row('a', '1,1')], grid, { longestLived: 'not-there' });
        expect(s.cells.every(c => c.champions.length === 0)).toBe(true);
    });

    it('does not plot the samples another classifier placed: it counts them', () => {
        const s = summarizeCollection([row('new', '1,1'), row('old1', '5,5', { fp: 'before' }), row('old2', 'none', { fp: 'before' })], grid);
        expect(s.discovered).toBe(1);
        expect(cellOf(s, '5,5').discovered).toBe(false);
        expect(s).toMatchObject({ stale: 2, unclassified: 0, samples: 1 });
    });

    it('has nothing stale when every sample is from the classifier in use', () => {
        expect(summarizeCollection([row('a', '1,1')], grid).stale).toBe(0);
    });
});
