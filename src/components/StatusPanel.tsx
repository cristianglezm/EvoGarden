import React from 'react';
import { EnvironmentDisplay } from './EnvironmentDisplay';
import { WorkerStatusDisplay } from './WorkerStatusDisplay';
import { EventLog } from './EventLog';
import type { TickSummary } from '../types';

interface StatusPanelProps {
    summary: TickSummary | null;
    onLogClick: () => void;
}

export const StatusPanel: React.FC<StatusPanelProps> = ({ summary, onLogClick }) => {
    return (
        <div className="flex flex-col gap-1.5">
            <div className="flex flex-row gap-1.5 flex-wrap">
                <EnvironmentDisplay summary={summary} />
                <WorkerStatusDisplay summary={summary} />
            </div>
            <EventLog onClick={onLogClick} />
        </div>
    );
};
