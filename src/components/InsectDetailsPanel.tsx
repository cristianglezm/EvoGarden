import React from 'react';
import type { Insect, Cockroach } from '../types';
import { XIcon, SearchIcon } from './icons';
import { INSECT_DATA, FLOWER_STAT_INDICES } from '../constants';

interface InsectDetailsPanelProps {
    insect: (Insect | Cockroach) | null;
    onClose: () => void;
    onStopTracking: () => void;
    onTrackActor: (id: string) => void;
    trackedActorId: string | null;
}

const StatBar: React.FC<{ value: number, max: number, label: string, colorClass: string }> = ({ value, max, label, colorClass }) => (
    <div>
        <div className="flex justify-between items-center mb-1">
            <span className="text-sm font-medium text-primary-light">{label}</span>
            <span className="text-sm font-bold text-white">{Math.round(value)} / {Math.round(max)}</span>
        </div>
        <div className="w-full bg-surface-hover rounded-full h-2.5">
            <div className={`${colorClass} h-2.5 rounded-full`} style={{ width: `${(value / max) * 100}%` }}></div>
        </div>
    </div>
);

const GenomeVisualizer: React.FC<{ genome: number[] }> = ({ genome }) => {
    const statNames = Object.keys(FLOWER_STAT_INDICES);

    return (
        <div className="space-y-2">
            {statNames.map((name, index) => {
                const value = genome[index] || 0;
                const isPositive = value >= 0;
                const width = Math.min(Math.abs(value) * 100, 100);
                
                return (
                    <div key={name} className="flex items-center text-xs">
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
    );
};


export const InsectDetailsPanel: React.FC<InsectDetailsPanelProps> = ({ insect, onClose, onStopTracking, onTrackActor, trackedActorId }) => {
    if (!insect) return null;

    const baseStats = INSECT_DATA.get(insect.emoji);
    const isTrackingThisInsect = trackedActorId && trackedActorId === insect.id;

    return (
        <div className="bg-surface border-2 border-tertiary rounded-lg shadow-lg h-full flex flex-col">
            <header className="flex items-center justify-between p-1 pl-4 bg-background text-primary-light rounded-t-[5px] min-h-[48px]">
                <h2 className="font-bold text-lg truncate">
                    {isTrackingThisInsect ? 'Tracking: ' : 'Insect Details'}
                    {isTrackingThisInsect && <span className="font-mono text-accent-yellow">{insect.id.substring(7, 12)}</span>}
                </h2>
                <div className="flex items-center gap-2">
                    {isTrackingThisInsect && (
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
            <div className="p-4 grow flex flex-col justify-start space-y-3 overflow-y-auto shadow-[inset_0_1px_1px_0_#000]">
                <div className="flex items-center gap-4">
                    <span className="text-5xl">{insect.emoji}</span>
                    <div className="min-w-0">
                        <h3 className="text-xl font-bold text-primary-light capitalize">{baseStats?.role ?? 'Insect'}</h3>
                         <div className="flex items-center gap-2">
                            <p className="text-xs text-secondary font-mono truncate">{insect.id}</p>
                            {!isTrackingThisInsect && (
                                <button onClick={() => onTrackActor(insect.id)} title="Track this insect" className="p-1 text-secondary hover:text-primary-light rounded-full transition-colors">
                                    <SearchIcon className="w-4 h-4" />
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                <div className="space-y-3">
                    <StatBar value={insect.health} max={insect.maxHealth} label="Health" colorClass="bg-accent-red" />
                    <StatBar value={insect.stamina} max={insect.maxStamina} label="Stamina" colorClass="bg-accent-blue" />
                </div>
                
                {baseStats && (
                    <div className="text-sm space-y-1 text-secondary border-t border-border/50 pt-2">
                        <h3 className="text-base font-semibold text-primary-light/80 mb-1">Base Stats</h3>
                        <div className="grid grid-cols-2 gap-x-4">
                            <p><strong>Attack:</strong> {baseStats.attack}</p>
                            <p><strong>Speed:</strong> {baseStats.speed}</p>
                            <p><strong>Hatch Time:</strong> {baseStats.eggHatchTime} ticks</p>
                            <p><strong>Repro. Cost:</strong> {baseStats.reproductionCost} sta.</p>
                        </div>
                    </div>
                )}
                
                <div className="text-sm space-y-1 text-secondary border-t border-border/50 pt-2">
                     <h3 className="text-base font-semibold text-primary-light/80 mb-1">Flower Preferences (Genome)</h3>
                     <GenomeVisualizer genome={insect.genome} />
                </div>

                 <div className="text-sm space-y-1 text-secondary border-t border-border/50 pt-2">
                    <h3 className="text-base font-semibold text-primary-light/80 mb-1">Status</h3>
                    {insect.type === 'insect' && (
                        <p><strong>Carrying Pollen:</strong> {insect.pollen ? `Yes (from #${insect.pollen.sourceFlowerId.substring(7,12)})` : 'No'}</p>
                    )}
                    <p><strong>Reproduction Cooldown:</strong> {insect.reproductionCooldown || 0} ticks</p>
                </div>
            </div>
        </div>
    );
};
