import React from 'react';
import type { Egg } from '../types';
import { XIcon } from './icons';
import { INSECT_DATA } from '../constants';

interface EggDetailsPanelProps {
    egg: Egg | null;
    onClose: () => void;
}

export const EggDetailsPanel: React.FC<EggDetailsPanelProps> = ({ egg, onClose }) => {
    if (!egg) return null;

    const insectToHatch = INSECT_DATA.get(egg.insectEmoji);

    return (
        <div className="bg-surface border-2 border-tertiary rounded-lg shadow-lg h-full flex flex-col">
            <header className="flex items-center justify-between p-1 pl-4 bg-background text-primary-light rounded-t-[5px]">
                <h2 className="font-bold text-lg">Egg Details</h2>
                <button 
                    onClick={onClose} 
                    className="p-1 text-primary-light hover:bg-black/20 rounded-full"
                    aria-label="Close details panel"
                >
                    <XIcon className="w-6 h-6" />
                </button>
            </header>
            <div className="p-4 grow flex flex-col space-y-3 overflow-y-auto">
                <div className="flex items-center gap-4">
                    <span className="text-5xl">🥚</span>
                    <div>
                        <h3 className="text-xl font-bold text-primary-light">Insect Egg</h3>
                        <p className="text-xs text-secondary font-mono">{egg.id}</p>
                    </div>
                </div>
                
                <div className="text-sm space-y-1 text-secondary border-t border-border/50 pt-2">
                    <h3 className="text-base font-semibold text-primary-light/80 mb-1">Hatching Information</h3>
                    <p><strong>Time to hatch:</strong> {egg.hatchTimer} ticks</p>
                    {insectToHatch && (
                        <p><strong>Will hatch into:</strong> <span className="capitalize">{egg.insectEmoji} {insectToHatch.role}</span></p>
                    )}
                </div>
            </div>
        </div>
    );
};
