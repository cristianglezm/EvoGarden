import React from 'react';
import type { TickSummary } from '../types';
import { LoaderIcon, CheckIcon } from './icons';

interface WorkerStatusDisplayProps {
    summary: TickSummary | null;
}

export const WorkerStatusDisplay: React.FC<WorkerStatusDisplayProps> = ({ summary }) => {
    const pendingRequests = summary?.pendingFlowerRequests ?? 0;
    const hasPendingRequests = pendingRequests > 0;

    return (
        <div 
            className="bg-background px-3 py-1.5 rounded-md text-xs text-secondary font-mono flex items-center gap-2"
            title={hasPendingRequests ? `${pendingRequests} genetics tasks are queued for processing.` : "Genetics worker is idle."}
        >
            {hasPendingRequests ? (
                <>
                    <LoaderIcon className="w-4 h-4 text-accent-yellow animate-spin" />
                    <span>Genetics Worker: {pendingRequests} pending</span>
                </>
            ) : (
                 <>
                    <CheckIcon className="w-4 h-4 text-accent-green" />
                    <span>No pending flowers</span>
                </>
            )}
        </div>
    );
};
