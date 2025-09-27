import React, { useCallback, useState, useRef } from 'react';
import type { Flower } from '../types';
import { CopyIcon, CheckIcon, LoaderIcon, DownloadIcon, XIcon } from './icons';
import { flowerService } from '../services/flowerService';
import { Modal } from './Modal';
import { Flower3DViewer } from './Flower3DViewer';
import { TOXIC_FLOWER_THRESHOLD } from '../constants';

interface FlowerDetailsPanelProps {
    flower: Flower | null;
    isRunning: boolean;
    setIsRunning: (running: boolean) => void;
    onClose: () => void;
}

const StatBar: React.FC<{ value: number, max: number, label: string, colorClass: string }> = ({ value, max, label, colorClass }) => (
    <div>
        <div className="flex justify-between items-center mb-1">
            <span className="text-sm font-medium text-primary-light">{label}</span>
            <span className="text-sm font-bold text-white">{Math.round(value)} / {Math.round(max)}</span>
        </div>
        <div className="w-full bg-surface-hover rounded-full h-2.5">
            <div className={`${colorClass} h-2.5 rounded-full`} style={{ width: `${(value / max) * 100}%` }}></div>
        </div>
    </div>
);

export const FlowerDetailsPanel: React.FC<FlowerDetailsPanelProps> = ({ flower, isRunning, setIsRunning, onClose }) => {
    const [copied, setCopied] = useState(false);
    const [is3DViewerOpen, setIs3DViewerOpen] = useState(false);
    const [gltfString, setGltfString] = useState<string | null>(null);
    const [isLoading3D, setIsLoading3D] = useState(false);
    const [useEmissive, setUseEmissive] = useState(false);
    const wasRunningRef = useRef(false);

    const handleCopyGenome = useCallback(() => {
        if (flower?.genome) {
            navigator.clipboard.writeText(flower.genome);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    }, [flower]);

    const handleDownloadGenome = useCallback(() => {
        if (flower) {
            const link = document.createElement('a');
            link.download = `flower_${flower.id}.json`;
            link.href = 'data:text/json;charset=utf-8,' + flower.genome;
            link.click();
        }
    }, [flower]);

    const handleView3D = async () => {
        if (!flower) return;
        
        wasRunningRef.current = isRunning;
        setIsRunning(false); // Pause simulation

        setIsLoading3D(true);
        setGltfString(null);
        setIs3DViewerOpen(true);
        
        try {
            const gltf = useEmissive
                ? await flowerService.drawEmissive3DFlower(flower.genome, flower.sex)
                : await flowerService.draw3DFlower(flower.genome, flower.sex);

            setGltfString(gltf);
        } catch (error) {
            console.error("Failed to generate 3D model:", error);
            setIs3DViewerOpen(false); // Close modal on error
            setIsRunning(wasRunningRef.current); // And resume to previous state
        } finally {
            setIsLoading3D(false);
        }
    };
    
    const handleClose3DViewer = () => {
        setIs3DViewerOpen(false);
        setIsRunning(wasRunningRef.current); // Resume to previous state
    };


    const panelContent = flower ? (
        <>
            <header className="flex items-center justify-between p-1 pl-4 bg-background text-primary-light rounded-t-[5px]">
                <h2 className="font-bold text-lg">Flower Details</h2>
                 <button 
                    onClick={onClose} 
                    className="p-1 text-primary-light hover:bg-black/20 rounded-full"
                    aria-label="Close details panel"
                >
                    <XIcon className="w-6 h-6" />
                </button>
            </header>
            <div className="p-4 grow flex flex-col space-y-3 overflow-y-auto">
                <div className="space-y-3">
                    <StatBar value={flower.health} max={flower.maxHealth} label="Health" colorClass="bg-accent-red" />
                    <StatBar value={flower.stamina} max={flower.maxStamina} label="Stamina" colorClass="bg-accent-blue" />
                </div>

                <div className="text-sm space-y-1 text-secondary border-t border-border/50 pt-2">
                    <h3 className="text-base font-semibold text-primary-light/80 mb-1">Current State</h3>
                    <p><strong>Age:</strong> {flower.age} / {flower.maturationPeriod} ticks</p>
                    <p><strong>Status:</strong> {flower.isMature ? 'Mature' : 'Immature'}</p>
                </div>

                <div className="text-sm space-y-1 text-secondary border-t border-border/50 pt-2">
                    <h3 className="text-base font-semibold text-primary-light/80 mb-1">Genetic Traits</h3>
                    <p><strong>Sex:</strong> <span className="capitalize">{flower.sex}</span></p>
                    <p><strong>Optimal Temp:</strong> {flower.minTemperature}°C to {flower.maxTemperature}°C</p>
                    <div className="flex items-center">
                        <p className="mr-2"><strong>Toxicity:</strong> {(flower.toxicityRate * 100).toFixed(0)}%</p>
                        {flower.toxicityRate < 0 && (
                            <span className="text-xs text-accent-green bg-accent-green/20 px-2 py-0.5 rounded-full">Healing</span>
                        )}
                        {flower.toxicityRate > TOXIC_FLOWER_THRESHOLD && (
                            <span className="text-xs text-accent-red bg-accent-red/20 px-2 py-0.5 rounded-full">Carnivorous</span>
                        )}
                    </div>
                    <p><strong>Nutrient Efficiency:</strong> {flower.nutrientEfficiency.toFixed(2)}x</p>
                </div>
                
                <div className="text-sm space-y-1 text-secondary border-t border-border/50 pt-2">
                    <h3 className="text-base font-semibold text-primary-light/80 mb-1">Base Effects</h3>
                    <div className="grid grid-cols-2 gap-x-4">
                        <p><strong>Vitality:</strong> {flower.effects.vitality}</p>
                        <p><strong>Agility:</strong> {flower.effects.agility}</p>
                        <p><strong>Strength:</strong> {flower.effects.strength}</p>
                        <p><strong>Intelligence:</strong> {flower.effects.intelligence}</p>
                        <p><strong>Luck:</strong> {flower.effects.luck}</p>
                    </div>
                </div>
                
                <div className="grow flex flex-col">
                    <label htmlFor="genome" className="block mb-1 text-sm font-medium text-primary-light shrink-0">Genome</label>
                    <textarea
                        id="genome"
                        readOnly
                        value={flower.genome}
                        className="w-full grow p-2 bg-background/50 border border-surface-hover rounded-md text-xs text-secondary font-mono resize-none"
                    />
                </div>

                {/* --- ACTION BAR --- */}
                <div className="border-t border-border/50 pt-3 mt-auto space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                        <button 
                            onClick={handleCopyGenome} 
                            className="flex items-center justify-center gap-2 text-sm p-2 bg-surface-hover rounded-md hover:bg-border/20 transition-colors"
                            title="Copy genome to clipboard"
                        >
                            {copied ? <CheckIcon data-testid="CheckIcon" className="w-4 h-4 text-tertiary" /> : <CopyIcon className="w-4 h-4" />}
                            Copy Genome
                        </button>
                        <button 
                            onClick={handleDownloadGenome} 
                            className="flex items-center justify-center gap-2 text-sm p-2 bg-surface-hover rounded-md hover:bg-border/20 transition-colors"
                            title="Download genome as a JSON file"
                        >
                            <DownloadIcon className="w-4 h-4" />
                            Download
                        </button>
                    </div>

                    <label className="flex items-center space-x-2 cursor-pointer p-2 bg-surface-hover/50 rounded-md hover:bg-surface-hover text-sm text-secondary">
                        <input
                            type="checkbox"
                            checked={useEmissive}
                            onChange={(e) => setUseEmissive(e.target.checked)}
                            className="h-4 w-4 rounded bg-surface border-border text-accent-green focus:ring-accent-green"
                        />
                        <span>Use Emissive Material</span>
                    </label>

                    <button
                        onClick={handleView3D}
                        disabled={isLoading3D}
                        className="w-full flex items-center justify-center px-4 py-2 bg-accent/50 hover:bg-accent/70 text-white font-semibold rounded-md transition-colors duration-200 disabled:bg-surface disabled:cursor-not-allowed cursor-pointer"
                    >
                        {isLoading3D ? (
                            <><LoaderIcon className="w-5 h-5 mr-2 animate-spin" /> Generating...</>
                        ) : (
                            'View in 3D'
                        )}
                    </button>
                </div>
            </div>
        </>
    ) : (
        <div className="flex flex-col items-center justify-center text-center h-full p-4">
            <p className="text-secondary">Select a flower on the grid</p>
            <p className="text-tertiary text-sm">to view its genetic details and stats.</p>
        </div>
    );

    return (
        <>
            <div className="bg-surface border-2 border-tertiary rounded-lg shadow-lg h-full flex flex-col">
                {panelContent}
            </div>
            {flower && <Modal
                isOpen={is3DViewerOpen}
                onClose={handleClose3DViewer}
                title={`3D Model for Flower #${flower.id.substring(7, 12)}`}
            >
                {isLoading3D || !gltfString ? (
                    <div className="flex items-center justify-center h-full">
                        <LoaderIcon className="w-12 h-12 animate-spin text-tertiary" />
                    </div>
                ) : (
                    <Flower3DViewer gltfString={gltfString} />
                )}
            </Modal>}
        </>
    );
};
