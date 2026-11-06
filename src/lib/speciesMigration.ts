import { NO_CELL, RECORD_CATEGORIES, atypicalStats } from './species';
import type { SeedBankCategory, SpeciesSample } from '../types';
import type { SpeciesLimits } from './speciesRepository';

const isProtected = (sample: SpeciesSample) => sample.founder || sample.records.length > 0;
export const byTypical = (a: SpeciesSample, b: SpeciesSample) => (a.d ?? 0) - (b.d ?? 0);
export const byAge = (a: SpeciesSample, b: SpeciesSample) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : 1);

/**
 * The ids to let go so that `group` has no more than `cap` samples: the first of `order` that may
 * be let go, never a founder or a holder of a record (so a group may stay above a small cap).
 */
export function excessOf(group: SpeciesSample[], cap: number, order: (a: SpeciesSample, b: SpeciesSample) => number): string[] {
    const replaceable = group.filter(s => !isProtected(s)).sort(order);
    const ids: string[] = [];
    for (let excess = group.length - cap; excess > 0 && replaceable.length > 0; excess--) ids.push(replaceable.shift()!.id);
    return ids;
}

function valueOf(category: SeedBankCategory, sample: SpeciesSample): number | undefined {
    return category === 'longestLived' ? sample.age : sample.toxicity;
}

// Of two holders, the one with the better value; one without a value gives way, a tie goes to the older.
function better(category: SeedBankCategory, a: SpeciesSample, b: SpeciesSample): SpeciesSample {
    const [x, y] = [valueOf(category, a), valueOf(category, b)];
    if (x === undefined || y === undefined) return x === undefined && y !== undefined ? b : a;
    if (x === y) return byAge(a, b) <= 0 ? a : b;
    const aWins = category === 'mostHealing' ? x < y : x > y;
    return aWins ? a : b;
}

/**
 * What the collection must look like when its samples have been classified again by a new
 * classifier: the species are other, so the founders, the records and the kinds that were decided
 * under the old ones are decided again from what the samples are now.
 *
 * - the founder of a species is its oldest sample;
 * - a record is held by the best of the samples that held it, by their stored values (two species
 *   that became one have their records compete; a sample that never held one does not join in);
 * - a sample is atypical when it is far from its species, by the new distances;
 * - a species over its cap, the atypical over theirs and the unclassified over theirs lose the
 *   samples the policy would have let go, never a founder or a holder of a record.
 *
 * Pure: it gives what changed, and does not touch the samples it was given.
 */
export function normalizeSamples(samples: SpeciesSample[], limits: SpeciesLimits): { changed: SpeciesSample[]; removed: string[] } {
    const work = samples.map(s => ({ ...s, records: [...s.records] }));
    const removed = new Set<string>();

    const lost = work.filter(s => s.cell === NO_CELL);
    for (const s of lost) Object.assign(s, { kind: 'unclassified', founder: false, records: [] });

    const species = new Map<string, SpeciesSample[]>();
    for (const s of work) {
        if (s.cell === NO_CELL) continue;
        (species.get(s.cell) ?? species.set(s.cell, []).get(s.cell)!).push(s);
    }

    for (const members of species.values()) {
        members.sort(byAge);
        members.forEach((s, i) => { s.founder = i === 0; });
        for (const category of RECORD_CATEGORIES) {
            const holders = members.filter(s => s.records.includes(category));
            if (holders.length < 2) continue;
            const best = holders.reduce((a, b) => better(category, a, b));
            for (const s of holders) if (s !== best) s.records = s.records.filter(c => c !== category);
        }
    }

    const classified = work.filter(s => s.cell !== NO_CELL);
    const stats = atypicalStats(classified.map(s => s.d!));
    for (const s of classified) s.kind = !s.founder && stats && s.d! > stats.above ? 'atypical' : 'sample';

    const trim = (group: SpeciesSample[], cap: number, order: (a: SpeciesSample, b: SpeciesSample) => number) => {
        for (const id of excessOf(group, cap, order)) removed.add(id);
    };
    for (const members of species.values()) trim(members.filter(s => s.kind === 'sample'), limits.cap, byTypical);
    trim(classified.filter(s => s.kind === 'atypical'), limits.atypicalCap, byTypical);
    trim(lost, limits.unclassifiedCap, byAge);

    const before = new Map(samples.map(s => [s.id, JSON.stringify(s)]));
    return {
        changed: work.filter(s => !removed.has(s.id) && JSON.stringify(s) !== before.get(s.id)),
        removed: [...removed],
    };
}
