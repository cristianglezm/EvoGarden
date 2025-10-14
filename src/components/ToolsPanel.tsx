import React, { useState, useEffect, useCallback, useMemo } from 'react';
import type { SimulationParams, SeedBankEntry } from '../types';
import { XIcon, SunIcon, SnowflakeIcon, CloudRainIcon, WindIcon, BugIcon } from './icons';
import { CollapsibleSection } from './CollapsibleSection';
import { db } from '../services/db';
import { ACTOR_NAMES } from '../utils';

interface ToolsPanelProps {
    isOpen: boolean;
    onClose: () => void;
    params: SimulationParams;
    triggerWeatherEvent: (eventType: 'heatwave' | 'coldsnap' | 'heavyrain' | 'drought') => void;
    introduceSpecies: (emoji: string, count: number) => void;
    introduceStationary: (actorType: 'hive' | 'antColony', count: number) => void;
    onEnterPlantingMode: (genome: string, sex: 'male' | 'female' | 'both') => void;
}

const SPAWNABLE_ACTORS = ['🦋', '🐛', '🐌', '🐞', '🪲', '🦂', '🕷️', '🪳', '🐦', '🛖', '⛰️'];

export const ToolsPanel: React.FC<ToolsPanelProps> = ({ isOpen, onClose, triggerWeatherEvent, introduceSpecies, introduceStationary, onEnterPlantingMode }) => {
    const [champions, setChampions] = useState<SeedBankEntry[]>([]);
    const [isLoadingChampions, setIsLoadingChampions] = useState(true);
    const [weatherCooldown, setWeatherCooldown] = useState(false);
    const [selectedActor, setSelectedActor] = useState<string>('');
    const [actorCount, setActorCount] = useState(5);

    const allSpawnable = useMemo(() => {
        // The tools panel should allow spawning any actor for sandbox-style intervention,
        // ignoring the `allowedActors` parameter which governs automatic spawning.
        return SPAWNABLE_ACTORS;
    }, []);

    useEffect(() => {
        if (isOpen) {
            setIsLoadingChampions(true);
            db.seedBank.toArray()
                .then(setChampions)
                .catch(err => console.error("Failed to load champions:", err))
                .finally(() => setIsLoadingChampions(false));
            
            if (allSpawnable.length > 0 && !allSpawnable.includes(selectedActor)) {
                setSelectedActor(allSpawnable[0]);
            } else if (allSpawnable.length === 0) {
                setSelectedActor('');
            }
        }
    }, [isOpen, allSpawnable, selectedActor]);
    
    const handleTriggerWeather = useCallback((eventType: 'heatwave' | 'coldsnap' | 'heavyrain' | 'drought') => {
        if (weatherCooldown) return;
        triggerWeatherEvent(eventType);
        setWeatherCooldown(true);
        setTimeout(() => setWeatherCooldown(false), 30000); // 30s cooldown
        onClose();
    }, [weatherCooldown, triggerWeatherEvent, onClose]);
    
    const handleIntroduceActors = () => {
        if (selectedActor && actorCount > 0) {
            if (selectedActor === '🛖') {
                introduceStationary('hive', actorCount);
            } else if (selectedActor === '⛰️') {
                introduceStationary('antColony', actorCount);
            } else {
                introduceSpecies(selectedActor, actorCount);
            }
            onClose();
        }
    };
    
    const handlePlantChampion = (entry: SeedBankEntry) => {
        onEnterPlantingMode(entry.genome, entry.sex);
        onClose();
    };

    return (
        <>
            <div 
                className={`fixed inset-0 bg-black/50 z-30 transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                onClick={onClose}
            ></div>
            <aside className={`fixed top-0 right-0 h-full bg-surface z-40 transition-transform duration-300 ease-in-out ${isOpen ? 'translate-x-0' : 'translate-x-full'} w-full max-w-sm`}>
                 <div className="h-full flex flex-col">
                    <header className="flex items-center justify-between p-2 bg-background">
                         <h2 className="text-xl font-bold text-primary-light ml-2">Intervention Tools</h2>
                         <button 
                            onClick={onClose} 
                            className="p-1 text-primary-light hover:bg-black/20 rounded-full"
                            aria-label="Close tools panel"
                        >
                            <XIcon className="w-6 h-6" />
                        </button>
                    </header>
                    <div className="p-4 overflow-y-auto shadow-[inset_0_1px_1px_0_#000]">
                        <div className="space-y-4">
                            <CollapsibleSection title="Plant a Champion" defaultOpen={true}>
                                {isLoadingChampions ? <p className="text-secondary">Loading champions...</p> : 
                                 champions.length === 0 ? <p className="text-secondary">No champions saved in the Seed Bank.</p> :
                                 <div className="grid grid-cols-3 gap-2">
                                    {champions.map(champion => (
                                        <button key={champion.category} onClick={() => handlePlantChampion(champion)} className="border border-border/50 p-2 rounded-lg hover:bg-surface-hover group" title={`Plant ${champion.category}`}>
                                            <img src={champion.imageData} alt={champion.category} className="w-full h-auto aspect-square object-contain group-hover:scale-110 transition-transform" />
                                            <span className="text-xs text-secondary mt-1 block capitalize">{champion.category.replace(/([A-Z])/g, ' $1').toLowerCase()}</span>
                                        </button>
                                    ))}
                                 </div>
                                }
                            </CollapsibleSection>

                            <CollapsibleSection title="Introduce Actors">
                                {allSpawnable.length === 0 ? <p className="text-secondary">No spawnable actors permitted in current settings.</p> :
                                <>
                                    <div className="grid grid-cols-2 gap-4">
                                        <label className="block">
                                            <span className="text-secondary text-sm">Actor</span>
                                            <select value={selectedActor} onChange={e => setSelectedActor(e.target.value)} className="w-full mt-1 p-2 bg-surface-hover border border-surface rounded-md text-white">
                                                {allSpawnable.map(emoji => <option key={emoji} value={emoji}>{emoji} {ACTOR_NAMES[emoji]}</option>)}
                                            </select>
                                        </label>
                                        <label className="block">
                                            <span className="text-secondary text-sm">Count</span>
                                            <input type="number" value={actorCount} onChange={e => setActorCount(parseInt(e.target.value, 10))} min="1" max="10" className="w-full mt-1 p-2 bg-surface-hover border border-surface rounded-md text-white" />
                                        </label>
                                    </div>
                                    <button onClick={handleIntroduceActors} className="w-full mt-3 flex items-center justify-center px-4 py-2 bg-accent-purple/50 hover:bg-accent-purple/70 text-white font-semibold rounded-md transition-colors">
                                        <BugIcon className="w-5 h-5 mr-2" />
                                        Introduce Actors
                                    </button>
                                </>
                                }
                            </CollapsibleSection>

                            <CollapsibleSection title="Trigger Weather">
                                <p className={`text-xs text-center mb-2 transition-opacity ${weatherCooldown ? 'opacity-100 text-accent-yellow' : 'opacity-0'}`}>Weather controls on cooldown for 30s.</p>
                                <div className="grid grid-cols-2 gap-2">
                                    <button disabled={weatherCooldown} onClick={() => handleTriggerWeather('heatwave')} className="flex items-center justify-center gap-2 p-2 bg-surface-hover rounded-md hover:bg-border/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"><SunIcon className="w-5 h-5 text-accent-yellow" /> Heatwave</button>
                                    <button disabled={weatherCooldown} onClick={() => handleTriggerWeather('coldsnap')} className="flex items-center justify-center gap-2 p-2 bg-surface-hover rounded-md hover:bg-border/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"><SnowflakeIcon className="w-5 h-5 text-accent-blue" /> Coldsnap</button>
                                    <button disabled={weatherCooldown} onClick={() => handleTriggerWeather('heavyrain')} className="flex items-center justify-center gap-2 p-2 bg-surface-hover rounded-md hover:bg-border/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"><CloudRainIcon className="w-5 h-5 text-blue-300" /> Heavy Rain</button>
                                    <button disabled={weatherCooldown} onClick={() => handleTriggerWeather('drought')} className="flex items-center justify-center gap-2 p-2 bg-surface-hover rounded-md hover:bg-border/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"><WindIcon className="w-5 h-5 text-yellow-500" /> Drought</button>
                                </div>
                            </CollapsibleSection>
                        </div>
                    </div>
                </div>
            </aside>
        </>
    );
};
