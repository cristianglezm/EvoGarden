import React, { useState, useEffect, useCallback } from 'react';
import { db } from '../services/db';
import type { SeedBankEntry } from '../types';
import { LoaderIcon, Trash2Icon } from './icons';
import { ConfirmationModal } from './ConfirmationModal';
import { SeedBankCard } from './SeedBankCard';
import { useFlower3DView } from '../hooks/useFlower3DView';
import { defaultSpeciesSource } from '../services/defaultSpeciesSource';
import type { SpeciesSource } from '../services/speciesSource';

interface SeedBankPanelProps {
    isRunning: boolean;
    setIsRunning: (running: boolean) => void;
    /** Where the species of the champions come from. */
    source?: SpeciesSource;
    /** Opens the field guide at the species of a champion ("x,y"); without it the cards have no way to the guide. */
    onOpenGuide?: (cell: string | null) => void;
    /** Called once the champions are gone, so whoever compares new flowers with them can start again. */
    onCleared?: () => void;
}

export const SeedBankPanel: React.FC<SeedBankPanelProps> = ({ isRunning, setIsRunning, source = defaultSpeciesSource, onOpenGuide, onCleared }) => {
    const [champions, setChampions] = useState<SeedBankEntry[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showConfirmModal, setShowConfirmModal] = useState(false);
    
    const { view: handleView3D, modal: viewer3D } = useFlower3DView({ isRunning, setIsRunning });

    // The species each champion belongs to
    const [championSpecies, setChampionSpecies] = useState<Record<string, { key: string; name: string } | null>>({});

    const fetchChampions = useCallback(async () => {
        setIsLoading(true);
        try {
            const data = await db.seedBank.toArray();
            setChampions(data);
        } catch (error) {
            console.error("Failed to fetch from seed bank:", error);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchChampions();
    }, [fetchChampions]);

    // Which species each champion belongs to; nothing to show while the classifier or the collection is not there.
    useEffect(() => {
        let current = true;
        Promise.all(champions.map(async c => [c.category, await source.speciesOf(c.genome)] as const))
            .then(found => { if (current) setChampionSpecies(Object.fromEntries(found)); })
            .catch(() => { if (current) setChampionSpecies({}); });
        return () => { current = false; };
    }, [champions, source]);

    const handleClearBank = async () => {
        try {
            await db.seedBank.clear();
            setChampions([]);
            onCleared?.();
        } catch (error) {
            console.error("Failed to clear seed bank:", error);
        } finally {
            setShowConfirmModal(false);
        }
    };
    
    const handleDownloadGenome = useCallback((genome: string, id: string) => {
        const link = document.createElement('a');
        link.download = `champion_${id}.json`;
        link.href = 'data:text/json;charset=utf-8,' + encodeURIComponent(genome);
        link.click();
    }, []);

    return (
        <div className="p-4 space-y-4">
            <div className="flex items-center justify-between">
                <p className="text-sm text-secondary">Champions are saved here to repopulate the garden after a collapse.</p>
                <button 
                    onClick={() => setShowConfirmModal(true)}
                    className="flex items-center px-3 py-1.5 bg-accent-red/20 hover:bg-accent-red/40 text-accent-red font-semibold rounded-md transition-colors text-sm"
                    title="Clear all saved champion genomes"
                >
                    <Trash2Icon className="w-4 h-4 mr-2" />
                    Clear
                </button>
            </div>
            
            {isLoading ? (
                <div className="flex justify-center items-center h-48">
                    <LoaderIcon className="w-8 h-8 animate-spin text-tertiary" />
                </div>
            ) : champions.length === 0 ? (
                <div className="text-center text-secondary py-12">
                    <p>The Seed Bank is empty.</p>
                    <p className="text-sm">Let flowers complete their lifecycle to find new champions!</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-4">
                    {champions.map(entry => <SeedBankCard key={entry.category} entry={entry} onDownload={handleDownloadGenome} onView3D={handleView3D} species={championSpecies[entry.category]} onViewInGuide={onOpenGuide} />)}
                </div>
            )}

            {showConfirmModal && <ConfirmationModal 
                onConfirm={handleClearBank} 
                onCancel={() => setShowConfirmModal(false)}
                title="Clear Seed Bank?"
                message="This will remove all saved champion flowers and cannot be undone. New flowers will be completely random until new champions are saved."
            />}
            
            {viewer3D}
        </div>
    );
};
