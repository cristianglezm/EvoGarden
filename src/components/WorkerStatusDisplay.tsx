import React from 'react';
import { LoaderIcon } from './icons';

interface WorkerStatusDisplayProps {
    pendingRequests?: number;
}

export const WorkerStatusDisplay: React.FC<WorkerStatusDisplayProps> = ({ pendingRequests }) => {
    if (pendingRequests === undefined || pendingRequests === 0) {
        return <div className="h-5"></div>; // Placeholder to prevent layout shift
    }

    return (
        <div className="flex items-center space-x-2 text-xs text-secondary" title={`${pendingRequests} genetics tasks are queued for processing.`}>
            <LoaderIcon className="w-4 h-4 text-accent-yellow animate-spin" />
            <span>Genetics Worker: {pendingRequests} pending</span>
        </div>
    );
};
