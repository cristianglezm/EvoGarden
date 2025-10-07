import React, { useState, useEffect } from 'react';
import type { SimulationParams, WindDirection } from '../types';
import { PlayIcon, PauseIcon, RefreshCwIcon, SaveIcon, UploadIcon, LoaderIcon } from './icons';
import { CollapsibleSection } from './CollapsibleSection';
import { INSECT_DATA } from '../constants';
import { ACTOR_NAMES } from '../utils';

interface ControlsProps {
    params: SimulationParams;
    onParamsChange: (params: SimulationParams, shouldReset: boolean) => void;
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
const SIMULATION_SPEED_OPTIONS = [0.5, 1, 2, 4];
const LIVE_UPDATABLE_PARAMS = ['simulationSpeed', 'notificationMode'];
// Create a list of all spawnable actors for the UI
const ACTOR_LIST = ['🐦', '🦅', ...Array.from(INSECT_DATA.keys())];


export const Controls: React.FC<ControlsProps> = ({ params, onParamsChange, isRunning, setIsRunning, onSave, onLoad, hasSavedState, isSaving, onStart }) => {
    const [localParams, setLocalParams] = useState<SimulationParams>(params);

    useEffect(() => {
        setLocalParams(params);
    }, [params]);

    const handleParamChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target;
        
        setLocalParams(prev => {
            const isFloat = ['humidity', 'herbicideFlowerDensityThreshold', 'humidityAmplitude', 'weatherEventChance', 'heavyRainHumidityIncrease', 'droughtHumidityDecrease', 'mutationChance', 'mutationAmount', 'beeWinterHoneyConsumption', 'hivePollenToHoneyRatio', 'beePollinationWanderChance', 'pheromoneStrengthDecay', 'spiderWebStaminaRegen', 'spiderWebTrapChance', 'spiderEscapeChanceModifier', 'simulationSpeed'].includes(name);
            const isString = ['windDirection', 'notificationMode'].includes(name);
        
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

            if (LIVE_UPDATABLE_PARAMS.includes(name)) {
                onParamsChange(newParams, false);
            }
            
            return newParams;
        });
    };
    
    const handleAllowedActorsChange = (emoji: string, checked: boolean) => {
        setLocalParams(prev => {
            const currentAllowed = new Set(prev.allowedActors);
            const linkedEmoji = emoji === '🦋' ? '🐛' : emoji === '🐛' ? '🦋' : null;
    
            if (checked) {
                currentAllowed.add(emoji);
                if (linkedEmoji) currentAllowed.add(linkedEmoji);
            } else {
                currentAllowed.delete(emoji);
                if (linkedEmoji) currentAllowed.delete(linkedEmoji);
            }
    
            return { ...prev, allowedActors: Array.from(currentAllowed) };
        });
    };

