import React from 'react';
import { useEventLogStore } from '../stores/eventLogStore';
import { TerminalIcon } from './icons';

interface EventLogProps {
    onClick: () => void;
}

const importanceToColorClass: Record<string, string> = {
    high: 'text-accent-yellow',
    low: 'text-tertiary',
};

export const EventLog: React.FC<EventLogProps> = ({ onClick }) => {
    const latestEvent = useEventLogStore(state => state.entries[0]);

    return (
        <div
            className="bg-black/80 px-3 py-1.5 rounded-md text-xs text-secondary font-mono flex items-center gap-2 cursor-pointer hover:bg-black/70 transition-colors"
            onClick={onClick}
            title="Open Full Event Log"
        >
            <div className="flex items-center gap-2 shrink-0">
                <TerminalIcon className="w-4 h-4" />
                <span className="font-semibold text-primary-light">Event Log:</span>
            </div>
            {latestEvent ? (
                <p className={`truncate ${importanceToColorClass[latestEvent.importance] || 'text-tertiary'}`}>
                    <span className="text-secondary/60 mr-2">[T:{(latestEvent.tick ?? 0).toString().padStart(4, '0')}]</span>
                    {latestEvent.message}
                    {latestEvent.count && latestEvent.count > 1 && (
                        <span className="ml-2 px-1.5 py-0.5 text-xs font-semibold bg-surface-hover/80 rounded-full">
                            x{latestEvent.count}
                        </span>
                    )}
                </p>
            ) : (
                <p className="text-secondary/50">No events yet...</p>
            )}
        </div>
    );
};
