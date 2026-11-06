import type { AtypicalStats, SeedBankCategory, SOMEnvironment, SpeciesMap, SpeciesMatch } from '../types';

const SPECIES_ADJECTIVES = ['Slender', 'Ruffled', 'Spiral', 'Stout', 'Feathered', 'Rounded',
    'Ragged', 'Delicate', 'Sprawling', 'Compact', 'Pointed', 'Gentle'];
const SPECIES_NOUNS = ['Aster', 'Iris', 'Lotus', 'Poppy', 'Orchid', 'Dahlia',
    'Peony', 'Lily', 'Zinnia', 'Camellia', 'Tulip', 'Daisy'];

/**
 * A genome must always map to the same species whatever the weather is, so species are
 * classified under the classifier's default environment, not each flower's own.
 */
export const SPECIES_ENVIRONMENT: Required<SOMEnvironment> = {
    humidity: 0.5,
    temperature: 20,
    altitude: 0,
    terrainType: 0,
};

/** Fewer flowers than this say nothing about what is usual. */
export const MIN_FLOWERS_FOR_ATYPICAL = 20;

export const RECORD_CATEGORIES: SeedBankCategory[] = ['longestLived', 'mostToxic', 'mostHealing'];

/** Cell key of a flower the classifier could not place; `null` is not a valid IndexedDB key. */
export const NO_CELL = 'none';

/**
 * Classification is by shape, not colour, so the names avoid colour words. A column shares an
 * adjective and a row shares a noun; grids larger than the word lists get a numeric suffix.
 */
export function speciesName(x: number, y: number, gridWidth: number): string {
    const a = SPECIES_ADJECTIVES.length, n = SPECIES_NOUNS.length;
    const block = Math.floor(x / a) + Math.floor(y / n) * Math.ceil(gridWidth / a);
    const name = `${SPECIES_ADJECTIVES[x % a]} ${SPECIES_NOUNS[y % n]}`;
    return block === 0 ? name : `${name} ${block + 1}`;
}

export function cellKey(match: Pick<SpeciesMatch, 'x' | 'y'> | null): string {
    return match ? `${match.x},${match.y}` : NO_CELL;
}

/**
 * Identifies a classifier, not a genome: 32 bits is plenty for a handful of classifiers and
 * far too few for thousands of genomes (see genomeId).
 */
export function fingerprint(text: string): string {
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
        h ^= text.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(16);
}

const SHA256_K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

/**
 * Exported only so a test can pin it against crypto.subtle: genomeId must give the same id
 * with or without crypto.subtle (plain http has none), or ids stored under one would not
 * match the other.
 */
export function sha256Hex(text: string): string {
    const bytes = new TextEncoder().encode(text);
    const padded = new Uint8Array(((bytes.length + 9 + 63) >> 6) << 6);
    padded.set(bytes);
    padded[bytes.length] = 0x80;
    const view = new DataView(padded.buffer);
    // bit length in two 32-bit halves: a genome is far below 2^32 bits but JS shifts are 32-bit
    view.setUint32(padded.length - 8, Math.floor(bytes.length / 0x20000000));
    view.setUint32(padded.length - 4, (bytes.length << 3) >>> 0);

    const h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
    const w = new Uint32Array(64);
    const rotr = (v: number, s: number) => (v >>> s) | (v << (32 - s));
    for (let offset = 0; offset < padded.length; offset += 64) {
        for (let i = 0; i < 16; i++) w[i] = view.getUint32(offset + i * 4);
        for (let i = 16; i < 64; i++) {
            const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
            const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
            w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
        }
        let [a, b, c, d, e, f, g, hh] = h;
        for (let i = 0; i < 64; i++) {
            const t1 = (hh + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + SHA256_K[i] + w[i]) >>> 0;
            const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
            hh = g; g = f; f = e; e = (d + t1) >>> 0;
            d = c; c = b; b = a; a = (t1 + t2) >>> 0;
        }
        h[0] += a; h[1] += b; h[2] += c; h[3] += d; h[4] += e; h[5] += f; h[6] += g; h[7] += hh;
    }
    return Array.from(h, v => v.toString(16).padStart(8, '0')).join('');
}

/**
 * Id of a genome: the first 16 hex characters of its SHA-256 (64 bits), because the id is the
 * key of thousands of stored genomes and a 32-bit hash would collide about once in a hundred
 * collections of that size.
 */
export async function genomeId(genome: string): Promise<string> {
    const subtle = globalThis.crypto?.subtle;
    if (subtle) {
        const digest = await subtle.digest('SHA-256', new TextEncoder().encode(genome));
        return Array.from(new Uint8Array(digest).subarray(0, 8), b => b.toString(16).padStart(2, '0')).join('');
    }
    return sha256Hex(genome).slice(0, 16);
}

/**
 * The distance has no scale of its own, so a flower is atypical when it is farther from its
 * species than the mean plus 2 standard deviations of the distances of all the flowers.
 */
export function atypicalStats(distances: number[]): AtypicalStats | null {
    const n = distances.length;
    if (n < MIN_FLOWERS_FOR_ATYPICAL) return null;
    const mean = distances.reduce((a, b) => a + b, 0) / n;
    const std = Math.sqrt(distances.reduce((a, d) => a + (d - mean) * (d - mean), 0) / n);
    return { n, mean, std, above: mean + 2 * std };
}

/** EvoAI writes the size fields of the classifier as strings, hence Number(). */
export function parseSom(json: string): SpeciesMap {
    const d = JSON.parse(json);
    const som: SpeciesMap = {
        w: Number(d.som.width),
        h: Number(d.som.height),
        dim: Number(d.som.inputDim),
        n: Number(d.input.imageWidth),
        toroidal: d.som.toroidal === true,
        weights: d.som.weights,
    };
    if (!(som.w > 0 && som.h > 0) || som.n * som.n > som.dim || som.weights.length !== som.w * som.h * som.dim) {
        throw new Error('unexpected classifier layout');
    }
    return som;
}

/** The silhouette of a species: the first n*n values of its node, row-major, each an alpha in [0, 1]. */
export function prototypeOf(som: SpeciesMap, x: number, y: number): number[] {
    const start = (y * som.w + x) * som.dim;
    return som.weights.slice(start, start + som.n * som.n);
}

/**
 * The game keeps genomes as `{"Flower": {...}}`, but a `{"Generation": [...]}` batch holds the
 * inner object: the library wraps each entry again itself.
 */
export function toGenerationEntry(genome: string): unknown {
    const flower = JSON.parse(genome)?.Flower;
    if (!flower || typeof flower !== 'object') throw new Error('not a flower genome');
    return flower;
}

export function toGenerationJson(genomes: string[]): string {
    return `{"Generation":[${genomes.map(g => JSON.stringify(toGenerationEntry(g))).join(',')}]}`;
}
