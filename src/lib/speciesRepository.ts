import { NO_CELL, RECORD_CATEGORIES, atypicalStats, cellKey, genomeId } from './species';
import { byTypical, excessOf, normalizeSamples } from './speciesMigration';
import type { MigrationResult, SampleKind, SeedBankCategory, SpeciesMatch, SpeciesSample, SpeciesStore, SpeciesTx } from '../types';

export const SPECIES_CAP_MAX = 100;

export interface SpeciesLimits {
    /** samples per species, atypical ones not counted */
    cap: number;
    /** atypical samples in all, they are outside the per-species cap */
    atypicalCap: number;
    unclassifiedCap: number;
}

// The caps of atypical and unclassified flowers are starting points to measure on a long run.
export const DEFAULT_SPECIES_LIMITS: SpeciesLimits = { cap: 50, atypicalCap: 500, unclassifiedCap: 200 };

export interface SpeciesCandidate {
    genome: string;
    /** `null` for a flower the classifier could not place */
    match: SpeciesMatch | null;
    fp: string;
    sex: SpeciesSample['sex'];
    age?: number;
    toxicity?: number;
    tick?: number;
    /** kept only if the flower discovers its species */
    image?: string;
}

export type OfferResult =
    // 'typical': not farther from its species than what it would replace. 'full': nothing in the way is allowed to be replaced.
    { stored: false; reason: 'duplicate' | 'typical' | 'full' } | { stored: true; kind: SampleKind; discovered: boolean; evicted: string[] };

export interface RecordResult {
    /** the records the flower holds now that it did not before */
    recorded: SeedBankCategory[];
    /** it was the first flower of its species */
    discovered: boolean;
    evicted: string[];
}

const isProtected = (sample: SpeciesSample) => sample.founder || sample.records.length > 0;

// The same rules as the champions of the whole garden, which start at 0: a flower has to live,
// to be toxic or to be healing (a negative toxicity) before it can hold a record.
function canHold(category: SeedBankCategory, flower: Pick<SpeciesCandidate, 'age' | 'toxicity'>): boolean {
    switch (category) {
        case 'longestLived':
            return flower.age !== undefined && flower.age > 0;
        case 'mostToxic':
            return flower.toxicity !== undefined && flower.toxicity > 0;
        case 'mostHealing':
            return flower.toxicity !== undefined && flower.toxicity < 0;
    }
}

// A tie keeps the holder. A holder that lacks the value cannot be compared and gives way.
function beats(category: SeedBankCategory, flower: Pick<SpeciesCandidate, 'age' | 'toxicity'>, holder: SpeciesSample | undefined): boolean {
    if (!holder) return true;
    switch (category) {
        case 'longestLived':
            return holder.age === undefined || flower.age! > holder.age;
        case 'mostToxic':
            return holder.toxicity === undefined || flower.toxicity! > holder.toxicity;
        case 'mostHealing':
            return holder.toxicity === undefined || flower.toxicity! < holder.toxicity;
    }
}

function farthestLast(a: SpeciesSample, b: SpeciesSample) {
    return (a.d ?? 0) - (b.d ?? 0);
}

/**
 * Decides which flowers the collection keeps. It is the dataset a better classifier is trained
 * on, so it wants coverage of every species and the flowers the current map fits worst, not the
 * thousands of near-identical mutants of one lineage.
 */
export function validateLimits(limits: SpeciesLimits): SpeciesLimits {
    const { cap, atypicalCap, unclassifiedCap } = limits;
    if (!Number.isInteger(cap) || cap < 1 || cap > SPECIES_CAP_MAX) {
        throw new RangeError(`cap must be a whole number from 1 to ${SPECIES_CAP_MAX}`);
    }
    if (!Number.isInteger(atypicalCap) || atypicalCap < 1 || !Number.isInteger(unclassifiedCap) || unclassifiedCap < 1) {
        throw new RangeError('the caps must be whole numbers of at least 1');
    }
    return { cap, atypicalCap, unclassifiedCap };
}

export class SpeciesRepository {
    private current: SpeciesLimits;

    constructor(
        private readonly store: SpeciesStore,
        limits: Partial<SpeciesLimits> = {},
        private readonly now: () => number = Date.now
    ) {
        this.current = validateLimits({ ...DEFAULT_SPECIES_LIMITS, ...limits });
    }

    get limits(): SpeciesLimits {
        return this.current;
    }

    /** Changes the limits for what is offered from now on; nothing stored is touched (see trim). */
    setLimits(limits: Partial<SpeciesLimits>): void {
        this.current = validateLimits({ ...this.current, ...limits });
    }

