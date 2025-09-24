import React, { useState, useEffect, useCallback, useRef } from 'react';
import { db } from '../services/db';
import type { SeedBankEntry } from '../types';
import { LoaderIcon, Trash2Icon } from './icons';
import { Modal } from './Modal';
import { Flower3DViewer } from './Flower3DViewer';
import { flowerService } from '../services/flowerService';
import { ConfirmationModal } from './ConfirmationModal';
import { SeedBankCard } from './SeedBankCard';

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

            {showConfirmModal && <ConfirmationModal 
                onConfirm={handleClearBank} 
                onCancel={() => setShowConfirmModal(false)}
                title="Clear Seed Bank?"
                message="This will remove all saved champion flowers and cannot be undone. New flowers will be completely random until new champions are saved."
            />}
            
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
