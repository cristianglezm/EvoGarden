import React from 'react';
import type { CellContent, Bird, Eagle, Nutrient, Corpse, Cocoon, SlimeTrail, Hive, TerritoryMark, AntColony, PheromoneTrail } from '../types';
import { XIcon, SearchIcon } from './icons';
import { GenomeVisualizer } from './GenomeVisualizer';
import { getShortId } from '../utils';

interface GenericActorDetailsPanelProps {
    actor: CellContent | null;
    onClose: () => void;
    onTrackActor: (id: string) => void;
    onStopTracking: () => void;
    trackedActorId: string | null;
}

interface ActorDisplayInfo {
    emoji: string;
    title: string;
    stats: Record<string, string | number>;
    genome?: number[];
}

const getActorDisplayInfo = (actor: CellContent): ActorDisplayInfo => {
    switch (actor.type) {
        case 'bird':
            return {
                emoji: '🐦',
                title: 'Bird Details',
                stats: {
                    Status: (actor as Bird).target ? 'Hunting' : 'Patrolling',
                }
            };
        case 'eagle':
             return {
                emoji: '🦅',
                title: 'Eagle Details',
                stats: {
                    Status: (actor as Eagle).target ? 'Hunting Bird' : 'Searching',
                }
            };
        case 'nutrient':
            return {
                emoji: '💩',
                title: 'Nutrient Details',
                stats: {
                    'Time Remaining': `${(actor as Nutrient).lifespan} ticks`,
                }
            };
        case 'herbicidePlane':
            return {
                emoji: '✈️',
                title: 'Herbicide Plane',
                stats: {
                    Status: 'Deploying herbicide',
                }
            };
        case 'herbicideSmoke':
            return {
                emoji: '💨',
                title: 'Herbicide Smoke',
                stats: {
                    'Time Remaining': `${actor.lifespan} ticks`,
                }
            };
        case 'flowerSeed':
             return {
                emoji: '🌱',
                title: 'Seed Details',
                stats: {
                    Health: `${actor.health} / ${actor.maxHealth}`,
                    Age: `${actor.age} ticks`,
                }
            };
        case 'corpse': {
            const corpse = actor as Corpse;
            return {
                emoji: corpse.originalEmoji,
                title: 'Insect Corpse',
                stats: {
                    'Decay In': `${corpse.decayTimer} ticks`,
                    'Original Type': `${corpse.originalEmoji}`
                }
            };
        }
        case 'cocoon': {
            const cocoon = actor as Cocoon;
            return {
                emoji: '⚪️',
                title: 'Cocoon Details',
                stats: {
                    'Time to Hatch': `${cocoon.hatchTimer} ticks`,
                    'Will become': '🦋 Butterfly',
                }
            };
        }
        case 'slimeTrail': {
            const slimeTrail = actor as SlimeTrail;
            return {
                emoji: '💧',
                title: 'Slime Trail',
                stats: {
                    'Time Remaining': `${slimeTrail.lifespan} ticks`,
                }
            };
        }
        case 'hive': {
            const hive = actor as Hive;
            return {
                emoji: '🛖',
                title: 'Honeybee Hive',
                stats: {
                    'Hive ID': hive.hiveId,
                    'Honey Reserves': (Number(hive.honey) || 0).toFixed(2),
                    'Stored Pollen': (Number(hive.pollen) || 0).toFixed(2),
                },
                genome: hive.genome
            };
        }
        case 'antColony': {
            const colony = actor as AntColony;
            return {
                emoji: '⛰️',
                title: 'Ant Colony Details',
                stats: {
                    'Colony ID': colony.colonyId,
                    'Food Reserves': colony.foodReserves.toFixed(2),
                    'Stored Ants': colony.storedAnts || 0,
                },
                genome: colony.genome
            };
        }
        case 'territoryMark': {
            const mark = actor as TerritoryMark;
            let signalInfo = 'None';
            if (mark.signal) {
                signalInfo = `${mark.signal.type} (TTL: ${mark.signal.ttl}) at (${mark.signal.origin.x}, ${mark.signal.origin.y})`;
            }
            return {
                emoji: '📍',
                title: 'Territory Mark',
                stats: {
                    'Owner': `Hive ${mark.hiveId}`,
                    'Lifespan': `${mark.lifespan} ticks`,
                    'Active Signal': signalInfo,
                }
            };
        }
        case 'pheromoneTrail': {
            const trail = actor as PheromoneTrail;
            let signalInfo = 'None';
            if (trail.signal) {
                signalInfo = `${trail.signal.type} (TTL: ${trail.signal.ttl}) at (${trail.signal.origin.x}, ${trail.signal.origin.y})`;
            }
            return {
                emoji: ' ', // Invisible
                title: 'Pheromone Trail Details',
                stats: {
                    'Owner': `Colony ${trail.colonyId}`,
                    'Lifespan': `${trail.lifespan} ticks`,
                    'Strength': trail.strength.toFixed(2),
                    'Active Signal': signalInfo,
                }
            };
        }
        default:
            return {
                emoji: '❓',
                title: 'Entity Details',
                stats: {
                    Type: actor.type,
                }
            };
    }
};

export const GenericActorDetailsPanel: React.FC<GenericActorDetailsPanelProps> = ({ actor, onClose, onTrackActor, onStopTracking, trackedActorId }) => {
    if (!actor) return null;

    const { emoji, title, stats, genome } = getActorDisplayInfo(actor);
    const isTrackingThisActor = trackedActorId && trackedActorId === actor.id;

    return (
        <div className="bg-surface border-2 border-tertiary rounded-lg shadow-lg h-full flex flex-col">
            <header className="flex items-center justify-between p-1 pl-4 bg-background text-primary-light rounded-t-[5px] min-h-[48px]">
                <h2 className="font-bold text-lg truncate">
                    {isTrackingThisActor ? 'Tracking: ' : title}
                    {isTrackingThisActor && <span className="font-mono text-accent-yellow">{getShortId(actor.id)}</span>}
                </h2>
                <div className="flex items-center gap-2">
                    {isTrackingThisActor && (
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
            <div className="p-4 grow flex flex-col space-y-3 overflow-y-auto shadow-[inset_0_1px_1px_0_#000]">
                <div className="relative flex items-center gap-4">
                    <span className="text-5xl">{emoji}</span>
                     {actor.type === 'corpse' && <span className="absolute top-1/2 left-[24px] -translate-x-1/2 -translate-y-1/2 text-2xl text-black/80">💀</span>}
                    <div className="min-w-0">
                        <h3 className="text-xl font-bold text-primary-light capitalize">{actor.type.replace(/([A-Z])/g, ' $1')}</h3>
                         <div className="flex items-center gap-2">
                            <p className="text-xs text-secondary font-mono truncate">{actor.id}</p>
                            {!isTrackingThisActor && (
                                <button onClick={() => onTrackActor(actor.id)} title={`Track this ${actor.type}`} className="p-1 text-secondary hover:text-primary-light rounded-full transition-colors">
                                    <SearchIcon className="w-4 h-4" />
                                </button>
                            )}
                        </div>
                    </div>
                </div>
                
                <div className="text-sm space-y-1 text-secondary border-t border-border/50 pt-2">
                    <h3 className="text-base font-semibold text-primary-light/80 mb-1">Information</h3>
                    {Object.entries(stats).map(([key, value]) => (
                        <p key={key}><strong>{key}:</strong> {value}</p>
                    ))}
                </div>
                {genome && <GenomeVisualizer genome={genome} title="Colony Flower Preferences" />}
            </div>
        </div>
    );
};