    /**
     * Lets go the samples a species has over its cap, the most typical first, never a founder or a
     * holder of a record. For when the cap was lowered. Gives the ids it removed.
     */
    async trim(): Promise<string[]> {
        return this.store.transaction(async tx => {
            const species = new Map<string, SpeciesSample[]>();
            for (const sample of await tx.all()) {
                if (sample.kind !== 'sample' || sample.cell === NO_CELL) continue;
                (species.get(sample.cell) ?? species.set(sample.cell, []).get(sample.cell)!).push(sample);
            }
            const removed = [...species.values()].flatMap(group => excessOf(group, this.current.cap, byTypical));
            if (removed.length > 0) await tx.remove(removed);
            return removed;
        });
    }

    /**
     * A few of the samples that another classifier placed, with their genomes (`null` if it is
     * gone), to classify again. Empty when none is left.
     */
    async staleChunk(fp: string, size: number): Promise<Array<{ id: string; genome: string | null }>> {
        return this.store.transaction(async tx => {
            const chunk: Array<{ id: string; genome: string | null }> = [];
            for (const sample of await tx.stale(fp, size)) chunk.push({ id: sample.id, genome: (await tx.genome(sample.id))?.genome ?? null });
            return chunk;
        });
    }

    /**
     * Puts the samples where the new classifier (`fp`) says they are. Once none is left of the old
     * one the founders, records and kinds are decided again (see normalizeSamples) in the same
     * transaction, so a run that is interrupted leaves either the old collection or the new one
     * to carry on from, never one in between. Gives whether it was the last.
     */
    async migrate(fp: string, results: MigrationResult[]): Promise<boolean> {
        return this.store.transaction(async tx => {
            for (const { id, match } of results) {
                const sample = await tx.get(id);
                if (!sample) continue;
                if (match === 'gone') await tx.remove([id]);
                else if (match) {
                    await tx.update({
                        ...sample,
                        cell: cellKey(match),
                        x: match.x,
                        y: match.y,
                        d: match.distance,
                        fp,
                        kind: sample.kind === 'unclassified' ? 'sample' : sample.kind,
                    });
                } else {
                    await tx.update({ ...sample, cell: NO_CELL, x: null, y: null, d: null, fp, kind: 'unclassified', founder: false, records: [] });
                }
            }
            if ((await tx.stale(fp, 1)).length > 0) return false;
            if (results.length === 0) return true;

            const { changed, removed } = normalizeSamples(await tx.all(), this.limits);
            for (const sample of changed) await tx.update(sample);
            if (removed.length > 0) await tx.remove(removed);
            return true;
        });
    }

    /** Cheaper than classifying a genome that is already in the collection. */
    async isStored(genome: string): Promise<boolean> {
        const id = await genomeId(genome);
        return this.store.transaction(async tx => (await tx.get(id)) !== undefined);
    }

    async offer(candidate: SpeciesCandidate): Promise<OfferResult> {
        // before the transaction: awaiting crypto inside one would end it
        const id = await genomeId(candidate.genome);

        return this.store.transaction(async tx => {
            if (await tx.get(id)) return { stored: false, reason: 'duplicate' };

            const { match } = candidate;
            const sample: SpeciesSample = {
                id,
                cell: cellKey(match),
                x: match ? match.x : null,
                y: match ? match.y : null,
                d: match ? match.distance : null,
                fp: candidate.fp,
                kind: 'sample',
                founder: false,
                records: [],
                sex: candidate.sex,
                createdAt: this.now(),
            };
            if (candidate.age !== undefined) sample.age = candidate.age;
            if (candidate.toxicity !== undefined) sample.toxicity = candidate.toxicity;
            if (candidate.tick !== undefined) sample.tick = candidate.tick;

            if (!match) return this.offerUnclassified(tx, { ...sample, kind: 'unclassified' }, candidate);

            const inCell = await tx.inCell(sample.cell);
            // Discovering a species comes before everything else, even for an atypical flower.
            if (inCell.length === 0) {
                await tx.put({ ...sample, founder: true }, candidate.genome, candidate.image);
                return { stored: true, kind: 'sample', discovered: true, evicted: [] };
            }

            const stats = atypicalStats(await tx.distances());
            if (stats && match.distance > stats.above) {
                return this.offerReplacing(tx, { ...sample, kind: 'atypical' }, candidate, await tx.ofKind('atypical'), this.limits.atypicalCap);
            }
            return this.offerReplacing(
                tx,
                sample,
                candidate,
                inCell.filter(s => s.kind === 'sample'),
                this.limits.cap
            );
        });
    }

