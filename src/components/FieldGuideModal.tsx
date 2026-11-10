import React, { useEffect, useMemo, useState } from 'react';
import { Modal } from './Modal';
import { PrototypeCanvas } from './PrototypeCanvas';
import { useSpeciesCollection } from './useSpeciesCollection';
import { DownloadIcon, LoaderIcon, SeedlingIcon, TrophyIcon, View3DIcon } from './icons';
import { downloadBlob } from '../lib/downloadFile';
import { collectSamples, type ExportCounts } from '../lib/speciesExport';
import { prototypeOf } from '../lib/species';
import type { CellSummary, Holder } from '../lib/speciesGuide';
import type { SpeciesGrid, SpeciesSource } from '../services/speciesSource';
import type { SeedBankCategory, SeedBankEntry } from '../types';

type Sex = 'male' | 'female' | 'both';

interface FieldGuideModalProps {
    isOpen: boolean;
    onClose: () => void;
    source: SpeciesSource;
    champions: SeedBankEntry[];
    /** The species to show when it opens ("x,y"). */
    initialCell?: string | null;
    onDownload: (genome: string, id: string) => void;
    onView3D: (genome: string, sex: Sex) => void;
    onPlant?: (genome: string, sex: Sex) => void;
    intervalMs?: number;
    /** Hands a file to the browser to save; only a test changes it. */
    onSave?: (blob: Blob, fileName: string) => void;
    appVersion?: string;
    /** Flowers the species workers have not classified yet (what the simulation says); nothing is said when it is not known or none. */
    waiting?: number;
}

const CATEGORY_TITLES: Record<SeedBankCategory, string> = {
    longestLived: 'Longest lived',
    mostToxic: 'Most toxic',
    mostHealing: 'Most healing',
};

function holderValue(holder: Holder): string {
    switch (holder.category) {
        case 'longestLived':
            return `${holder.age ?? '?'} ticks`;
        case 'mostToxic':
            return holder.toxicity === undefined ? '?' : `${(holder.toxicity * 100).toFixed(0)}% toxicity`;
        case 'mostHealing':
            return holder.toxicity === undefined ? '?' : `${(holder.toxicity * -100).toFixed(0)}% healing`;
    }
}

function cellLabel(cell: CellSummary): string {
    const champion = cell.champions.length > 0 ? ', home of a champion' : '';
    return `${cell.name}, ${cell.discovered ? 'discovered' : 'not discovered'}${champion}`;
}

