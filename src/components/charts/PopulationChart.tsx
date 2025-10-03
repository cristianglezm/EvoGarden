import React, { useMemo, useState } from 'react';
import type { EChartsOption } from 'echarts';
import type { AnalyticsDataPoint } from '../../types';
import { Chart } from '../Chart';
import { baseChartOptions, createLegendSelectHandler } from './chartOptions';

interface PopulationDynamicsChartProps {
    history: AnalyticsDataPoint[];
}

export const PopulationDynamicsChart: React.FC<PopulationDynamicsChartProps> = ({ history }) => {
    const [legend, setLegend] = useState<Record<string, boolean>>({ 
        'Total Insects': true,
        'Birds': true, 
        'Eagles': true, 
        'Eggs': true, 
        'Cocoons': true,
        'Butterflies': true,
        'Caterpillars': true,
        'Beetles': true,
        'Ladybugs': true,
        'Cockroaches': true,
        'Snails': true,
        'Bees': true,
        'Scorpions': true,
        'Ants': true,
    });
    const handleLegendChange = createLegendSelectHandler(setLegend);

    const option = useMemo<EChartsOption>(() => {
        const ticks = history.map(h => h.tick);
        return {
            ...baseChartOptions,
            title: { text: 'Population Dynamics & Food Web', left: 'center', textStyle: { color: '#bbf7d0', fontWeight: 'bold' }, top: 0 },
            legend: { 
                data: ['Total Insects', 'Birds', 'Eagles', 'Eggs', 'Cocoons', 'Butterflies', 'Caterpillars', 'Beetles', 'Ladybugs', 'Cockroaches', 'Snails', 'Bees', 'Scorpions', 'Ants'], 
                top: 35, 
                textStyle: { color: '#bbf7d0' }, 
                selected: legend 
            },
            xAxis: { ...baseChartOptions.xAxis, data: ticks },
            series: [
                { name: 'Total Insects', type: 'line', data: history.map(h => h.insects), color: '#4299e1' },
                { name: 'Birds', type: 'line', data: history.map(h => h.birds), color: '#f56565' },
                { name: 'Eagles', type: 'line', data: history.map(h => h.eagles), color: '#d69e2e' },
                { name: 'Eggs', type: 'line', data: history.map(h => h.eggCount), color: '#a0aec0' },
                { name: 'Cocoons', type: 'line', data: history.map(h => h.cocoons || 0), color: '#e5e7eb' },
                { name: 'Butterflies', type: 'line', data: history.map(h => h.butterflies || 0), color: '#f97316' },
                { name: 'Caterpillars', type: 'line', data: history.map(h => h.caterpillars || 0), color: '#84cc16' },
                { name: 'Beetles', type: 'line', data: history.map(h => h.beetles || 0), color: '#966919' },
                { name: 'Ladybugs', type: 'line', data: history.map(h => h.ladybugs || 0), color: '#E53E3E' },
                { name: 'Cockroaches', type: 'line', data: history.map(h => h.cockroaches || 0), color: '#7a4a2a' },
                { name: 'Snails', type: 'line', data: history.map(h => h.snails || 0), color: '#D1D5DB' },
                { name: 'Bees', type: 'line', data: history.map(h => h.bees || 0), color: '#FBBF24' },
                { name: 'Scorpions', type: 'line', data: history.map(h => h.scorpionCount || 0), color: '#8B0000' },
                { name: 'Ants', type: 'line', data: history.map(h => h.antCount || 0), color: '#6B4423' },
            ],
        };
    }, [history, legend]);

    return <Chart option={option} onEvents={{ 'legendselectchanged': handleLegendChange }} />;
};