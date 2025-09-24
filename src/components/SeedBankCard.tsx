import React from 'react';
import type { SeedBankEntry } from '../types';
import { DownloadIcon, View3DIcon } from './icons';

interface SeedBankCardProps {
    entry: SeedBankEntry;
    onDownload: (genome: string, id: string) => void;
    onView3D: (genome: string, sex: 'male' | 'female' | 'both') => void;
}

export const SeedBankCard: React.FC<SeedBankCardProps> = ({ entry, onDownload, onView3D }) => {
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
