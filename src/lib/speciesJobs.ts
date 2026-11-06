import { genomeId, parseSom, speciesName } from './species';
import type { SpeciesRepository, OfferResult, SpeciesLimits } from './speciesRepository';
import type { SeedBankEntry, SpeciesClassifier, SpeciesMatch, SpeciesRecordRequest, SpeciesRequest, SpeciesResult } from '../types';

type Job =
    | { kind: 'classify'; request: SpeciesRequest }
    | { kind: 'record'; request: SpeciesRecordRequest };

// Few at a time: a chunk is one call that cannot be interrupted, and a chunk takes the turn of one species job
// between two flowers, so about 0.3 s of the garden's waiting for each flower that is made.
export const MIGRATION_CHUNK = 3;

// Enough to remember the flowers that matured and will die soon; it only saves classifying again.
const MATCHES_REMEMBERED = 500;

// How far down the queue to look for flowers to classify together: a stored genome costs a read to find out.
const LOOKAHEAD_FACTOR = 3;

export interface SpeciesJobsOptions {
    /**
     * Flowers classified in one call. One call has a fixed cost of about 50 ms (the classifier is parsed) and
     * about 25 ms for each flower, so a batch of 30 is about 2.4 times as fast as one by one. A call cannot be
     * interrupted, so a worker that has other work between two jobs keeps it at 1.
     */
    batchSize?: number;
    /** Samples classified again in each step of the migration. */
    migrationChunk?: number;
    now?: () => number;
}

/**
 * The champion of the seed bank as a flower to record: all it knows is the value it won with, so
 * it can only take the record of its own category in its species.
 */
export function championRequest(entry: SeedBankEntry): SpeciesRecordRequest {
    const request: SpeciesRecordRequest = {
        flowerId: `champion-${entry.category}`, genome: entry.genome, image: entry.imageData,
        sex: entry.sex, tick: 0, only: [entry.category],
    };
    if (entry.category === 'longestLived') request.age = entry.value;
    else request.toxicity = entry.value;
    return request;
}

/**
 * The classification work of the flower worker. Classifying takes about 0.1 s, so the worker
 * runs one job at a time and only when it has no flower to create.
 */
export class SpeciesJobs {
    private queue: Job[] = [];
    // What the classifier said about the flowers that were classified lately, by genome id.
    private matches = new Map<string, SpeciesMatch | null>();
    private gridWidth: number | null = null;
    private migrating = false;

    private rejectedLimits: string | null = null;

    private readonly batchSize: number;
    private readonly migrationChunk: number;
    private readonly now: () => number;
    // The share of a batch's time each of its flowers carries, until its job is run.
    private shares = new Map<string, number>();
    // What the job in hand cost to classify: nothing if its match was known, its own time if it was classified
    // by itself, or its share of a batch.
    private classifiedHere = false;
    private shareUsed: number | null = null;

    /** `readLimits` gives the limits the player chose, read before each job so a change is picked up without a message. */
    constructor(
        private readonly classifier: SpeciesClassifier,
        private readonly repository: SpeciesRepository,
        private readonly readLimits?: () => Promise<Partial<SpeciesLimits> | undefined>,
        options: SpeciesJobsOptions = {},
    ) {
        this.batchSize = Math.max(1, Math.floor(options.batchSize ?? 1));
        this.migrationChunk = Math.max(1, Math.floor(options.migrationChunk ?? MIGRATION_CHUNK));
        this.now = options.now ?? (() => performance.now());
    }

    enqueue(request: SpeciesRequest): void {
        this.add({ kind: 'classify', request });
    }

    /** A flower that died, or a champion, to take the records of its species it beats. */
    enqueueRecord(request: SpeciesRecordRequest): void {
        this.add({ kind: 'record', request });
    }