export const FieldGuideModal: React.FC<FieldGuideModalProps> = ({
    isOpen,
    onClose,
    source,
    champions,
    initialCell = null,
    onDownload,
    onView3D,
    onPlant,
    intervalMs,
    onSave = downloadBlob,
    appVersion = import.meta.env.VITE_APP_VERSION,
    waiting,
}) => {
    const { collection, wantImages } = useSpeciesCollection(source, champions, isOpen, intervalMs);
    const [selectedKey, setSelectedKey] = useState<string | null>(initialCell);

    useEffect(() => {
        if (isOpen) setSelectedKey(initialCell);
    }, [isOpen, initialCell]);

    const selected = collection.status === 'ready' ? (collection.summary.cells.find(c => c.key === selectedKey) ?? null) : null;
    const holderIds = useMemo(() => selected?.holders.map(h => h.id) ?? [], [selected]);
    useEffect(() => {
        if (holderIds.length > 0) wantImages(holderIds);
    }, [holderIds, wantImages]);

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Field Guide" size="screen">
            <div className="h-full overflow-y-auto p-4 space-y-4">
                {collection.status === 'loading' && (
                    <div className="flex items-center justify-center h-48">
                        <LoaderIcon className="w-10 h-10 animate-spin text-tertiary" />
                    </div>
                )}
                {collection.status === 'unavailable' && (
                    <p className="text-center text-secondary py-12">The species classifier is not ready yet. Try again in a moment.</p>
                )}
                {collection.status === 'ready' && (
                    <>
                        <Header summary={collection.summary} cap={collection.limits.cap} waiting={waiting} />
                        <CollectionControls source={source} summary={collection.summary} storage={collection.storage} onSave={onSave} appVersion={appVersion} />
                        <div className="space-y-4 xl:space-y-0 xl:grid xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] xl:gap-4">
                            <div className="overflow-x-auto">
                                <div
                                    role="group"
                                    aria-label={`Species map: ${collection.summary.discovered} of ${collection.summary.total} species discovered`}
                                    className="grid gap-1 min-w-[40rem]"
                                    style={{ gridTemplateColumns: `repeat(${collection.grid.w}, minmax(0, 1fr))` }}
                                >
                                    {collection.summary.cells.map(cell => (
                                        <SpeciesCell
                                            key={cell.key}
                                            cell={cell}
                                            grid={collection.grid}
                                            image={cell.representativeId ? collection.images[cell.representativeId] : undefined}
                                            selected={cell.key === selectedKey}
                                            onSelect={() => setSelectedKey(cell.key === selectedKey ? null : cell.key)}
                                        />
                                    ))}
                                </div>
                            </div>
                            {/* beside the map on a wide screen, below it on a narrow one */}
                            <div className="xl:sticky xl:top-0 xl:self-start">
                                {selected ? (
                                    <SpeciesDetail
                                        cell={selected}
                                        grid={collection.grid}
                                        images={collection.images}
                                        source={source}
                                        onDownload={onDownload}
                                        onView3D={onView3D}
                                        onPlant={onPlant}
                                    />
                                ) : (
                                    <p className="text-sm text-secondary text-center">Select a species to see its records.</p>
                                )}
                            </div>
                        </div>
                    </>
                )}
            </div>
        </Modal>
    );
};

const Header: React.FC<{
    summary: { discovered: number; total: number; samples: number; atypical: number; unclassified: number; stale: number };
    cap: number;
    waiting?: number;
}> = ({ summary, cap, waiting }) => (
    <div className="space-y-1">
        <p className="text-lg font-semibold text-primary">
            {summary.discovered} / {summary.total} species discovered
        </p>
        <p className="text-sm text-secondary">
            {summary.samples} samples kept · {summary.atypical} atypical · {summary.unclassified} without a species
        </p>
        <p className="text-sm text-secondary">Each species keeps up to {cap} samples.</p>
        {(waiting ?? 0) > 0 && (
            <p className="text-sm text-secondary">
                {waiting} {waiting === 1 ? 'flower is' : 'flowers are'} waiting to be classified.
            </p>
        )}
        {summary.stale > 0 && (
            <p role="status" className="text-sm text-accent-yellow">
                Updating the collection for a new classifier: {summary.stale} {summary.stale === 1 ? 'sample' : 'samples'} left.
            </p>
        )}
    </div>
);

function formatBytes(bytes: number): string {
    if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
    return `${Math.max(1, Math.round(bytes / 1024 ** 2))} MB`;
}

function savedText(counts: ExportCounts): string {
    if (counts.flowers === 0) return 'There was nothing to save yet.';
    const parts = [`Saved ${counts.flowers} flowers from ${counts.species} species`];
    const more = [counts.atypical > 0 && `${counts.atypical} atypical`, counts.unclassified > 0 && `${counts.unclassified} without a species`].filter(Boolean);
    if (more.length > 0) parts.push(`(${more.join(', ')})`);
    return `${parts.join(' ')}.${counts.skipped > 0 ? ` ${counts.skipped} left out: their genome could not be read.` : ''}`;
}

