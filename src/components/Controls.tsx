import React, { useState, useEffect } from 'react';
import type { SimulationParams, WindDirection } from '../types';
import { PlayIcon, PauseIcon, RefreshCwIcon, SaveIcon, UploadIcon, LoaderIcon } from './icons';
import { CollapsibleSection } from './CollapsibleSection';

interface ControlsProps {
    params: SimulationParams;
    onParamsChange: (params: SimulationParams) => void;
    isRunning: boolean;
    setIsRunning: (running: React.SetStateAction<boolean>) => void;
    onSave: () => void;
    onStart?: () => void;
    onLoad: () => void;
    hasSavedState: boolean;
    isSaving: boolean;
}

const WIND_DIRECTIONS: WindDirection[] = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const FLOWER_DETAIL_OPTIONS = [4, 8, 16, 32, 64];

export const Controls: React.FC<ControlsProps> = ({ params, onParamsChange, isRunning, setIsRunning, onSave, onLoad, hasSavedState, isSaving, onStart }) => {
    const [localParams, setLocalParams] = useState<SimulationParams>(params);

    useEffect(() => {
        setLocalParams(params);
    }, [params]);

    const handleParamChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target;
        const isFloat = ['humidity', 'herbicideFlowerDensityThreshold', 'humidityAmplitude', 'weatherEventChance', 'heavyRainHumidityIncrease', 'droughtHumidityDecrease', 'mutationChance', 'mutationAmount'].includes(name);
        const isString = ['windDirection', 'notificationMode'].includes(name);
        
        setLocalParams(prev => {
            let processedValue: string | number | boolean = value;
            if (type === 'checkbox') {
                processedValue = (e.target as HTMLInputElement).checked;
            } else if (!isString) {
                processedValue = isFloat ? parseFloat(value) : parseInt(value, 10);
            }

            const newParams = { 
                ...prev, 
                [name]: processedValue
            };

            // If grid size changes, ensure the number of flowers does not exceed the new capacity.
            if (name === 'gridWidth' || name === 'gridHeight') {
                const maxFlowers = newParams.gridWidth * newParams.gridHeight;
                if (newParams.initialFlowers > maxFlowers) {
                    newParams.initialFlowers = maxFlowers;
                }
            }
            
            return newParams;
        });
    };

    const handleApply = () => {
        onParamsChange(localParams);
    };
    
    const maxFlowers = localParams.gridWidth * localParams.gridHeight;
    
    return (
        <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
                <button
                    onClick={() => {
                        if (!isRunning) {
                            onStart?.();
                        }
                        setIsRunning(p => !p);
                    }}
                    className="flex items-center justify-center px-4 py-2 bg-accent-green/50 hover:bg-accent-green/70 text-white font-semibold rounded-md transition-colors duration-200 disabled:bg-surface-hover/50 disabled:cursor-not-allowed cursor-pointer"
                    aria-label={isRunning ? 'Pause simulation' : 'Start simulation'}
                    disabled={isSaving}
                >
                    {isRunning ? <PauseIcon className="w-5 h-5 mr-2" /> : <PlayIcon className="w-5 h-5 mr-2" />}
                    {isRunning ? 'Pause' : 'Start'}
                </button>
                <button
                    onClick={handleApply}
                    className="flex items-center justify-center px-4 py-2 bg-accent-blue/50 hover:bg-accent-blue/70 text-white font-semibold rounded-md transition-colors duration-200 disabled:bg-surface-hover/50 disabled:cursor-not-allowed cursor-pointer"
                    title="Apply new parameters and reset simulation"
                    disabled={isSaving}
                >
                    <RefreshCwIcon className="w-5 h-5 mr-2" />
                    Apply & Reset
                </button>
                <button
                    onClick={onSave}
                    className="flex items-center justify-center px-4 py-2 bg-accent-purple/50 hover:bg-accent-purple/70 text-white font-semibold rounded-md transition-colors duration-200 disabled:bg-surface-hover/50 disabled:cursor-not-allowed cursor-pointer"
                    title="Save current simulation state"
                    disabled={isSaving || isRunning}
                >
                    {isSaving ? (
                        <><LoaderIcon className="w-5 h-5 mr-2 animate-spin" /> Saving...</>
                    ) : (
                        <><SaveIcon className="w-5 h-5 mr-2" /> Save</>
                    )}
                </button>
                 <button
                    onClick={onLoad}
                    disabled={!hasSavedState || isSaving}
                    className="flex items-center justify-center px-4 py-2 bg-accent-yellow/50 hover:bg-accent-yellow/70 text-white font-semibold rounded-md transition-colors duration-200 disabled:bg-surface-hover/50 disabled:cursor-not-allowed cursor-pointer"
                    title="Load last saved simulation"
                >
                    <UploadIcon className="w-5 h-5 mr-2" />
                    Load
                </button>
            </div>

            <div className="space-y-1">
                <CollapsibleSection title="World Parameters">
                    <label className="block">
                        <span className="text-secondary text-sm">Grid Width: {localParams.gridWidth}</span>
                        <input type="range" name="gridWidth" min="10" max="35" value={localParams.gridWidth} onChange={handleParamChange} className="w-full h-2 bg-surface-hover rounded-lg appearance-none cursor-pointer" />
                    </label>
                    <label className="block">
                        <span className="text-secondary text-sm">Grid Height: {localParams.gridHeight}</span>
                        <input type="range" name="gridHeight" min="10" max="35" value={localParams.gridHeight} onChange={handleParamChange} className="w-full h-2 bg-surface-hover rounded-lg appearance-none cursor-pointer" />
                    </label>
                     <label className="block">
                        <span className="text-secondary text-sm">Season Length: {localParams.seasonLengthInTicks} ticks</span>
                        <input type="range" name="seasonLengthInTicks" min="100" max="5000" step="100" value={localParams.seasonLengthInTicks} onChange={handleParamChange} className="w-full h-2 bg-surface-hover rounded-lg appearance-none cursor-pointer" />
                    </label>
                    <label className="block">
                        <span className="text-secondary text-sm">Base Temperature: {localParams.temperature}°C</span>
                        <input type="range" name="temperature" min="-10" max="50" value={localParams.temperature} onChange={handleParamChange} className="w-full h-2 bg-surface-hover rounded-lg appearance-none cursor-pointer" />
                    </label>
                     <label className="block">
                        <span className="text-secondary text-sm">Temp. Variation: ±{localParams.temperatureAmplitude}°C</span>
                        <input type="range" name="temperatureAmplitude" min="0" max="25" value={localParams.temperatureAmplitude} onChange={handleParamChange} className="w-full h-2 bg-surface-hover rounded-lg appearance-none cursor-pointer" />
                    </label>
                    <label className="block">
                        <span className="text-secondary text-sm">Base Humidity: {Math.round(localParams.humidity * 100)}%</span>
                        <input type="range" name="humidity" min="0" max="1" step="0.01" value={localParams.humidity} onChange={handleParamChange} className="w-full h-2 bg-surface-hover rounded-lg appearance-none cursor-pointer" />
                    </label>
                    <label className="block">
                        <span className="text-secondary text-sm">Humidity Variation: ±{Math.round(localParams.humidityAmplitude * 100)}%</span>
                        <input type="range" name="humidityAmplitude" min="0" max="0.5" step="0.01" value={localParams.humidityAmplitude} onChange={handleParamChange} className="w-full h-2 bg-surface-hover rounded-lg appearance-none cursor-pointer" />
                    </label>
                    <label className="block">
                        <span className="text-secondary text-sm">Wind Direction</span>
                        <select name="windDirection" value={localParams.windDirection} onChange={handleParamChange} className="w-full mt-1 p-2 bg-surface-hover border border-surface rounded-md text-white">
                            {WIND_DIRECTIONS.map(dir => <option key={dir} value={dir}>{dir}</option>)}
                        </select>
                    </label>
                    <label className="block">
                        <span className="text-secondary text-sm">Wind Strength: {localParams.windStrength} cells</span>
                        <input type="range" name="windStrength" min="1" max="15" value={localParams.windStrength} onChange={handleParamChange} className="w-full h-2 bg-surface-hover rounded-lg appearance-none cursor-pointer" />
                    </label>
                </CollapsibleSection>
                
                <CollapsibleSection title="Initial Population">
                    <label className="block">
                        <span className="text-secondary text-sm">Flowers: {localParams.initialFlowers}</span>
                        <input type="range" name="initialFlowers" min="0" max={maxFlowers} value={localParams.initialFlowers} onChange={handleParamChange} className="w-full h-2 bg-surface-hover rounded-lg appearance-none cursor-pointer" />
                    </label>
                    <label className="block">
                        <span className="text-secondary text-sm">Insects: {localParams.initialInsects}</span>
                        <input type="range" name="initialInsects" min="0" max="30" value={localParams.initialInsects} onChange={handleParamChange} className="w-full h-2 bg-surface-hover rounded-lg appearance-none cursor-pointer" />
                    </label>
                    <label className="block">
                        <span className="text-secondary text-sm">Birds: {localParams.initialBirds}</span>
                        <input type="range" name="initialBirds" min="0" max="20" value={localParams.initialBirds} onChange={handleParamChange} className="w-full h-2 bg-surface-hover rounded-lg appearance-none cursor-pointer" />
                    </label>
                </CollapsibleSection>

                <CollapsibleSection title="Ecosystem Rules" defaultOpen={false}>
                    <label className="block">
                        <span className="text-secondary text-sm">Herbicide Damage: {localParams.herbicideDamage}</span>
                        <input type="range" name="herbicideDamage" min="5" max="100" value={localParams.herbicideDamage} onChange={handleParamChange} className="w-full h-2 bg-surface-hover rounded-lg appearance-none cursor-pointer" />
                    </label>
                    <label className="block">
                        <span className="text-secondary text-sm">Herbicide Cooldown: {localParams.herbicideCooldown} ticks</span>
                        <input type="range" name="herbicideCooldown" min="10" max="500" value={localParams.herbicideCooldown} onChange={handleParamChange} className="w-full h-2 bg-surface-hover rounded-lg appearance-none cursor-pointer" />
                    </label>
                    <label className="block">
                        <span className="text-secondary text-sm">Herbicide Threshold: {Math.round(localParams.herbicideFlowerDensityThreshold * 100)}%</span>
                        <input type="range" name="herbicideFlowerDensityThreshold" min="0.1" max="1" step="0.01" value={localParams.herbicideFlowerDensityThreshold} onChange={handleParamChange} className="w-full h-2 bg-surface-hover rounded-lg appearance-none cursor-pointer" />
                    </label>
                </CollapsibleSection>
                
                <CollapsibleSection title="Evolution & Reproduction" defaultOpen={false}>
                    <label className="block">
                        <span className="text-secondary text-sm">Reproduction Cooldown: {localParams.reproductionCooldown} ticks</span>
                        <input type="range" name="reproductionCooldown" min="0" max="50" value={localParams.reproductionCooldown} onChange={handleParamChange} className="w-full h-2 bg-surface-hover rounded-lg appearance-none cursor-pointer" />
                    </label>
                    <label className="block">
                        <span className="text-secondary text-sm">Mutation Chance: {Math.round(localParams.mutationChance * 100)}%</span>
                        <input type="range" name="mutationChance" min="0" max="1" step="0.01" value={localParams.mutationChance} onChange={handleParamChange} className="w-full h-2 bg-surface-hover rounded-lg appearance-none cursor-pointer" />
                    </label>
                     <label className="block">
                        <span className="text-secondary text-sm">Mutation Amount: ±{Math.round(localParams.mutationAmount * 100)}%</span>
                        <input type="range" name="mutationAmount" min="0" max="1" step="0.01" value={localParams.mutationAmount} onChange={handleParamChange} className="w-full h-2 bg-surface-hover rounded-lg appearance-none cursor-pointer" />
                    </label>
                </CollapsibleSection>

                <CollapsibleSection title="Weather Events" defaultOpen={false}>
                     <label className="block">
                        <span className="text-secondary text-sm">Event Chance: {(localParams.weatherEventChance * 100).toFixed(1)}%</span>
                        <input type="range" name="weatherEventChance" min="0" max="0.1" step="0.001" value={localParams.weatherEventChance} onChange={handleParamChange} className="w-full h-2 bg-surface-hover rounded-lg appearance-none cursor-pointer" />
                    </label>
                    <label className="block">
                        <span className="text-secondary text-sm">Min Event Duration: {localParams.weatherEventMinDuration} ticks</span>
                        <input type="range" name="weatherEventMinDuration" min="5" max="100" value={localParams.weatherEventMinDuration} onChange={handleParamChange} className="w-full h-2 bg-surface-hover rounded-lg appearance-none cursor-pointer" />
                    </label>
                    <label className="block">
                        <span className="text-secondary text-sm">Max Event Duration: {localParams.weatherEventMaxDuration} ticks</span>
                        <input type="range" name="weatherEventMaxDuration" min="10" max="200" value={localParams.weatherEventMaxDuration} onChange={handleParamChange} className="w-full h-2 bg-surface-hover rounded-lg appearance-none cursor-pointer" />
                    </label>
                </CollapsibleSection>

                <CollapsibleSection title="Graphics & UI" defaultOpen={false}>
                    <label className="block">
                        <span className="text-secondary text-sm">Flower Detail</span>
                        <select name="flowerDetailRadius" value={localParams.flowerDetailRadius} onChange={handleParamChange} className="w-full mt-1 p-2 bg-surface-hover border border-surface rounded-md text-white">
                            {FLOWER_DETAIL_OPTIONS.map(val => <option key={val} value={val}>x{val}</option>)}
                        </select>
                    </label>
                     <label className="block">
                        <span className="text-secondary text-sm">Notification Mode</span>
                        <select name="notificationMode" value={localParams.notificationMode} onChange={handleParamChange} className="w-full mt-1 p-2 bg-surface-hover border border-surface rounded-md text-white">
                            <option value="log">Event Log Only</option>
                            <option value="toasts">Toasts for Important Events</option>
                            <option value="both">Log and All Toasts</option>
                        </select>
                    </label>
                </CollapsibleSection>
            </div>
        </div>
    );
};
