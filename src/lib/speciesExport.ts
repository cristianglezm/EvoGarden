import { NO_CELL, SPECIES_ENVIRONMENT, speciesName, toGenerationEntry } from './species';
import type { SpeciesSource } from '../services/speciesSource';
import type { SpeciesSample } from '../types';

export interface ExportCounts {
    /** in the file */
    flowers: number;
    samples: number;
    atypical: number;
    unclassified: number;
    /** species with at least one flower in the file */
    species: number;
    /** left out because their genome is missing or is not a flower */
    skipped: number;
    /** left out because another classifier placed them and they are waiting to be placed again */
    stale: number;
}

export interface CollectedSamples {
    /** `evogarden-samples-<date>`: the files are `<base>.json` and `<base>-manifest.json` */
    fileBase: string;
    /** the `{"Generation": [...]}` file, in pieces: it can be tens of megabytes */
    samples: string[];
    manifest: string;
    counts: ExportCounts;
}

export interface CollectOptions {
    includeUnclassified: boolean;
    appVersion: string;
    now?: Date;
    /** genomes read at a time */
    batch?: number;
}

const KIND_ORDER = { sample: 0, atypical: 1, unclassified: 2 } as const;

/**
 * The order of the file: the samples of each species, species by species, then the atypical ones
 * with the farthest first, then the ones without a species.
 */
export function orderForExport(rows: SpeciesSample[], width: number): SpeciesSample[] {
    const position = (s: SpeciesSample) => (s.x === null || s.y === null ? Infinity : s.y * width + s.x);
    return [...rows].sort((a, b) =>
        KIND_ORDER[a.kind] - KIND_ORDER[b.kind]
        || (a.kind === 'atypical' ? (b.d ?? 0) - (a.d ?? 0) : position(a) - position(b))
        || a.createdAt - b.createdAt
        || (a.id < b.id ? -1 : 1));
}

/**
 * The collection as the files `som.py --dataset` and the training notebook read: `{"Generation":
 * [...]}` where each entry is the flower object of a genome (not the `{"Flower": ...}` the game
 * keeps), and a manifest that says, flower by flower and in the same order, what the collection
 * knew of it. Every flower is in once. What another classifier placed is left out: its species
 * are of another map.
 */
export async function collectSamples(source: SpeciesSource, options: CollectOptions): Promise<CollectedSamples> {
    const grid = source.grid();
    const all = await source.samples();
    const current = all.filter(r => r.fp === grid.fp);
    const wanted = orderForExport(current.filter(r => options.includeUnclassified || r.cell !== NO_CELL), grid.w);

    const entries: string[] = [];
    const described: Array<Record<string, unknown>> = [];
    let skipped = 0;
    const batch = options.batch ?? 100;
    for (let from = 0; from < wanted.length; from += batch) {
        const rows = wanted.slice(from, from + batch);
        const genomes = await source.genomes(rows.map(r => r.id));
        for (const row of rows) {
            let entry: string;
            try {
                entry = JSON.stringify(toGenerationEntry(genomes[row.id]));
            } catch {
                skipped++;
                continue;
            }
            entries.push(entry);
            described.push({
                index: entries.length - 1,
                id: row.id,
                cell: row.cell === NO_CELL ? null : row.cell,
                species: row.x === null || row.y === null ? null : speciesName(row.x, row.y, grid.w),
                distance: row.d,
                kind: row.kind,
                sex: row.sex,
                ...(row.age !== undefined && { age: row.age }),
                ...(row.toxicity !== undefined && { toxicity: row.toxicity }),
                ...(row.tick !== undefined && { tick: row.tick }),
            });
        }
    }

    const kept = described.map(d => d.kind);
    const counts: ExportCounts = {
        flowers: entries.length,
        samples: kept.filter(k => k === 'sample').length,
        atypical: kept.filter(k => k === 'atypical').length,
        unclassified: kept.filter(k => k === 'unclassified').length,
        species: new Set(described.map(d => d.cell).filter(cell => cell !== null)).size,
        skipped,
        stale: all.length - current.length,
    };

    const now = options.now ?? new Date();
    const manifest = {
        generatedAt: now.toISOString(),
        app: 'EvoGarden',
        appVersion: options.appVersion,
        feWasmVersion: source.version(),
        classifier: { fingerprint: grid.fp, width: grid.w, height: grid.h, inputDim: grid.dim },
        environment: SPECIES_ENVIRONMENT,
        includesUnclassified: options.includeUnclassified,
        counts,
        flowers: described,
    };

    return {
        fileBase: `evogarden-samples-${now.toISOString().slice(0, 10)}`,
        samples: ['{"Generation":[', ...entries.map((entry, i) => (i === 0 ? entry : `,${entry}`)), ']}'],
        manifest: JSON.stringify(manifest, null, 2),
        counts,
    };
}