    private add(job: Job): void {
        // The same flower, not the same id: ids are "flower-x-y" and a cell is used again.
        const same = (other: Job) => other.kind === job.kind && other.request.flowerId === job.request.flowerId && other.request.genome === job.request.genome;
        if (!this.queue.some(same)) this.queue.push(job);
    }

    /**
     * Classifies again, with the classifier in use, the samples another one placed (after an update
     * of fe-wasm). It goes before the other jobs, which wait: the species of the samples do not mean
     * the same before and after. Nothing to do if none is stale.
     */
    startMigration(): void {
        this.migrating = true;
    }

    hasWork(): boolean {
        return this.migrating || this.queue.length > 0;
    }

    cancelAll(): void {
        this.queue = [];
        this.shares.clear();
    }

    /** `null` when there is no answer to send. Never throws: a flower that fails must not stop the next one. */
    async runNext(): Promise<SpeciesResult | null> {
        await this.refreshLimits();
        if (this.migrating) {
            await this.migrateChunk();
            return null;
        }
        const job = this.queue.shift();
        if (!job) return null;
        const { flowerId } = job.request;

        try {
            // The job in hand is out of the queue, so cancelling while the batch is classified does not take it away.
            await this.prime(job);
            await this.prefetch(job);
            this.classifiedHere = false;
            this.shareUsed = null;
            const startedAt = this.now();
            const result = job.kind === 'classify' ? await this.classify(job.request) : await this.record(job.request);
            const own = this.now() - startedAt;
            if (this.classifiedHere) result.durationMs = own;
            else if (this.shareUsed !== null) result.durationMs = own + this.shareUsed;
            return result;
        } catch (error) {
            console.error('Species work: species classification failed.', error);
            return { flowerId, status: 'failed' };
        }
    }

    /**
     * Classifies in one call the job in hand and the ones behind it that will need a classification, and
     * remembers the answers as if each had been classified on its own, so the jobs run as they always did.
     * If the call fails, nothing is remembered and each job classifies by itself.
     */
    private async prefetch(first: Job): Promise<void> {
        if (this.batchSize <= 1) return;
        try {
            const wanted = new Map<string, string>();
            const candidates = [first, ...this.queue.slice(0, this.batchSize * LOOKAHEAD_FACTOR)];
            for (const job of candidates) {
                if (wanted.size >= this.batchSize) break;
                const { genome } = job.request;
                await this.prime(job);
                const id = await genomeId(genome);
                if (wanted.has(id) || this.matches.has(id) || await this.repository.isStored(genome)) continue;
                wanted.set(id, genome);
            }
            if (wanted.size === 0) return;

            const startedAt = this.now();
            const matches = await this.classifier.classifyBatch([...wanted.values()]);
            if (matches.length !== wanted.size) throw new Error(`the batch gave ${matches.length} answers for ${wanted.size} flowers`);
            const share = (this.now() - startedAt) / wanted.size;
            [...wanted.keys()].forEach((id, i) => {
                this.remember(id, matches[i]);
                this.shares.set(id, share);
            });
        } catch (error) {
            console.warn('Species work: a batch could not be classified, going on one by one.', error);
        }
    }

    /**
     * A death that comes with the species of its flower, from a classifier that is the one here, needs no
     * classifying: the match is remembered where the ones classified here are.
     */
    private async prime(job: Job): Promise<void> {
        if (job.kind !== 'record') return;
        const { genome, match, fp } = job.request as SpeciesRecordRequest;
        if (!match || fp !== this.classifier.fingerprint) return;
        const id = await genomeId(genome);
        if (!this.matches.has(id)) this.remember(id, match);
    }

    private remember(id: string, match: SpeciesMatch | null): void {
        if (this.matches.size >= MATCHES_REMEMBERED) this.matches.delete(this.matches.keys().next().value!);
        this.matches.set(id, match);
    }

