import React, { useState, useEffect, useCallback, useRef } from 'react';
import { db } from '../services/db';
import type { SeedBankEntry } from '../types';
import { LoaderIcon, Trash2Icon, DownloadIcon, View3DIcon } from './icons';
import { Modal } from './Modal';
import { Flower3DViewer } from './Flower3DViewer';
import { flowerService } from '../services/flowerService';

const ConfirmationModal: React.FC<{ onConfirm: () => void; onCancel: () => void; }> = ({ onConfirm, onCancel }) => (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onCancel}>
        <div className="bg-surface border border-border rounded-lg shadow-xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-xl font-bold text-primary-light">Clear Seed Bank?</h3>
            <p className="text-secondary my-4">This will remove all saved champion flowers and cannot be undone. New flowers will be completely random until new champions are saved.</p>
            <div className="flex justify-end space-x-4">
                <button onClick={onCancel} className="px-4 py-2 bg-surface-hover hover:bg-border/20 text-primary-light font-semibold rounded-md transition-colors">Cancel</button>
                <button onClick={onConfirm} className="px-4 py-2 bg-accent-red/80 hover:bg-accent-red text-white font-semibold rounded-md transition-colors">Confirm & Clear</button>
            </div>
        </div>
    </div>
);

interface SeedBankCardProps {
    entry: SeedBankEntry;
    onDownload: (genome: string, id: string) => void;
    onView3D: (genome: string, sex: 'male' | 'female' | 'both') => void;
}

const SeedBankCard: React.FC<SeedBankCardProps> = ({ entry, onDownload, onView3D }) => {
    let title = '';
    let value = '';

    switch (entry.category) {
        case 'longestLived':
            title = 'Longest Lived';
            value = `${entry.value} ticks`;
            break;
        case 'mostToxic':
            title = 'Most Toxic';
            value = `${(entry.value * 100).toFixed(0)}% Toxicity`;
            break;
        case 'mostHealing':
            title = 'Most Healing';
            // Since healing is negative, multiply by -1 for display
            value = `${(entry.value * -100).toFixed(0)}% Healing`;
            break;
    }
    
    return (
        <div className="bg-surface-hover/50 rounded-lg p-3 flex flex-col">
            <h4 className="font-semibold text-primary">{title}</h4>
            <p className="text-sm text-accent-yellow font-bold mb-2">{value}</p>
            <div className="bg-black/50 rounded flex items-center justify-center p-2 aspect-square">
                 <img src={entry.imageData} alt={`Champion flower for ${title}`} className="w-full h-full object-contain"/>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-border/50">
                <button 
                    onClick={() => onDownload(entry.genome, entry.category)} 
                    className="flex items-center justify-center gap-2 text-sm p-2 bg-surface-hover rounded-md hover:bg-border/20 transition-colors"
                    title="Download genome as a JSON file"
                >
                    <DownloadIcon className="w-4 h-4" />
                    Download
                </button>
                 <button 
                    onClick={() => onView3D(entry.genome, entry.sex || 'both')} // Fallback for old saves
                    className="flex items-center justify-center gap-2 text-sm p-2 bg-surface-hover rounded-md hover:bg-border/20 transition-colors"
                    title="View 3D model"
                >
                    <View3DIcon className="w-4 h-4" />
                    View 3D
                </button>
            </div>
        </div>
    );
};

interface SeedBankPanelProps {
    isRunning: boolean;
    setIsRunning: (running: boolean) => void;
}

export const SeedBankPanel: React.FC<SeedBankPanelProps> = ({ isRunning, setIsRunning }) => {
    const [champions, setChampions] = useState<SeedBankEntry[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showConfirmModal, setShowConfirmModal] = useState(false);
    
    // State for 3D Viewer
    const [is3DViewerOpen, setIs3DViewerOpen] = useState(false);
    const [gltfString, setGltfString] = useState<string | null>(null);
    const [isLoading3D, setIsLoading3D] = useState(false);
    const [modalTitle, setModalTitle] = useState('');
    const wasRunningRef = useRef(false);

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

    const handleClearBank = async () => {
        try {
            await db.seedBank.clear();
            setChampions([]);
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

    const handleView3D = async (genome: string, sex: 'male'|'female'|'both') => {
        wasRunningRef.current = isRunning;
        setIsRunning(false);

        setIsLoading3D(true);
        setGltfString(null);
        setIs3DViewerOpen(true);
        setModalTitle('Generating 3D Model...');
        
        try {
            const gltf = await flowerService.draw3DFlower(genome, sex);
            setGltfString(gltf);
            setModalTitle('Champion Flower 3D Model');
        } catch (error) {
            console.error("Failed to generate 3D model:", error);
            setIs3DViewerOpen(false);
            setIsRunning(wasRunningRef.current);
        } finally {
            setIsLoading3D(false);
        }
    };
    
    const handleClose3DViewer = () => {
        setIs3DViewerOpen(false);
        setIsRunning(wasRunningRef.current);
    };


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
                    {champions.map(entry => <SeedBankCard key={entry.category} entry={entry} onDownload={handleDownloadGenome} onView3D={handleView3D} />)}
                </div>
            )}

            {showConfirmModal && <ConfirmationModal onConfirm={handleClearBank} onCancel={() => setShowConfirmModal(false)} />}
            
            <Modal
                isOpen={is3DViewerOpen}
                onClose={handleClose3DViewer}
                title={modalTitle}
            >
                {isLoading3D || !gltfString ? (
                    <div className="flex items-center justify-center h-full">
                        <LoaderIcon className="w-12 h-12 animate-spin text-tertiary" />
                    </div>
                ) : (
                    <Flower3DViewer gltfString={gltfString} />
                )}
            </Modal>
        </div>
    );
};
