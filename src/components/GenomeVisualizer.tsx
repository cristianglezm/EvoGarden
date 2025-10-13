import React from 'react';
import { FLOWER_STAT_INDICES } from '../constants';
import { CollapsibleSection } from './CollapsibleSection';

interface GenomeVisualizerProps {
    genome: number[];
    title: string;
}

export const GenomeVisualizer: React.FC<GenomeVisualizerProps> = ({ genome, title }) => {
    const statNames = Object.keys(FLOWER_STAT_INDICES);

    return (
        <CollapsibleSection title={title} defaultOpen={false}>
            <div className="space-y-2">
                {statNames.map((name, index) => {
                    const value = genome[index] || 0;
                    const isPositive = value >= 0;
                    const width = Math.min(Math.abs(value) * 100, 100);
                    
                    return (
                        <div key={name} className="flex items-center text-xs" title={`${name}: ${value.toFixed(2)}`}>
                            <span className="w-28 shrink-0 capitalize text-secondary">{name.replace(/([A-Z])/g, ' $1').toLowerCase()}</span>
                            <div className="grow h-4 bg-surface-hover/50 rounded-full flex items-center">
                                <div className="w-1/2 h-full flex justify-end">
                                    {!isPositive && (
                                        <div className="bg-accent-red h-full rounded-l-full" style={{ width: `${width}%` }}></div>
                                    )}
                                </div>
                                <div className="w-px h-full bg-border/50"></div>
                                <div className="w-1/2 h-full flex justify-start">
                                    {isPositive && (
                                        <div className="bg-accent-green h-full rounded-r-full" style={{ width: `${width}%` }}></div>
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </CollapsibleSection>
    );
};