    // What goes wrong here must not stop the work: the limits in use stay as they were.
    private async refreshLimits(): Promise<void> {
        if (!this.readLimits) return;
        let chosen: Partial<SpeciesLimits> | undefined;
        try {
            chosen = await this.readLimits();
            if (!chosen) return;
            const before = this.repository.limits;
            this.repository.setLimits(chosen);
            this.rejectedLimits = null;
            if (this.repository.limits.cap < before.cap) await this.repository.trim();
        } catch (error) {
            const text = JSON.stringify(chosen);
            if (text !== this.rejectedLimits) console.warn('Flower Worker: the limits of the species collection were not applied.', error);
            this.rejectedLimits = text;
        }
    }

    private async migrateChunk(): Promise<void> {
        try {
            const fp = this.classifier.fingerprint;
            const chunk = await this.repository.staleChunk(fp, this.migrationChunk);
            if (chunk.length === 0) {
                this.migrating = false;
                return;
            }
            const genomes = chunk.flatMap(c => (c.genome === null ? [] : [c.genome]));
            const matches = genomes.length > 0 ? await this.classifier.classifyBatch(genomes) : [];
            let next = 0;
            const results = chunk.map(c => ({ id: c.id, match: c.genome === null ? ('gone' as const) : matches[next++] }));
            if (await this.repository.migrate(fp, results)) this.migrating = false;
        } catch (error) {
            // It starts again at the next start; going on here could only fail the same way.
            console.error('Flower Worker: could not classify the species collection again.', error);
            this.migrating = false;
        }
    }

    private async classify(request: SpeciesRequest): Promise<SpeciesResult> {
        const { flowerId, genome } = request;
        if (await this.repository.isStored(genome)) return { flowerId, status: 'skipped' };

        const match = await this.matchOf(genome);
        const offered = await this.repository.offer({
            genome, match, fp: this.classifier.fingerprint,
            sex: request.sex, age: request.age, toxicity: request.toxicity, tick: request.tick, image: request.image,
        });
        return { ...this.result(flowerId, statusOf(offered), match), tick: request.tick };
    }

    private async record(request: SpeciesRecordRequest): Promise<SpeciesResult> {
        const { flowerId, genome } = request;
        // A genome that is stored has its species in the collection and needs no classifying.
        const match = (await this.repository.isStored(genome)) ? null : await this.matchOf(genome);
        const recorded = await this.repository.record({
            genome, match, fp: this.classifier.fingerprint, sex: request.sex,
            age: request.age, toxicity: request.toxicity, tick: request.tick, image: request.image,
        }, request.only);
        const status = recorded.discovered ? 'discovered' : recorded.recorded.length > 0 ? 'recorded' : 'unchanged';
        return this.result(flowerId, status, match);
    }

    private async matchOf(genome: string): Promise<SpeciesMatch | null> {
        const id = await genomeId(genome);
        if (this.matches.has(id)) {
            const share = this.shares.get(id);
            if (share !== undefined) {
                this.shareUsed = share;
                this.shares.delete(id);
            }
            return this.matches.get(id)!;
        }
        const match = await this.classifier.classify(genome);
        this.classifiedHere = true;
        this.remember(id, match);
        return match;
    }

    private result(flowerId: string, status: SpeciesResult['status'], match: SpeciesMatch | null): SpeciesResult {
        const result: SpeciesResult = { flowerId, status };
        if (match) {
            result.species = { x: match.x, y: match.y, name: speciesName(match.x, match.y, this.mapWidth()) };
            result.match = match;
            result.fp = this.classifier.fingerprint;
        }
        return result;
    }

    private mapWidth(): number {
        return (this.gridWidth ??= parseSom(this.classifier.classifierJson()).w);
    }
}

function statusOf(offered: OfferResult): SpeciesResult['status'] {
    if (!offered.stored) return offered.reason === 'duplicate' ? 'skipped' : 'dropped';
    if (offered.discovered) return 'discovered';
    return offered.kind === 'unclassified' ? 'unclassified' : 'stored';
}
