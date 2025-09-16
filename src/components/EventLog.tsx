import React, { useEffect, useRef } from 'react';
import { useEventLogStore } from '../stores/eventLogStore';
import { TerminalIcon } from './icons';

const importanceToColorClass: Record<string, string> = {
    high: 'text-accent-yellow',
    low: 'text-tertiary',
};

interface EventLogProps {
  onClick: () => void;
}

export const EventLog: React.FC<EventLogProps> = ({ onClick }) => {
    const logEntries = useEventLogStore(state => state.entries);
    const scrollRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to the top (most recent) entry whenever a new one is added.
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = 0;
        }
    }, [logEntries]);

    return (
        <div 
            className="h-full bg-black/80 rounded-md p-2 flex flex-col font-mono text-xs overflow-hidden cursor-pointer hover:bg-black/70 transition-colors"
            onClick={onClick}
            title="Open Full Event Log"
            aria-label="Open Full Event Log"
        >
            <div className="flex items-center shrink-0 text-secondary border-b border-border/30 pb-1 mb-1">
                <TerminalIcon className="w-4 h-4 mr-2" />
                <span>Event Log</span>
            </div>
            <div ref={scrollRef} className="grow overflow-y-auto pr-2">
                {logEntries.length === 0 && (
                    <div className="h-full flex items-center justify-center text-secondary/50">
                        <p>No events yet...</p>
                    </div>
                )}
                <div className="flex flex-col-reverse items-center justify-center">
                    {logEntries.map(entry => (
                        <p key={entry.id} className={`whitespace-nowrap ${importanceToColorClass[entry.importance] || 'text-tertiary'}`}>
                            {entry.message}
                        </p>
                    ))}
                </div>
            </div>
        </div>
    );
};
