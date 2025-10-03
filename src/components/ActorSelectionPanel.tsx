import React from 'react';
import type { CellContent } from '../types';
import { XIcon } from './icons';
import { getActorName } from '../utils';

interface ActorSelectionPanelProps {
    actors: CellContent[];
    onSelect: (actor: CellContent) => void;
    onClose: () => void;
}

export const ActorSelectionPanel: React.FC<ActorSelectionPanelProps> = ({ actors, onSelect, onClose }) => {
    return (
        <div className="bg-surface border-2 border-tertiary rounded-lg shadow-lg h-full flex flex-col">
            <header className="flex items-center justify-between p-1 pl-4 bg-background text-primary-light rounded-t-[5px]">
                <h2 className="font-bold text-lg">Select an Actor</h2>
                <button 
                    onClick={onClose} 
                    className="p-1 text-primary-light hover:bg-black/20 rounded-full"
                    aria-label="Close selection panel"
                >
                    <XIcon className="w-6 h-6" />
                </button>
            </header>
            <div className="p-4 grow overflow-y-auto">
                <p className="text-sm text-secondary mb-3">Multiple entities found in this cell. Please select one to inspect.</p>
                <div className="space-y-2">
                    {actors.map(actor => (
                         <button
                            key={actor.id}
                            onClick={() => onSelect(actor)}
                            className="w-full text-left p-3 bg-surface-hover/50 hover:bg-surface-hover rounded-lg transition-colors"
                         >
                            <span className="font-semibold text-primary">{getActorName(actor)}</span>
                         </button>
                    ))}
                </div>
            </div>
        </div>
    );
};