    /**
     * A flower that has died (or a champion) takes the records of its species it beats: the longest
     * lived, the most toxic and the most healing of that species. The holder of a record is kept
     * whatever the cap says, so it is stored here even if `offer` refused it, and it takes the
     * records from the flower that held them. A flower that is already in the collection is
     * updated, not stored again, and the species it was stored under is the one that counts.
     *
     * `candidate.match` is only used for a flower that is not in the collection.
     */
    async record(candidate: SpeciesCandidate, only: SeedBankCategory[] = RECORD_CATEGORIES): Promise<RecordResult> {
        const eligible = only.filter(category => canHold(category, candidate));
        const nothing: RecordResult = { recorded: [], discovered: false, evicted: [] };
        if (eligible.length === 0) return nothing;
        const id = await genomeId(candidate.genome);

        return this.store.transaction(async tx => {
            const existing = await tx.get(id);
            if (existing?.cell === NO_CELL || (!existing && !candidate.match)) return nothing;
            const cell = existing ? existing.cell : cellKey(candidate.match);
            const inCell = await tx.inCell(cell);

            const won = eligible.filter(category =>
                beats(
                    category,
                    candidate,
                    inCell.find(s => s.id !== id && s.records.includes(category))
                )
            );
            if (won.length === 0) return nothing;

            for (const previous of inCell) {
                if (previous.id === id || !previous.records.some(category => won.includes(category))) continue;
                await tx.update({ ...previous, records: previous.records.filter(category => !won.includes(category)) });
            }

            const values: Partial<SpeciesSample> = {};
            if (candidate.age !== undefined) values.age = candidate.age;
            if (candidate.toxicity !== undefined) values.toxicity = candidate.toxicity;
            if (candidate.tick !== undefined) values.tick = candidate.tick;

            if (existing) {
                const row = { ...existing, ...values, records: [...new Set([...existing.records, ...won])] };
                const stored = await tx.genome(id);
                if (candidate.image && stored && !stored.image) await tx.put(row, stored.genome, candidate.image);
                else await tx.update(row);
                return { recorded: won, discovered: false, evicted: [] };
            }

            const match = candidate.match!;
            const founder = inCell.length === 0;
            const row: SpeciesSample = {
                id,
                cell,
                x: match.x,
                y: match.y,
                d: match.distance,
                fp: candidate.fp,
                kind: 'sample',
                founder,
                records: won,
                sex: candidate.sex,
                createdAt: this.now(),
                ...values,
            };
            await tx.put(row, candidate.genome, candidate.image);

            const evicted: string[] = [];
            const samples = inCell.filter(s => s.kind === 'sample');
            if (samples.length + 1 > this.limits.cap) {
                const replaceable = samples.filter(s => !isProtected(s) && !won.some(c => s.records.includes(c))).sort(farthestLast);
                if (replaceable.length > 0) {
                    evicted.push(replaceable[0].id);
                    await tx.remove(evicted);
                }
            }
            return { recorded: won, discovered: founder, evicted };
        });
    }

    // At the cap a flower takes the place of the most typical one it is allowed to replace,
    // and only if it is farther from its species.
    private async offerReplacing(tx: SpeciesTx, sample: SpeciesSample, candidate: SpeciesCandidate, kept: SpeciesSample[], cap: number): Promise<OfferResult> {
        const evicted: string[] = [];
        if (kept.length >= cap) {
            const replaceable = kept.filter(s => !isProtected(s)).sort(farthestLast);
            if (replaceable.length === 0) return { stored: false, reason: 'full' };
            if (sample.d! <= replaceable[0].d!) return { stored: false, reason: 'typical' };
            evicted.push(replaceable[0].id);
            await tx.remove(evicted);
        }
        await tx.put(sample, candidate.genome);
        return { stored: true, kind: sample.kind, discovered: false, evicted };
    }

    // The oldest go first: they are the ones nobody can tell apart, and no distance exists.
    private async offerUnclassified(tx: SpeciesTx, sample: SpeciesSample, candidate: SpeciesCandidate): Promise<OfferResult> {
        const kept = (await tx.ofKind('unclassified')).sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : 1));
        const excess = kept.length + 1 - this.limits.unclassifiedCap;
        const evicted = excess > 0 ? kept.slice(0, excess).map(s => s.id) : [];
        if (evicted.length) await tx.remove(evicted);
        await tx.put(sample, candidate.genome);
        return { stored: true, kind: 'unclassified', discovered: false, evicted };
    }
}
