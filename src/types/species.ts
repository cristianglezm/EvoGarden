import type { SpeciesMatch, SOMEnvironment } from '@cristianglezm/flower-evolver-wasm';
import type { SeedBankCategory } from './ui';

export type { SpeciesMatch, SOMEnvironment };

/** The parts of a classifier's JSON the UI needs: the grid and the prototype weights. */
export interface SpeciesMap {
    w: number;
    h: number;
    /** length of a feature vector */
    dim: number;
    /** side of the square silhouette at the start of each prototype */
    n: number;
    toroidal: boolean;
    /** row-major nodes, `dim` values each */
    weights: number[];
}

export interface AtypicalStats {
    n: number;
    mean: number;
    std: number;
    /** a flower farther from its species than this is atypical */
    above: number;
}

/**
 * Classifies flowers into the species of the classifier embedded in the wasm module. Kept apart
 * from FEService: that interface is faked by many tests and the species work needs none of it.
 */
export interface SpeciesClassifier {
    /** Identifies the classifier in use; stored with every result because a cell means nothing without it. */
    readonly fingerprint: string;
    /** The classifier's JSON, for drawing the prototypes and for the fingerprint. */
    classifierJson(): string;
    /** The version of fe-wasm the classifier comes from. */
    readonly version: string;
    /** `null` for a flower that has no species (malformed genome, network that overflows). */
    classify(genome: string): Promise<SpeciesMatch | null>;
    /** One entry per genome, in order, `null` where `classify` would give `null`. */
    classifyBatch(genomes: string[]): Promise<Array<SpeciesMatch | null>>;
}

/**
 * `sample` counts towards the cap of its cell; `atypical` is a flower far from its species, kept
 * outside that cap; `unclassified` is a flower the classifier could not place.
 */
export type SampleKind = 'sample' | 'atypical' | 'unclassified';

/**
 * What the policy needs to know about a stored flower. The genome (about 15 KB) lives in its own
 * table: IndexedDB reads whole rows, and the policy looks at every sample of a cell on each offer.
 */
export interface SpeciesSample {
    /** see genomeId() */
    id: string;
    /** "x,y", or "none" for an unclassified flower; see cellKey() */
    cell: string;
    x: number | null;
    y: number | null;
    /** distance to the species' prototype, `null` when unclassified */
    d: number | null;
    /** fingerprint of the classifier that made `cell`, see SpeciesClassifier.fingerprint */
    fp: string;
    kind: SampleKind;
    /** the first flower of its cell, the one that discovered the species; never evicted */
    founder: boolean;
    /** the records of its cell this flower holds; never evicted while it holds one */
    records: SeedBankCategory[];
    sex: 'male' | 'female' | 'both';
    age?: number;
    toxicity?: number;
    tick?: number;
    createdAt: number;
}

export interface SpeciesGenome {
    id: string;
    genome: string;
    /** only kept for founders and record holders */
    image?: string;
}

/** Everything a storage must do inside one transaction. */
export interface SpeciesTx {
    get(id: string): Promise<SpeciesSample | undefined>;
    inCell(cell: string): Promise<SpeciesSample[]>;
    ofKind(kind: SampleKind): Promise<SpeciesSample[]>;
    /** the `d` of every stored sample that has one, without reading the rows */
    distances(): Promise<number[]>;
    genome(id: string): Promise<SpeciesGenome | undefined>;
    /** Samples classified by another classifier than `fp`, at most `limit`. */
    stale(fp: string, limit: number): Promise<SpeciesSample[]>;
    /** Every sample, without the genomes. */
    all(): Promise<SpeciesSample[]>;
    put(sample: SpeciesSample, genome: string, image?: string): Promise<void>;
    /** Changes the row of a sample that is stored, leaving its genome and image as they are. */
    update(sample: SpeciesSample): Promise<void>;
    /** removes the samples and their genomes */
    remove(ids: string[]): Promise<void>;
}

/**
 * A transaction must be atomic and isolated: the garden classifies in one worker and records
 * champions in another, and both read a cell before they write it. If `fn` throws, nothing is kept.
 */
export interface SpeciesStore {
    transaction<T>(fn: (tx: SpeciesTx) => Promise<T>): Promise<T>;
}

/** A setting of the species collection, kept next to it so the flower worker can read it (workers have no localStorage). */
export interface SpeciesMeta {
    key: string;
    value: unknown;
}

/** What a new classifier made of a stored sample; `gone` if its genome is not there to classify. */
export interface MigrationResult {
    id: string;
    match: SpeciesMatch | null | 'gone';
}

/** Simulation worker → flower worker: classify this flower, it has matured. */
export interface SpeciesRequest {
    flowerId: string;
    genome: string;
    /** kept only if the flower discovers its species */
    image: string;
    sex: SpeciesSample['sex'];
    age: number;
    toxicity: number;
    tick: number;
}

/**
 * - `discovered`: first flower of its species
 * - `stored`: kept, the species was known
 * - `unclassified`: kept, it has no species
 * - `skipped`: already stored, not classified again
 * - `dropped`: classified but not kept (no farther from its species than what is there, or nothing there may be replaced)
 * - `recorded`: a flower that died (or a champion) holds a record of its species now
 * - `unchanged`: it held none, or it has no species
 * - `failed`: the classifier or the storage threw
 */
export type SpeciesStatus = 'discovered' | 'stored' | 'unclassified' | 'skipped' | 'dropped' | 'recorded' | 'unchanged' | 'failed';

/** Flower worker → simulation worker. */
export interface SpeciesResult {
    flowerId: string;
    status: SpeciesStatus;
    species?: { x: number; y: number; name: string };
    /** milliseconds this flower took to classify (a share of its batch), only for a flower that was classified */
    durationMs?: number;
    /**
     * What the classifier said, with the classifier that said it, for a flower that has a species: the simulation
     * keeps it and gives it back with the flower's death, so no worker has to classify the flower again.
     */
    match?: SpeciesMatch;
    fp?: string;
    /** the tick of the request this answers: a flower id is reused, the id and the tick are not */
    tick?: number;
}

/**
 * Simulation worker → flower worker when a flower that was classified dies (`record-flower`), and
 * made by the flower worker from the champions of the seed bank. Only the values it knows are
 * set: a champion knows one.
 */
export interface SpeciesRecordRequest {
    flowerId: string;
    genome: string;
    image: string;
    sex: SpeciesSample['sex'];
    tick: number;
    age?: number;
    toxicity?: number;
    /** the records it may take, all if absent */
    only?: SeedBankCategory[];
    /** the species the flower was classified in, if the simulation knows it, and by which classifier */
    match?: SpeciesMatch;
    fp?: string;
}
