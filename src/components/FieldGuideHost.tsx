import React, { useCallback, useEffect, useState } from 'react';
import type { SeedBankEntry } from '../types';
import { db } from '../services/db';
import type { SpeciesSource } from '../services/speciesSource';
import { defaultSpeciesSource } from '../services/defaultSpeciesSource';
import { FieldGuideModal } from './FieldGuideModal';
import { useFlower3DView } from '../hooks/useFlower3DView';

interface FieldGuideHostProps {
    isOpen: boolean;
    onClose: () => void;
    /** The species to open at ("x,y"), none for the whole map. */
    cell: string | null;
    isRunning: boolean;
    setIsRunning: (running: boolean) => void;
    /** Starts planting a seed of a flower of the guide; without it the guide has no Plant button. */
    onPlant?: (genome: string, sex: 'male' | 'female' | 'both') => void;
    source?: SpeciesSource;
    /** Flowers waiting to be classified, for the header of the guide. */
    waiting?: number;
}

const downloadSpecimen = (genome: string, id: string) => {
    const link = document.createElement('a');
    link.download = `species_${id}.json`;
    link.href = 'data:text/json;charset=utf-8,' + encodeURIComponent(genome);
    link.click();
};

/**
 * The field guide, with what it needs from the rest of the game: the champions of the seed bank (to mark their
 * species), the 3D view of a flower and the download of a genome. It lives above the panels so any of them can open it:
 * the Seed Bank, a champion card or the details of a flower.
 */
export const FieldGuideHost: React.FC<FieldGuideHostProps> = ({
    isOpen,
    onClose,
    cell,
    isRunning,
    setIsRunning,
    onPlant,
    source = defaultSpeciesSource,
    waiting,
}) => {
    const [champions, setChampions] = useState<SeedBankEntry[]>([]);
    const { view, modal } = useFlower3DView({ isRunning, setIsRunning });

    // The champions change while the game runs: read them each time the guide opens.
    useEffect(() => {
        if (!isOpen) return;
        let current = true;
        db.seedBank.toArray().then(
            found => {
                if (current) setChampions(found);
            },
            error => {
                console.error('Failed to fetch from seed bank:', error);
            }
        );
        return () => {
            current = false;
        };
    }, [isOpen]);

    const plant = useCallback(
        (genome: string, sex: 'male' | 'female' | 'both') => {
            onClose();
            onPlant?.(genome, sex);
        },
        [onClose, onPlant]
    );

    return (
        <>
            <FieldGuideModal
                isOpen={isOpen}
                onClose={onClose}
                source={source}
                champions={champions}
                initialCell={cell}
                onDownload={downloadSpecimen}
                onView3D={view}
                onPlant={onPlant && plant}
                waiting={waiting}
            />
            {modal}
        </>
    );
};
