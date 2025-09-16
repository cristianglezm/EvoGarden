import React from 'react';
import { useEventLogStore } from '../stores/eventLogStore';
import { XIcon, TerminalIcon } from './icons';

interface FullEventLogPanelProps {
    isOpen: boolean;
    onClose: () => void;
}

const importanceToColorClass: Record<string, string> = {
    high: 'text-accent-yellow',
    low: 'text-tertiary',
};

export const FullEventLogPanel: React.FC<FullEventLogPanelProps> = ({ isOpen, onClose }) => {
    const logEntries = useEventLogStore(state => state.entries);

    return (
        <>
            {/* Overlay */}
            <div
                className={`fixed inset-0 bg-black/50 z-30 transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                onClick={onClose}
            ></div>

            {/* Panel Content */}
            <aside className={`fixed top-0 right-0 h-full bg-surface z-40 transition-transform duration-300 ease-in-out ${isOpen ? 'translate-x-0' : 'translate-x-full'} w-full max-w-md`}>
                <div className="h-full flex flex-col">
                    <header className="flex items-center justify-between p-2 bg-background text-primary-light">
                        <div className="flex items-center">
                            <TerminalIcon className="w-5 h-5 mr-2" />
                            <h2 className="text-xl font-bold">Full Event Log</h2>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-1 hover:bg-black/20 rounded-full"
                            aria-label="Close full event log panel"
                        >
                            <XIcon className="w-6 h-6" />
                        </button>
                    </header>
                    <div className="grow overflow-y-auto p-4 font-mono text-sm">
                        {logEntries.length === 0 && (
                             <div className="h-full flex items-center justify-center text-secondary/50">
                                <p>No events recorded.</p>
                            </div>
                        )}
                        <div className="flex flex-col-reverse space-y-1 space-y-reverse">
                             {logEntries.map(entry => (
                                <p key={entry.id} className={`${importanceToColorClass[entry.importance] || 'text-tertiary'}`}>
                                    <span className="text-secondary/60 mr-2">[Tick {(entry.tick ?? 0).toString().padStart(4, '0')}]</span>
                                    {entry.message}
                                </p>
                            ))}
                        </div>
                    </div>
                </div>
            </aside>
        </>
    );
};
