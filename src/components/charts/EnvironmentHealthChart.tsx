import React, { useMemo, useState } from 'react';
import type { EChartsOption } from 'echarts';
import type { AnalyticsDataPoint } from '../../types';
import { Chart } from '../Chart';
import { baseChartOptions, createLegendSelectHandler } from './chartOptions';

interface EnvironmentHealthChartProps {
    history: AnalyticsDataPoint[];
}

export const EnvironmentHealthChart: React.FC<EnvironmentHealthChartProps> = ({ history }) => {
    const [legend, setLegend] = useState<Record<string, boolean>>({
        'Total Flowers': true,
        'Healing Flowers': true,
        'Toxic Flowers': true,
        'Herbicide Planes': true,
        'Herbicide Smokes': true,
        'Corpses': true,
    });
    const handleLegendChange = createLegendSelectHandler(setLegend);

    const option = useMemo<EChartsOption>(() => {
        const ticks = history.map(h => h.tick);
        return {
            ...baseChartOptions,
            title: { text: 'Environment Health & Resources', left: 'center', textStyle: { color: '#bbf7d0', fontWeight: 'bold' }, top: 0 },
            legend: {
                data: ['Total Flowers', 'Healing Flowers', 'Toxic Flowers', 'Herbicide Planes', 'Herbicide Smokes', 'Corpses'],
                top: 35,
                textStyle: { color: '#bbf7d0' },
                selected: legend
            },
            xAxis: { ...baseChartOptions.xAxis, data: ticks },
            series: [
                { name: 'Total Flowers', type: 'line', data: history.map(h => h.flowers), color: '#48bb78' },
                { name: 'Healing Flowers', type: 'line', data: history.map(h => h.healingFlowerCount || 0), color: '#38a169', lineStyle: { type: 'dashed' } },
                { name: 'Toxic Flowers', type: 'line', data: history.map(h => h.toxicFlowerCount || 0), color: '#c05621', lineStyle: { type: 'dashed' } },
                { name: 'Herbicide Planes', type: 'line', data: history.map(h => h.herbicidePlanes || 0), color: '#cbd5e0' },
                { name: 'Herbicide Smokes', type: 'line', data: history.map(h => h.herbicideSmokes || 0), color: '#718096' },
                { name: 'Corpses', type: 'line', data: history.map(h => h.corpses || 0), color: '#a0aec0' },
            ],
        };
    }, [history, legend]);

    return <Chart option={option} onEvents={{ 'legendselectchanged': handleLegendChange }} />;
};
