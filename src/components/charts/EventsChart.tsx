import React, { useMemo, useState } from 'react';
import type { EChartsOption } from 'echarts';
import type { AnalyticsDataPoint } from '../../types';
import { Chart } from '../Chart';
import { baseChartOptions, createLegendSelectHandler } from './chartOptions';

interface EventsChartProps {
    history: AnalyticsDataPoint[];
}

export const EventsChart: React.FC<EventsChartProps> = ({ history }) => {
    const [eventsLegend, setEventsLegend] = useState<Record<string, boolean>>({ 'Reproductions': true, 'Eggs Laid': true, 'Insects Born': true, 'Insects Eaten': true, 'Cocoons Eaten': true, 'Eggs Eaten': true, 'Died of Old Age': true });
    const handleEventsLegendChange = createLegendSelectHandler(setEventsLegend);
    
    const eventsOption = useMemo<EChartsOption>(() => {
        const ticks = history.map(h => h.tick);
        return {
            ...baseChartOptions,
            title: { text: 'Ecosystem Events', left: 'center', textStyle: { color: '#bbf7d0', fontWeight: 'bold' }, top: 0 },
            legend: { data: ['Reproductions', 'Eggs Laid', 'Insects Born', 'Insects Eaten', 'Cocoons Eaten', 'Eggs Eaten', 'Died of Old Age'], top: 35, textStyle: { color: '#bbf7d0' }, selected: eventsLegend },
            xAxis: { ...baseChartOptions.xAxis, data: ticks },
            series: [
                { name: 'Reproductions', type: 'line', data: history.map(h => h.reproductions), color: '#9f7aea' },
                { name: 'Eggs Laid', type: 'line', data: history.map(h => h.eggsLaid), color: '#ecc94b' },
                { name: 'Insects Born', type: 'line', data: history.map(h => h.insectsBorn), color: '#63b3ed' },
                { name: 'Insects Eaten', type: 'line', data: history.map(h => h.insectsEaten), color: '#ed8936' },
                { name: 'Cocoons Eaten', type: 'line', data: history.map(h => h.cocoonsEaten || 0), color: '#e2e8f0' },
                { name: 'Eggs Eaten', type: 'line', data: history.map(h => h.eggsEaten), color: '#a0aec0' },
                { name: 'Died of Old Age', type: 'line', data: history.map(h => h.insectsDiedOfOldAge), color: '#f7fafc' },
            ],
        };
    }, [history, eventsLegend]);
    
    return <Chart option={eventsOption} onEvents={{ 'legendselectchanged': handleEventsLegendChange }} />;
};
