import React from 'react';
import { useAnalyticsStore } from '../stores/analyticsStore';
import { EnvironmentChart } from './charts/EnvironmentChart';
import { PopulationChart } from './charts/PopulationChart';
import { EventsChart } from './charts/EventsChart';
import { FlowerTraitsChart } from './charts/FlowerTraitsChart';
import { BaseEffectsChart } from './charts/BaseEffectsChart';
import { PerformanceChart } from './charts/PerformanceChart';

export const ChartsPanel: React.FC = () => {
    const history = useAnalyticsStore(state => state.history);

    return (
        <div className="p-4 space-y-4">
            <div className="bg-chart-background border-2 border-chart-border rounded-lg p-2">
                <EnvironmentChart history={history} />
            </div>
            <div className="bg-chart-background border-2 border-chart-border rounded-lg p-2">
                <PopulationChart history={history} />
            </div>
             <div className="bg-chart-background border-2 border-chart-border rounded-lg p-2">
                <EventsChart history={history} />
            </div>
            <div className="bg-chart-background border-2 border-chart-border rounded-lg p-2">
                <FlowerTraitsChart history={history} />
            </div>
            <div className="bg-chart-background border-2 border-chart-border rounded-lg p-2">
                <BaseEffectsChart history={history} />
            </div>
             <div className="bg-chart-background border-2 border-chart-border rounded-lg p-2">
                <PerformanceChart history={history} />
            </div>
        </div>
    );
};
