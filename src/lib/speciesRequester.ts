import type { AppEvent, CellContent, Flower, SpeciesMatch, SpeciesRequest, SpeciesResult, WorkersSummary } from '../types';

// Mature flowers are asked for once; ids of flowers that are gone are forgotten now and then.
const PRUNE_EVERY_TICKS = 100;

/**
 * The simulation worker's side of the species collection: asks the flower worker to classify
 * each flower once it is mature, and turns a discovery into an event for the player.
 *
 * Looking at every flower of the tick, not at the moment of maturing, is deliberate: a flower
 * matures in the behaviour, or arrives mature from the flower factory, or comes from a save,
 * and one scan covers all three.
 */
const AVERAGE_OVER = 50;

export class SpeciesRequester {
    // Flower ids are "flower-x-y", so a flower that grows where another died has the same id: what
    // tells them apart is the genome (the string held here is the flower's own, not a copy).
    private requested = new Map<string, string>();
    // What is asked and not answered, by flower id and tick (an id is reused, the two together are not), and the
    // species each flower was classified in, by genome, to give back with its death.
    private outstanding = new Map<string, string>();
    private known = new Map<string, { match: SpeciesMatch; fp: string }>();
    private events: AppEvent[] = [];
    // What was asked of the species worker and what came back: the difference is what waits.
    private asked = 0;
    private answered = 0;
    // Classifications the simulation let go because the queue was full: nobody will answer them.
    private dropped = 0;
    private byStatus: WorkersSummary['species']['byStatus'] = {};
    private durations: number[] = [];
    // The different species of the living mature flowers that have been classified, as the last tick saw them.
    private aliveSpecies = 0;

    constructor(private readonly post: (message: { type: string; payload: SpeciesRequest }) => void) {}

    requestMature(actors: Iterable<CellContent>, tick: number): void {
        const present = tick % PRUNE_EVERY_TICKS === 0 ? new Set<string>() : null;
        const alive = new Set<string>();
        for (const actor of actors) {
            if (actor.type !== 'flower') continue;
            present?.add(actor.id);
            const species = actor.isMature ? this.known.get(actor.genome) : undefined;
            if (species) alive.add(`${species.match.x},${species.match.y}`);
            if (!actor.isMature || this.requested.get(actor.id) === actor.genome) continue;
            this.requested.set(actor.id, actor.genome);
            this.outstanding.set(`${actor.id}@${tick}`, actor.genome);
            this.asked++;
            this.post({ type: 'classify-flower', payload: this.requestOf(actor, tick) });
        }
        this.aliveSpecies = alive.size;
        if (present) {
            for (const id of this.requested.keys()) if (!present.has(id)) this.requested.delete(id);
            const live = new Set(this.requested.values());
            for (const genome of this.known.keys()) if (!live.has(genome)) this.known.delete(genome);
        }
    }

    /**
     * A flower that was asked for died: its species may have a new record. One that never matured
     * was never asked for, and is not a flower of a species.
     */
    reportDeath(flower: Flower, tick: number): void {
        if (this.requested.get(flower.id) !== flower.genome) return;
        this.asked++;
        // with the species the flower was classified in, when it is known: the worker need not classify it again
        this.post({ type: 'record-flower', payload: { ...this.requestOf(flower, tick), ...this.known.get(flower.genome) } });
    }

    /** A classification the queue let go: it will get no answer. It stays asked for, so it is not asked again. */
    discard(message: { type: string; payload?: unknown }): void {
        if (message.type !== 'classify-flower') return;
        const { flowerId, tick } = (message.payload ?? {}) as Partial<SpeciesRequest>;
        if (this.outstanding.delete(`${flowerId}@${tick}`)) this.dropped++;
    }

    receive(result: SpeciesResult): void {
        if (!result) return;
        this.answered++;
        this.keepSpecies(result);
        this.byStatus[result.status] = (this.byStatus[result.status] ?? 0) + 1;
        if (typeof result.durationMs === 'number' && Number.isFinite(result.durationMs) && result.durationMs >= 0) {
            this.durations.push(result.durationMs);
            if (this.durations.length > AVERAGE_OVER) this.durations.shift();
        }
        if (result.status !== 'discovered' || !result.species) return;
        this.events.push({ message: `🌸 New species discovered: ${result.species.name}!`, type: 'success', importance: 'high' });
    }

    private keepSpecies(result: SpeciesResult): void {
        if (typeof result.tick !== 'number') return;
        const key = `${result.flowerId}@${result.tick}`;
        const genome = this.outstanding.get(key);
        this.outstanding.delete(key);
        if (genome !== undefined && result.match && result.fp) this.known.set(genome, { match: result.match, fp: result.fp });
    }

    private requestOf(flower: Flower, tick: number): SpeciesRequest {
        return {
            flowerId: flower.id, genome: flower.genome, image: flower.imageData,
            sex: flower.sex, age: flower.age, toxicity: flower.toxicityRate, tick,
        };
    }

    /** How many different species grow in the garden now, among the flowers that were classified (the newest may not have been yet). */
    getAliveSpecies(): number {
        return this.aliveSpecies;
    }

    takeEvents(): AppEvent[] {
        const events = this.events;
        this.events = [];
        return events;
    }

    getStats(): WorkersSummary['species'] {
        return {
            waiting: Math.max(0, this.asked - this.answered - this.dropped),
            dropped: this.dropped,
            answered: this.answered,
            byStatus: { ...this.byStatus },
            avgMs: this.durations.length > 0 ? this.durations.reduce((a, b) => a + b, 0) / this.durations.length : null,
        };
    }

    reset(): void {
        this.requested.clear();
        this.outstanding.clear();
        this.known.clear();
        this.events = [];
        this.asked = 0;
        this.answered = 0;
        this.dropped = 0;
        this.byStatus = {};
        this.durations = [];
        this.aliveSpecies = 0;
    }
}
