import React from 'react';
import type { TickSummary, WeatherEventType } from '../types';
import { SunIcon, CloudRainIcon, SnowflakeIcon, WindIcon } from './icons';

const eventInfo: Record<WeatherEventType, { icon: React.ReactNode; text: string; colorClass: string }> = {
    heatwave: { icon: <SunIcon className="w-4 h-4" />, text: 'Heatwave', colorClass: 'text-accent-yellow' },
    coldsnap: { icon: <SnowflakeIcon className="w-4 h-4" />, text: 'Coldsnap', colorClass: 'text-accent-blue' },
    heavyrain: { icon: <CloudRainIcon className="w-4 h-4" />, text: 'Heavy Rain', colorClass: 'text-blue-300' },
    drought: { icon: <WindIcon className="w-4 h-4" />, text: 'Drought', colorClass: 'text-yellow-500' },
    none: { icon: null, text: '', colorClass: '' },
};

interface EnvironmentDisplayProps {
    summary: TickSummary | null;
}

export const EnvironmentDisplay: React.FC<EnvironmentDisplayProps> = ({ summary }) => {
    if (!summary) {
        return (
            <div className="bg-background px-3 py-1.5 rounded-md text-xs text-secondary font-mono">
                Loading environment...
            </div>
        );
    }

    const { season, currentTemperature, currentHumidity, weatherEvent } = summary;
    const eventDetails = eventInfo[weatherEvent];

    return (
        <div className="bg-background px-3 py-1.5 rounded-md text-xs text-secondary font-mono flex items-center justify-between gap-3">
            <span>{season}</span>
            <span className="font-semibold text-primary">{currentTemperature.toFixed(1)}°C</span>
            <span>{(currentHumidity * 100).toFixed(0)}% Hum.</span>
            {weatherEvent !== 'none' && eventDetails && (
                <div className={`flex items-center space-x-1.5 capitalize p-1 bg-surface-hover/50 rounded ${eventDetails.colorClass}`}>
                    {eventDetails.icon}
                    <span className="font-semibold">{eventDetails.text}</span>
                </div>
            )}
        </div>
    );
};
