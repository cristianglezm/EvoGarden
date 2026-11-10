import { NO_CELL, RECORD_CATEGORIES, speciesName } from './species';
import type { SeedBankCategory, SpeciesSample } from '../types';

export interface Holder {
    category: SeedBankCategory;
    id: string;
    sex: SpeciesSample['sex'];
    age?: number;
    toxicity?: number;
}

export interface CellSummary {
    /** "x,y", as in the collection */
    key: string;
    x: number;
    y: number;
    name: string;
    discovered: boolean;
    /** the samples that count towards the cap of the species */
    samples: number;
    atypical: number;
    /** the one shown for the species: the longest lived, else the first that was found */
    representativeId: string | null;
    holders: Holder[];
    /** the champions of the whole garden that belong to this species */
    champions: SeedBankCategory[];
}

export interface GuideSummary {
    /** row by row, `w * h` of them */
    cells: CellSummary[];
    discovered: number;
    total: number;
    samples: number;
    atypical: number;
    unclassified: number;
    /** samples another classifier placed, waiting to be classified again */
    stale: number;
}

/**
 * What the field guide shows, from what the collection holds. Samples another classifier placed
 * are not plotted (their species are of another map) and are only counted, so the guide can say
 * that the collection is being updated.
 */
export function summarizeCollection(
    rows: SpeciesSample[],
    grid: { w: number; h: number; fp: string },
    championIds: Partial<Record<SeedBankCategory, string>> = {}
): GuideSummary {
    const current = rows.filter(r => r.fp === grid.fp);
    const byCell = new Map<string, SpeciesSample[]>();
    for (const row of current) {
        if (row.cell === NO_CELL) continue;
        (byCell.get(row.cell) ?? byCell.set(row.cell, []).get(row.cell)!).push(row);
    }
    const cellOfChampion = (id: string) => current.find(r => r.id === id)?.cell;

    const cells: CellSummary[] = [];
    for (let y = 0; y < grid.h; y++) {
        for (let x = 0; x < grid.w; x++) {
            const key = `${x},${y}`;
            const members = byCell.get(key) ?? [];
            const holders: Holder[] = [];
            for (const category of RECORD_CATEGORIES) {
                const holder = members.find(r => r.records.includes(category));
                if (!holder) continue;
                holders.push({
                    category,
                    id: holder.id,
                    sex: holder.sex,
                    ...(holder.age !== undefined && { age: holder.age }),
                    ...(holder.toxicity !== undefined && { toxicity: holder.toxicity }),
                });
            }
            const oldest = [...members].sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : 1))[0];
            cells.push({
                key,
                x,
                y,
                name: speciesName(x, y, grid.w),
                discovered: members.length > 0,
                samples: members.filter(r => r.kind === 'sample').length,
                atypical: members.filter(r => r.kind === 'atypical').length,
                representativeId: holders.find(h => h.category === 'longestLived')?.id ?? members.find(r => r.founder)?.id ?? oldest?.id ?? null,
                holders,
                champions: RECORD_CATEGORIES.filter(category => {
                    const id = championIds[category];
                    return id !== undefined && cellOfChampion(id) === key;
                }),
            });
        }
    }

    return {
        cells,
        discovered: cells.filter(c => c.discovered).length,
        total: grid.w * grid.h,
        samples: current.filter(r => r.kind === 'sample').length,
        atypical: current.filter(r => r.kind === 'atypical').length,
        unclassified: current.filter(r => r.cell === NO_CELL).length,
        stale: rows.length - current.length,
    };
}