const CollectionControls: React.FC<{
    source: SpeciesSource;
    summary: { samples: number; atypical: number; unclassified: number; stale: number };
    storage: { usage: number; quota: number } | null;
    onSave: (blob: Blob, fileName: string) => void;
    appVersion: string;
}> = ({ source, summary, storage, onSave, appVersion }) => {
    const [includeUnclassified, setIncludeUnclassified] = useState(true);
    const [collecting, setCollecting] = useState(false);
    const [result, setResult] = useState<{ text: string; failed: boolean } | null>(null);

    const nothingToCollect = summary.samples + summary.atypical + (includeUnclassified ? summary.unclassified : 0) === 0;

    const collect = async () => {
        setCollecting(true);
        try {
            const files = await collectSamples(source, { includeUnclassified, appVersion });
            onSave(new Blob(files.samples, { type: 'application/json' }), `${files.fileBase}.json`);
            onSave(new Blob([files.manifest], { type: 'application/json' }), `${files.fileBase}-manifest.json`);
            setResult({ text: savedText(files.counts), failed: false });
        } catch (error) {
            console.error('Field guide: could not collect the samples.', error);
            setResult({ text: 'The samples could not be collected.', failed: true });
        } finally {
            setCollecting(false);
        }
    };

    return (
        <div className="bg-surface-hover/50 rounded-lg p-3 space-y-2">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <button
                    type="button"
                    onClick={collect}
                    disabled={collecting || summary.stale > 0 || nothingToCollect}
                    className="flex items-center gap-2 px-3 py-1.5 bg-surface-hover hover:bg-border/20 text-primary font-semibold rounded-md transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Save the collection as the files the species classifier is trained on"
                >
                    {collecting ? <LoaderIcon className="w-4 h-4 animate-spin" /> : <DownloadIcon className="w-4 h-4" />}
                    {collecting ? 'Collecting…' : 'Collect samples'}
                </button>
                <label className="flex items-center gap-2 text-sm text-secondary">
                    <input type="checkbox" checked={includeUnclassified} onChange={e => setIncludeUnclassified(e.target.checked)} />
                    Include samples without a species
                </label>
            </div>
            {summary.stale > 0 && <p className="text-xs text-secondary">Samples can be collected when the collection has been updated.</p>}
            {result && (
                <p role="status" className={`text-sm ${result.failed ? 'text-accent-red' : 'text-secondary'}`}>
                    {result.text}
                </p>
            )}
            {storage && (
                <p className="text-xs text-secondary">
                    Storage used by this site: {formatBytes(storage.usage)} of {formatBytes(storage.quota)}
                </p>
            )}
        </div>
    );
};

const SpeciesCell: React.FC<{
    cell: CellSummary;
    grid: SpeciesGrid;
    image?: string;
    selected: boolean;
    onSelect: () => void;
}> = ({ cell, grid, image, selected, onSelect }) => {
    const pixels = useMemo(() => prototypeOf(grid, cell.x, cell.y), [grid, cell.x, cell.y]);
    return (
        <button
            type="button"
            onClick={onSelect}
            aria-label={cellLabel(cell)}
            aria-pressed={selected}
            title={cell.discovered ? cell.name : 'Not discovered yet'}
            className={`relative aspect-square rounded border-2 p-0.5 flex items-center justify-center ${selected ? 'border-accent-yellow' : 'border-border/40'} ${cell.discovered ? 'bg-black/50' : 'bg-black/20'}`}
        >
            {cell.discovered && image ? (
                <img src={image} alt="" className="w-full h-full object-contain" />
            ) : (
                <PrototypeCanvas pixels={pixels} size={grid.n} className={`w-full h-full ${cell.discovered ? 'opacity-80' : 'opacity-25'}`} />
            )}
            {cell.champions.length > 0 && <TrophyIcon className="absolute top-0.5 right-0.5 w-3.5 h-3.5 text-accent-yellow" />}
        </button>
    );
};

