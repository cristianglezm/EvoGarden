import React, { useMemo, useState } from 'react';
import type { EChartsOption } from 'echarts';
import type { AnalyticsDataPoint } from '../../types';
import { Chart } from '../Chart';
import { baseChartOptions, createLegendSelectHandler } from './chartOptions';

interface PopulationChartProps {
    history: AnalyticsDataPoint[];
}

export const PopulationChart: React.FC<PopulationChartProps> = ({ history }) => {
    const [populationLegend, setPopulationLegend] = useState<Record<string, boolean>>({ 
        'Total Flowers': true, 
        'Healing Flowers': true,
        'Toxic Flowers': true,
        'Insects': true, 
        'Birds': true, 
        'Eagles': true, 
        'Eggs': true, 
        'Herbicide Planes': true, 
        'Herbicide Smokes': true, 
        'Corpses': true, 
        'Cockroaches': true,
    });
    const handlePopulationLegendChange = createLegendSelectHandler(setPopulationLegend);

    const populationOption = useMemo<EChartsOption>(() => {
        const ticks = history.map(h => h.tick);
        return {
            ...baseChartOptions,
            title: { text: 'Population Dynamics', left: 'center', textStyle: { color: '#bbf7d0', fontWeight: 'bold' }, top: 0 },
            legend: { 
                data: ['Flowers', 'Insects', 'Birds', 'Eagles', 'Eggs', 'Herbicide Planes', 'Herbicide Smokes', 'Corpses', 'Cockroaches', 'Healing Flowers', 'Toxic Flowers'], 
                top: 35, 
                textStyle: { color: '#bbf7d0' }, 
                selected: populationLegend 
            },
            xAxis: { ...baseChartOptions.xAxis, data: ticks },
            series: [
                { name: 'Total Flowers', type: 'line', data: history.map(h => h.flowers), color: '#48bb78' },
                { name: 'Healing Flowers', type: 'line', data: history.map(h => h.healingFlowerCount || 0), color: '#38a169', lineStyle: { type: 'dashed' } },
                { name: 'Toxic Flowers', type: 'line', data: history.map(h => h.toxicFlowerCount || 0), color: '#c05621', lineStyle: { type: 'dashed' } },
                { name: 'Insects', type: 'line', data: history.map(h => h.insects), color: '#4299e1' },
                { name: 'Birds', type: 'line', data: history.map(h => h.birds), color: '#f56565' },
                { name: 'Eagles', type: 'line', data: history.map(h => h.eagles), color: '#d69e2e' },
                { name: 'Eggs', type: 'line', data: history.map(h => h.eggCount), color: '#a0aec0' },
                { name: 'Herbicide Planes', type: 'line', data: history.map(h => h.herbicidePlanes || 0), color: '#cbd5e0' },
                { name: 'Herbicide Smokes', type: 'line', data: history.map(h => h.herbicideSmokes || 0), color: '#718096' },
                { name: 'Corpses', type: 'line', data: history.map(h => h.corpses || 0), color: '#a0aec0' },
                { name: 'Cockroaches', type: 'line', data: history.map(h => h.cockroaches || 0), color: '#7a4a2a' },
            ],
        };
    }, [history, populationLegend]);

    return <Chart option={populationOption} onEvents={{ 'legendselectchanged': handlePopulationLegendChange }} />;
};
