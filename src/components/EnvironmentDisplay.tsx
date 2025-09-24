import React from 'react';
import type { TickSummary, WeatherEventType } from '../types';
import { SunIcon, CloudRainIcon, SnowflakeIcon, WindIcon } from './icons';

const eventIcons: Record<WeatherEventType, React.ReactNode> = {
    heatwave: <SunIcon className="w-4 h-4 text-accent-yellow" />,
    coldsnap: <SnowflakeIcon className="w-4 h-4 text-accent-blue" />,
    heavyrain: <CloudRainIcon className="w-4 h-4 text-blue-300" />,
    drought: <WindIcon className="w-4 h-4 text-yellow-500" />,
    none: null,
};

export const EnvironmentDisplay: React.FC<{ summary: TickSummary | null }> = ({ summary }) => {
    if (!summary) {
        return <div className="h-5"></div>; // Placeholder to prevent layout shift
    }

    const { season, currentTemperature, currentHumidity, weatherEvent } = summary;

    return (
        <div className="flex items-center space-x-3 text-xs text-secondary mt-1">
            <span>{season}</span>
            <span className="font-semibold text-primary">{currentTemperature.toFixed(1)}°C</span>
            <span>{(currentHumidity * 100).toFixed(0)}% Hum.</span>
            {weatherEvent !== 'none' && (
                <div className="flex items-center space-x-1 capitalize p-1 bg-surface-hover/50 rounded">
                    {eventIcons[weatherEvent]}
                    <span>{weatherEvent}</span>
                </div>
            )}
        </div>
    );
};