    const handleApply = () => {
        onParamsChange(localParams, true);
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
                    <label className="block" htmlFor="gridWidth">
                        <span className="text-secondary text-sm">Grid Width: {localParams.gridWidth}</span>
                        <input type="range" name="gridWidth" id="gridWidth" min="10" max="35" value={localParams.gridWidth} onChange={handleParamChange} className="w-full h-2 bg-surface-hover rounded-lg appearance-none cursor-pointer" />
                    </label>
                    <label className="block" htmlFor="gridHeight">
                        <span className="text-secondary text-sm">Grid Height: {localParams.gridHeight}</span>
                        <input type="range" name="gridHeight" id="gridHeight" min="10" max="35" value={localParams.gridHeight} onChange={handleParamChange} className="w-full h-2 bg-surface-hover rounded-lg appearance-none cursor-pointer" />
                    </label>
                     <label className="block" htmlFor="seasonLengthInTicks">
                        <span className="text-secondary text-sm">Season Length: {localParams.seasonLengthInTicks} ticks</span>
                        <input type="range" name="seasonLengthInTicks" id="seasonLengthInTicks" min="100" max="5000" step="100" value={localParams.seasonLengthInTicks} onChange={handleParamChange} className="w-full h-2 bg-surface-hover rounded-lg appearance-none cursor-pointer" />
                    </label>
                    <label className="block" htmlFor="temperature">
                        <span className="text-secondary text-sm">Base Temperature: {localParams.temperature}°C</span>
                        <input type="range" name="temperature" id="temperature" min="-10" max="50" value={localParams.temperature} onChange={handleParamChange} className="w-full h-2 bg-surface-hover rounded-lg appearance-none cursor-pointer" />
                    </label>
                     <label className="block" htmlFor="temperatureAmplitude">
                        <span className="text-secondary text-sm">Temp. Variation: ±{localParams.temperatureAmplitude}°C</span>
                        <input type="range" name="temperatureAmplitude" id="temperatureAmplitude" min="0" max="25" value={localParams.temperatureAmplitude} onChange={handleParamChange} className="w-full h-2 bg-surface-hover rounded-lg appearance-none cursor-pointer" />
                    </label>
                    <label className="block" htmlFor="humidity">
                        <span className="text-secondary text-sm">Base Humidity: {Math.round(localParams.humidity * 100)}%</span>
                        <input type="range" name="humidity" id="humidity" min="0" max="1" step="0.01" value={localParams.humidity} onChange={handleParamChange} className="w-full h-2 bg-surface-hover rounded-lg appearance-none cursor-pointer" />
                    </label>
                    <label className="block" htmlFor="humidityAmplitude">
                        <span className="text-secondary text-sm">Humidity Variation: ±{Math.round(localParams.humidityAmplitude * 100)}%</span>
                        <input type="range" name="humidityAmplitude" id="humidityAmplitude" min="0" max="0.5" step="0.01" value={localParams.humidityAmplitude} onChange={handleParamChange} className="w-full h-2 bg-surface-hover rounded-lg appearance-none cursor-pointer" />
                    </label>
                    <label className="block" htmlFor="windDirection">
                        <span className="text-secondary text-sm">Wind Direction</span>
                        <select name="windDirection" id="windDirection" value={localParams.windDirection} onChange={handleParamChange} className="w-full mt-1 p-2 bg-surface-hover border border-surface rounded-md text-white">
                            {WIND_DIRECTIONS.map(dir => <option key={dir} value={dir}>{dir}</option>)}
                        </select>
                    </label>
                    <label className="block" htmlFor="windStrength">
                        <span className="text-secondary text-sm">Wind Strength: {localParams.windStrength} cells</span>
                        <input type="range" name="windStrength" id="windStrength" min="1" max="15" value={localParams.windStrength} onChange={handleParamChange} className="w-full h-2 bg-surface-hover rounded-lg appearance-none cursor-pointer" />
                    </label>
                </CollapsibleSection>
                
                <CollapsibleSection title="Initial Population">
                    <label className="block" htmlFor="initialFlowers">
                        <span className="text-secondary text-sm">Flowers: {localParams.initialFlowers}</span>
                        <input type="range" name="initialFlowers" id="initialFlowers" min="0" max={maxFlowers} value={localParams.initialFlowers} onChange={handleParamChange} className="w-full h-2 bg-surface-hover rounded-lg appearance-none cursor-pointer" />
                    </label>
                    <label className="block" htmlFor="initialInsects">
                        <span className="text-secondary text-sm">Insects: {localParams.initialInsects}</span>
                        <input type="range" name="initialInsects" id="initialInsects" min="0" max="30" value={localParams.initialInsects} onChange={handleParamChange} className="w-full h-2 bg-surface-hover rounded-lg appearance-none cursor-pointer" />
                    </label>
                    <label className="block" htmlFor="initialBirds">
                        <span className="text-secondary text-sm">Birds: {localParams.initialBirds}</span>
                        <input type="range" name="initialBirds" id="initialBirds" min="0" max="20" value={localParams.initialBirds} onChange={handleParamChange} className="w-full h-2 bg-surface-hover rounded-lg appearance-none cursor-pointer" />
                    </label>
                </CollapsibleSection>

                 <CollapsibleSection title="Permitted Actors" defaultOpen={false}>
                    <div className="grid grid-cols-2 gap-2">
                        {ACTOR_LIST.map(emoji => (
                            <label key={emoji} className="flex items-center space-x-2 text-sm text-secondary cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={localParams.allowedActors.includes(emoji)}
                                    onChange={(e) => handleAllowedActorsChange(emoji, e.target.checked)}
                                    className="h-4 w-4 rounded bg-surface border-border text-accent-green focus:ring-accent-green"
                                />
                                <span>{emoji} {ACTOR_NAMES[emoji]}</span>
                            </label>
                        ))}
                    </div>
                </CollapsibleSection>

                 <CollapsibleSection title="Hive & Colony Rules" defaultOpen={false}>
                    <label className="block" htmlFor="hiveGridArea">
                        <span className="text-secondary text-sm">Hive Grid Area: {localParams.hiveGridArea}x{localParams.hiveGridArea}</span>
                        <input type="range" name="hiveGridArea" id="hiveGridArea" min="5" max="20" value={localParams.hiveGridArea} onChange={handleParamChange} className="w-full h-2 bg-surface-hover rounded-lg appearance-none cursor-pointer" />
                    </label>
                    <label className="block" htmlFor="beeDormancyTemp">
                        <span className="text-secondary text-sm">Bee Dormancy Temp: {localParams.beeDormancyTemp}°C</span>
                        <input type="range" name="beeDormancyTemp" id="beeDormancyTemp" min="0" max="20" value={localParams.beeDormancyTemp} onChange={handleParamChange} className="w-full h-2 bg-surface-hover rounded-lg appearance-none cursor-pointer" />
                    </label>
                    <label className="block" htmlFor="beeWinterHoneyConsumption">
                        <span className="text-secondary text-sm">Winter Honey Use: {(localParams.beeWinterHoneyConsumption * 100).toFixed(2)}%</span>
                        <input type="range" name="beeWinterHoneyConsumption" id="beeWinterHoneyConsumption" min="0" max="0.1" step="0.001" value={localParams.beeWinterHoneyConsumption} onChange={handleParamChange} className="w-full h-2 bg-surface-hover rounded-lg appearance-none cursor-pointer" />
                    </label>
                    <label className="block" htmlFor="hivePollenToHoneyRatio">
                        <span className="text-secondary text-sm">Pollen to Honey: {(localParams.hivePollenToHoneyRatio * 100).toFixed(0)}%</span>
                        <input type="range" name="hivePollenToHoneyRatio" id="hivePollenToHoneyRatio" min="0.1" max="1" step="0.05" value={localParams.hivePollenToHoneyRatio} onChange={handleParamChange} className="w-full h-2 bg-surface-hover rounded-lg appearance-none cursor-pointer" />
                    </label>
                    <label className="block" htmlFor="hiveSpawnThreshold">
                        <span className="text-secondary text-sm">Hive Spawn Threshold: {localParams.hiveSpawnThreshold} honey</span>
                        <input type="range" name="hiveSpawnThreshold" id="hiveSpawnThreshold" min="20" max="200" step="10" value={localParams.hiveSpawnThreshold} onChange={handleParamChange} className="w-full h-2 bg-surface-hover rounded-lg appearance-none cursor-pointer" />
                    </label>
                    <label className="block" htmlFor="hiveSpawnCost">
                        <span className="text-secondary text-sm">Hive Spawn Cost: {localParams.hiveSpawnCost} honey</span>
                        <input type="range" name="hiveSpawnCost" id="hiveSpawnCost" min="10" max="100" step="5" value={localParams.hiveSpawnCost} onChange={handleParamChange} className="w-full h-2 bg-surface-hover rounded-lg appearance-none cursor-pointer" />
                    </label>
                    <label className="block" htmlFor="territoryMarkLifespan">
                        <span className="text-secondary text-sm">Territory Mark Lifespan: {localParams.territoryMarkLifespan} ticks</span>
                        <input type="range" name="territoryMarkLifespan" id="territoryMarkLifespan" min="20" max="500" step="10" value={localParams.territoryMarkLifespan} onChange={handleParamChange} className="w-full h-2 bg-surface-hover rounded-lg appearance-none cursor-pointer" />
                    </label>
                    <label className="block" htmlFor="signalTTL">
                        <span className="text-secondary text-sm">Signal TTL: {localParams.signalTTL} marks</span>
                        <input type="range" name="signalTTL" id="signalTTL" min="1" max="20" value={localParams.signalTTL} onChange={handleParamChange} className="w-full h-2 bg-surface-hover rounded-lg appearance-none cursor-pointer" />
                    </label>
                    <label className="block" htmlFor="beePollinationWanderChance">
                        <span className="text-secondary text-sm">Pollination Wander: {Math.round(localParams.beePollinationWanderChance * 100)}%</span>
                        <input type="range" name="beePollinationWanderChance" id="beePollinationWanderChance" min="0" max="1" step="0.01" value={localParams.beePollinationWanderChance} onChange={handleParamChange} className="w-full h-2 bg-surface-hover rounded-lg appearance-none cursor-pointer" />
                    </label>
                    <div className="pt-3 mt-3 border-t border-border/50">
                        <h4 className="text-md font-semibold text-primary-light/70 mb-2">Ants</h4>
                        <label className="block" htmlFor="colonyGridArea">
                            <span className="text-secondary text-sm">Colony Grid Area: {localParams.colonyGridArea}x{localParams.colonyGridArea}</span>
                            <input type="range" name="colonyGridArea" id="colonyGridArea" min="5" max="20" value={localParams.colonyGridArea} onChange={handleParamChange} className="w-full h-2 bg-surface-hover rounded-lg appearance-none cursor-pointer" />
                        </label>
                        <label className="block" htmlFor="antDormancyTemp">
                            <span className="text-secondary text-sm">Ant Dormancy Temp: {localParams.antDormancyTemp}°C</span>
                            <input type="range" name="antDormancyTemp" id="antDormancyTemp" min="0" max="20" value={localParams.antDormancyTemp} onChange={handleParamChange} className="w-full h-2 bg-surface-hover rounded-lg appearance-none cursor-pointer" />
                        </label>
                        <label className="block" htmlFor="antColonySpawnThreshold">
                            <span className="text-secondary text-sm">Colony Spawn Threshold: {localParams.antColonySpawnThreshold} food</span>
                            <input type="range" name="antColonySpawnThreshold" id="antColonySpawnThreshold" min="20" max="200" step="10" value={localParams.antColonySpawnThreshold} onChange={handleParamChange} className="w-full h-2 bg-surface-hover rounded-lg appearance-none cursor-pointer" />
                        </label>
                        <label className="block" htmlFor="antColonySpawnCost">
                            <span className="text-secondary text-sm">Colony Spawn Cost: {localParams.antColonySpawnCost} food</span>
                            <input type="range" name="antColonySpawnCost" id="antColonySpawnCost" min="10" max="100" step="5" value={localParams.antColonySpawnCost} onChange={handleParamChange} className="w-full h-2 bg-surface-hover rounded-lg appearance-none cursor-pointer" />
                        </label>
                        <label className="block" htmlFor="pheromoneLifespan">
                            <span className="text-secondary text-sm">Pheromone Lifespan: {localParams.pheromoneLifespan} ticks</span>
                            <input type="range" name="pheromoneLifespan" id="pheromoneLifespan" min="50" max="500" step="10" value={localParams.pheromoneLifespan} onChange={handleParamChange} className="w-full h-2 bg-surface-hover rounded-lg appearance-none cursor-pointer" />
                        </label>
                        <label className="block" htmlFor="pheromoneStrengthDecay">
                            <span className="text-secondary text-sm">Pheromone Decay Rate: {(localParams.pheromoneStrengthDecay * 100).toFixed(1)}%</span>
                            <input type="range" name="pheromoneStrengthDecay" id="pheromoneStrengthDecay" min="0.01" max="0.2" step="0.01" value={localParams.pheromoneStrengthDecay} onChange={handleParamChange} className="w-full h-2 bg-surface-hover rounded-lg appearance-none cursor-pointer" />
                        </label>
                    </div>
                </CollapsibleSection>

                <CollapsibleSection title="Spider Rules" defaultOpen={false}>
                    <label className="block" htmlFor="spiderGridArea">
                        <span className="text-secondary text-sm">Spider Grid Area: {localParams.spiderGridArea}x{localParams.spiderGridArea}</span>
                        <input type="range" name="spiderGridArea" id="spiderGridArea" min="5" max="20" value={localParams.spiderGridArea} onChange={handleParamChange} className="w-full h-2 bg-surface-hover rounded-lg appearance-none cursor-pointer" />
                    </label>
                    <label className="block" htmlFor="spiderWebStamina">
                        <span className="text-secondary text-sm">Web Stamina: {localParams.spiderWebStamina}</span>
                        <input type="range" name="spiderWebStamina" id="spiderWebStamina" min="20" max="200" step="10" value={localParams.spiderWebStamina} onChange={handleParamChange} className="w-full h-2 bg-surface-hover rounded-lg appearance-none cursor-pointer" />
                    </label>
                    <label className="block" htmlFor="spiderWebStaminaRegen">
                        <span className="text-secondary text-sm">Web Stamina Regen: {localParams.spiderWebStaminaRegen.toFixed(2)}/tick</span>
                        <input type="range" name="spiderWebStaminaRegen" id="spiderWebStaminaRegen" min="0.1" max="2" step="0.05" value={localParams.spiderWebStaminaRegen} onChange={handleParamChange} className="w-full h-2 bg-surface-hover rounded-lg appearance-none cursor-pointer" />
                    </label>
                    <label className="block" htmlFor="spiderWebBuildCost">
                        <span className="text-secondary text-sm">Web Build Cost: {localParams.spiderWebBuildCost}</span>
                        <input type="range" name="spiderWebBuildCost" id="spiderWebBuildCost" min="5" max="50" step="5" value={localParams.spiderWebBuildCost} onChange={handleParamChange} className="w-full h-2 bg-surface-hover rounded-lg appearance-none cursor-pointer" />
                    </label>
                    <label className="block" htmlFor="spiderMaxWebs">
                        <span className="text-secondary text-sm">Max Webs: {localParams.spiderMaxWebs}</span>
                        <input type="range" name="spiderMaxWebs" id="spiderMaxWebs" min="1" max="15" value={localParams.spiderMaxWebs} onChange={handleParamChange} className="w-full h-2 bg-surface-hover rounded-lg appearance-none cursor-pointer" />
                    </label>
                    <label className="block" htmlFor="spiderWebLifespan">
                        <span className="text-secondary text-sm">Web Lifespan: {localParams.spiderWebLifespan} ticks</span>
                        <input type="range" name="spiderWebLifespan" id="spiderWebLifespan" min="100" max="1000" step="50" value={localParams.spiderWebLifespan} onChange={handleParamChange} className="w-full h-2 bg-surface-hover rounded-lg appearance-none cursor-pointer" />
                    </label>
                    <label className="block" htmlFor="spiderWebStrength">
                        <span className="text-secondary text-sm">Web Strength: {localParams.spiderWebStrength}</span>
                        <input type="range" name="spiderWebStrength" id="spiderWebStrength" min="5" max="50" value={localParams.spiderWebStrength} onChange={handleParamChange} className="w-full h-2 bg-surface-hover rounded-lg appearance-none cursor-pointer" />
                    </label>
                    <label className="block" htmlFor="spiderWebTrapChance">
                        <span className="text-secondary text-sm">Trap Chance: {(localParams.spiderWebTrapChance * 100).toFixed(0)}%</span>
                        <input type="range" name="spiderWebTrapChance" id="spiderWebTrapChance" min="0.1" max="1" step="0.05" value={localParams.spiderWebTrapChance} onChange={handleParamChange} className="w-full h-2 bg-surface-hover rounded-lg appearance-none cursor-pointer" />
                    </label>
                     <label className="block" htmlFor="spiderEscapeChanceModifier">
                        <span className="text-secondary text-sm">Escape Modifier: {(localParams.spiderEscapeChanceModifier * 100).toFixed(0)}%</span>
                        <input type="range" name="spiderEscapeChanceModifier" id="spiderEscapeChanceModifier" min="0.1" max="2" step="0.05" value={localParams.spiderEscapeChanceModifier} onChange={handleParamChange} className="w-full h-2 bg-surface-hover rounded-lg appearance-none cursor-pointer" />
                    </label>
                </CollapsibleSection>

                <CollapsibleSection title="Ecosystem Rules" defaultOpen={false}>
                    <label className="block" htmlFor="herbicideDamage">
                        <span className="text-secondary text-sm">Herbicide Damage: {localParams.herbicideDamage}</span>
                        <input type="range" name="herbicideDamage" id="herbicideDamage" min="5" max="100" value={localParams.herbicideDamage} onChange={handleParamChange} className="w-full h-2 bg-surface-hover rounded-lg appearance-none cursor-pointer" />
                    </label>
                    <label className="block" htmlFor="herbicideCooldown">
                        <span className="text-secondary text-sm">Herbicide Cooldown: {localParams.herbicideCooldown} ticks</span>
                        <input type="range" name="herbicideCooldown" id="herbicideCooldown" min="10" max="500" value={localParams.herbicideCooldown} onChange={handleParamChange} className="w-full h-2 bg-surface-hover rounded-lg appearance-none cursor-pointer" />
                    </label>
                    <label className="block" htmlFor="herbicideFlowerDensityThreshold">
                        <span className="text-secondary text-sm">Herbicide Threshold: {Math.round(localParams.herbicideFlowerDensityThreshold * 100)}%</span>
                        <input type="range" name="herbicideFlowerDensityThreshold" id="herbicideFlowerDensityThreshold" min="0.1" max="1" step="0.01" value={localParams.herbicideFlowerDensityThreshold} onChange={handleParamChange} className="w-full h-2 bg-surface-hover rounded-lg appearance-none cursor-pointer" />
                    </label>
                </CollapsibleSection>
                
                <CollapsibleSection title="Evolution & Reproduction" defaultOpen={false}>
                    <label className="block" htmlFor="reproductionCooldown">
                        <span className="text-secondary text-sm">Reproduction Cooldown: {localParams.reproductionCooldown} ticks</span>
                        <input type="range" name="reproductionCooldown" id="reproductionCooldown" min="0" max="50" value={localParams.reproductionCooldown} onChange={handleParamChange} className="w-full h-2 bg-surface-hover rounded-lg appearance-none cursor-pointer" />
                    </label>
                    <label className="block" htmlFor="mutationChance">
                        <span className="text-secondary text-sm">Mutation Chance: {Math.round(localParams.mutationChance * 100)}%</span>
                        <input type="range" name="mutationChance" id="mutationChance" min="0" max="1" step="0.01" value={localParams.mutationChance} onChange={handleParamChange} className="w-full h-2 bg-surface-hover rounded-lg appearance-none cursor-pointer" />
                    </label>
                     <label className="block" htmlFor="mutationAmount">
                        <span className="text-secondary text-sm">Mutation Amount: ±{Math.round(localParams.mutationAmount * 100)}%</span>
                        <input type="range" name="mutationAmount" id="mutationAmount" min="0" max="1" step="0.01" value={localParams.mutationAmount} onChange={handleParamChange} className="w-full h-2 bg-surface-hover rounded-lg appearance-none cursor-pointer" />
                    </label>
                </CollapsibleSection>

                <CollapsibleSection title="Weather Events" defaultOpen={false}>
                     <label className="block" htmlFor="weatherEventChance">
                        <span className="text-secondary text-sm">Event Chance: {(localParams.weatherEventChance * 100).toFixed(1)}%</span>
                        <input type="range" name="weatherEventChance" id="weatherEventChance" min="0" max="0.1" step="0.001" value={localParams.weatherEventChance} onChange={handleParamChange} className="w-full h-2 bg-surface-hover rounded-lg appearance-none cursor-pointer" />
                    </label>
                    <label className="block" htmlFor="weatherEventMinDuration">
                        <span className="text-secondary text-sm">Min Event Duration: {localParams.weatherEventMinDuration} ticks</span>
                        <input type="range" name="weatherEventMinDuration" id="weatherEventMinDuration" min="5" max="100" value={localParams.weatherEventMinDuration} onChange={handleParamChange} className="w-full h-2 bg-surface-hover rounded-lg appearance-none cursor-pointer" />
                    </label>
                    <label className="block" htmlFor="weatherEventMaxDuration">
                        <span className="text-secondary text-sm">Max Event Duration: {localParams.weatherEventMaxDuration} ticks</span>
                        <input type="range" name="weatherEventMaxDuration" id="weatherEventMaxDuration" min="10" max="200" value={localParams.weatherEventMaxDuration} onChange={handleParamChange} className="w-full h-2 bg-surface-hover rounded-lg appearance-none cursor-pointer" />
                    </label>
                </CollapsibleSection>

                <CollapsibleSection title="Graphics & UI" defaultOpen={false}>
                    <label className="block" htmlFor="simulationSpeed">
                        <span className="text-secondary text-sm">Simulation Speed</span>
                        <select name="simulationSpeed" id="simulationSpeed" value={localParams.simulationSpeed} onChange={handleParamChange} className="w-full mt-1 p-2 bg-surface-hover border border-surface rounded-md text-white">
                            {SIMULATION_SPEED_OPTIONS.map(val => <option key={val} value={val}>{val}x</option>)}
                        </select>
                    </label>
                    <label className="block" htmlFor="flowerDetailRadius">
                        <span className="text-secondary text-sm">Flower Detail</span>
                        <select name="flowerDetailRadius" id="flowerDetailRadius" value={localParams.flowerDetailRadius} onChange={handleParamChange} className="w-full mt-1 p-2 bg-surface-hover border border-surface rounded-md text-white">
                            {FLOWER_DETAIL_OPTIONS.map(val => <option key={val} value={val}>x{val}</option>)}
                        </select>
                    </label>
                     <label className="block" htmlFor="notificationMode">
                        <span className="text-secondary text-sm">Notification Mode</span>
                        <select name="notificationMode" id="notificationMode" value={localParams.notificationMode} onChange={handleParamChange} className="w-full mt-1 p-2 bg-surface-hover border border-surface rounded-md text-white">
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
