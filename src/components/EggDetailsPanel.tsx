import React from 'react';
import type { Egg } from '../types';
import { XIcon, SearchIcon } from './icons';
import { INSECT_DATA } from '../constants';
import { getShortId } from '../utils';

interface EggDetailsPanelProps {
    egg: Egg | null;
    onClose: () => void;
    onTrackActor: (id: string) => void;
    onStopTracking: () => void;
    trackedActorId: string | null;
}

export const EggDetailsPanel: React.FC<EggDetailsPanelProps> = ({ egg, onClose, onTrackActor, onStopTracking, trackedActorId }) => {
    if (!egg) return null;

    const insectToHatch = INSECT_DATA.get(egg.insectEmoji);
    const isTrackingThisEgg = trackedActorId && trackedActorId === egg.id;

    return (
        <div className="bg-surface border-2 border-tertiary rounded-lg shadow-lg h-full flex flex-col">
            <header className="flex items-center justify-between p-1 pl-4 bg-background text-primary-light rounded-t-[5px] min-h-[48px]">
                 <h2 className="font-bold text-lg truncate">
                    {isTrackingThisEgg ? 'Tracking: ' : 'Egg Details'}
                    {isTrackingThisEgg && <span className="font-mono text-accent-yellow">{getShortId(egg.id)}</span>}
                </h2>
                <div className="flex items-center gap-2">
                    {isTrackingThisEgg && (
                        <button 
                            onClick={onStopTracking} 
                            className="px-2 py-1 bg-accent-red/80 hover:bg-accent-red text-white text-xs font-semibold rounded-md transition-colors"
                            title="Stop Tracking"
                        >
                            Stop
                        </button>
                    )}
                    <button 
                        onClick={onClose} 
                        className="p-1 text-primary-light hover:bg-black/20 rounded-full"
                        aria-label="Close details panel"
                    >
                        <XIcon className="w-6 h-6" />
                    </button>
                </div>
            </header>
            <div className="p-4 grow flex flex-col space-y-3 overflow-y-auto shadow-[inset_0_1px_1px_0_#000]">
                <div className="flex items-center gap-4">
                    <span className="text-5xl">🥚</span>
                    <div className="min-w-0">
                        <h3 className="text-xl font-bold text-primary-light">Insect Egg</h3>
                        <div className="flex items-center gap-2">
                            <p className="text-xs text-secondary font-mono truncate">{egg.id}</p>
                            {!isTrackingThisEgg && (
                                <button onClick={() => onTrackActor(egg.id)} title="Track this egg" className="p-1 text-secondary hover:text-primary-light rounded-full transition-colors">
                                    <SearchIcon className="w-4 h-4" />
                                </button>
                            )}
                        </div>
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