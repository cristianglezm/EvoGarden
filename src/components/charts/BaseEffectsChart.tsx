import React, { useMemo, useState } from 'react';
import type { EChartsOption } from 'echarts';
import type { AnalyticsDataPoint } from '../../types';
import { Chart } from '../Chart';
import { baseChartOptions, createLegendSelectHandler } from './chartOptions';

interface BaseEffectsChartProps {
    history: AnalyticsDataPoint[];
}

export const BaseEffectsChart: React.FC<BaseEffectsChartProps> = ({ history }) => {
    const [effectsLegend, setEffectsLegend] = useState<Record<string, boolean>>({ 'Avg Vitality': true, 'Avg Agility': true, 'Avg Strength': true, 'Avg Intelligence': true, 'Avg Luck': true });
    const handleEffectsLegendChange = createLegendSelectHandler(setEffectsLegend);

    const baseEffectsOption = useMemo<EChartsOption>(() => {
        const ticks = history.map(h => h.tick);
        return {
            ...baseChartOptions,
            title: { text: 'Base Genetic Effects', left: 'center', textStyle: { color: '#bbf7d0', fontWeight: 'bold' }, top: 0 },
            legend: { data: ['Avg Vitality', 'Avg Agility', 'Avg Strength', 'Avg Intelligence', 'Avg Luck'], top: 35, textStyle: { color: '#bbf7d0' }, selected: effectsLegend },
            xAxis: { ...baseChartOptions.xAxis, data: ticks },
            yAxis: { ...baseChartOptions.yAxis, name: 'Effect Score' },
            series: [
                { name: 'Avg Vitality', type: 'line', data: history.map(h => h.avgVitality.toFixed(2)), color: '#e53e3e' },
                { name: 'Avg Agility', type: 'line', data: history.map(h => h.avgAgility.toFixed(2)), color: '#38b2ac' },
                { name: 'Avg Strength', type: 'line', data: history.map(h => h.avgStrength.toFixed(2)), color: '#ed8936' },
                { name: 'Avg Intelligence', type: 'line', data: history.map(h => h.avgIntelligence.toFixed(2)), color: '#9f7aea' },
                { name: 'Avg Luck', type: 'line', data: history.map(h => h.avgLuck.toFixed(2)), color: '#48bb78' },
            ],
        };
    }, [history, effectsLegend]);
    
    return <Chart option={baseEffectsOption} onEvents={{ 'legendselectchanged': handleEffectsLegendChange }} />;
};
