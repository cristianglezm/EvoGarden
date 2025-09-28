import React from 'react';
import { EnvironmentDisplay } from './EnvironmentDisplay';
import { WorkerStatusDisplay } from './WorkerStatusDisplay';
import { EventLog } from './EventLog';
import type { TickSummary, CellContent } from '../types';
import { GlobalSearch } from './GlobalSearch';

interface StatusPanelProps {
    summary: TickSummary | null;
    onLogClick: () => void;
    // Props for GlobalSearch
    actors: Map<string, CellContent>;
    onTrackActor: (id: string) => void;
    onStopTracking: () => void;
    trackedActorId: string | null;
    onHighlightActor: (id: string | null) => void;
    isRunning: boolean;
    setIsRunning: (running: boolean) => void;
}

export const StatusPanel: React.FC<StatusPanelProps> = ({ 
    summary, onLogClick, actors, onTrackActor, onStopTracking, trackedActorId, 
    onHighlightActor, isRunning, setIsRunning 
}) => {
    return (
        <div className="flex flex-col gap-1.5">
            <div className="flex flex-row gap-1.5 flex-wrap items-center">
                <EnvironmentDisplay summary={summary} />
                <WorkerStatusDisplay summary={summary} />
                <div className="flex-grow" />
                <GlobalSearch 
                    actors={actors} 
                    onTrackActor={onTrackActor}
                    onStopTracking={onStopTracking}
                    trackedActorId={trackedActorId}
                    onHighlightActor={onHighlightActor}
                    isRunning={isRunning}
                    setIsRunning={setIsRunning}
                />
            </div>
            <EventLog onClick={onLogClick} />
        </div>
    );
};