const SpeciesDetail: React.FC<{
    cell: CellSummary;
    grid: SpeciesGrid;
    images: Record<string, string>;
    source: SpeciesSource;
    onDownload: FieldGuideModalProps['onDownload'];
    onView3D: FieldGuideModalProps['onView3D'];
    onPlant?: FieldGuideModalProps['onPlant'];
}> = ({ cell, grid, images, source, onDownload, onView3D, onPlant }) => {
    const pixels = useMemo(() => prototypeOf(grid, cell.x, cell.y), [grid, cell.x, cell.y]);
    const withGenome = async (holder: Holder, then: (genome: string) => void) => {
        const stored = await source.genome(holder.id);
        if (stored) then(stored.genome);
    };

    return (
        <section aria-label={`${cell.name}`} className="bg-surface-hover/50 rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-4">
                <PrototypeCanvas pixels={pixels} size={grid.n} className="w-16 h-16 bg-black/50 rounded opacity-80" />
                <div>
                    <h4 className="text-lg font-bold text-primary">{cell.name}</h4>
                    <p className="text-sm text-secondary">
                        {cell.discovered
                            ? `${cell.samples} samples kept${cell.atypical > 0 ? ` · ${cell.atypical} atypical` : ''}`
                            : 'Not discovered yet. A flower of this shape has to mature in the garden.'}
                    </p>
                    {cell.champions.length > 0 && (
                        <p className="text-sm text-accent-yellow flex items-center gap-1">
                            <TrophyIcon className="w-4 h-4" />
                            Home of the champion: {cell.champions.map(c => CATEGORY_TITLES[c]).join(', ')}
                        </p>
                    )}
                </div>
            </div>

            {cell.holders.length > 0 && (
                <ul className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {cell.holders.map(holder => (
                        <li key={holder.category} className="bg-surface-hover/50 rounded-lg p-3 flex flex-col">
                            <h5 className="font-semibold text-primary">{CATEGORY_TITLES[holder.category]}</h5>
                            <p className="text-sm text-accent-yellow font-bold mb-2">{holderValue(holder)}</p>
                            <div className="bg-black/50 rounded flex items-center justify-center p-2 aspect-square">
                                {images[holder.id] ? (
                                    <img
                                        src={images[holder.id]}
                                        alt={`${cell.name}: ${CATEGORY_TITLES[holder.category].toLowerCase()}`}
                                        className="w-full h-full object-contain"
                                    />
                                ) : (
                                    <LoaderIcon className="w-6 h-6 animate-spin text-tertiary" />
                                )}
                            </div>
                            <div className="grid grid-cols-1 gap-2 mt-3 pt-3 border-t border-border/50">
                                <button
                                    type="button"
                                    onClick={() => withGenome(holder, genome => onDownload(genome, `${cell.key.replace(',', '-')}_${holder.category}`))}
                                    className="flex items-center justify-center gap-2 text-sm p-2 bg-surface-hover rounded-md hover:bg-border/20 transition-colors"
                                    title="Download genome as a JSON file"
                                >
                                    <DownloadIcon className="w-4 h-4" />
                                    Download
                                </button>
                                <button
                                    type="button"
                                    onClick={() => withGenome(holder, genome => onView3D(genome, holder.sex))}
                                    className="flex items-center justify-center gap-2 text-sm p-2 bg-surface-hover rounded-md hover:bg-border/20 transition-colors"
                                    title="View 3D model"
                                >
                                    <View3DIcon className="w-4 h-4" />
                                    View 3D
                                </button>
                                {onPlant && (
                                    <button
                                        type="button"
                                        onClick={() => withGenome(holder, genome => onPlant(genome, holder.sex))}
                                        className="flex items-center justify-center gap-2 text-sm p-2 bg-surface-hover rounded-md hover:bg-border/20 transition-colors"
                                        title="Plant a seed of this flower in the garden"
                                    >
                                        <SeedlingIcon className="w-4 h-4" />
                                        Plant
                                    </button>
                                )}
                            </div>
                        </li>
                    ))}
                </ul>
            )}
            {cell.discovered && cell.holders.length === 0 && (
                <p className="text-sm text-secondary">No flower of this species has finished its life yet, so it holds no records.</p>
            )}
        </section>
    );
};
