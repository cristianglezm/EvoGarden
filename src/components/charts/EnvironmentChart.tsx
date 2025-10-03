import React, { useMemo, useState } from 'react';
import type { EChartsOption } from 'echarts';
import type { AnalyticsDataPoint } from '../../types';
import { Chart } from '../Chart';
import { baseChartOptions, createLegendSelectHandler } from './chartOptions';

interface EnvironmentChartProps {
    history: AnalyticsDataPoint[];
}

export const EnvironmentChart: React.FC<EnvironmentChartProps> = ({ history }) => {
    const [environmentLegend, setEnvironmentLegend] = useState<Record<string, boolean>>({ 'Temperature (°C)': true, 'Humidity (%)': true });
    const handleEnvironmentLegendChange = createLegendSelectHandler(setEnvironmentLegend);

    const environmentOption = useMemo<EChartsOption>(() => {
        const ticks = history.map(h => h.tick);
        return {
            ...baseChartOptions,
            title: { text: 'Environment', left: 'center', textStyle: { color: '#bbf7d0', fontWeight: 'bold' }, top: 0 },
            legend: { data: ['Temperature (°C)', 'Humidity (%)'], top: 35, textStyle: { color: '#bbf7d0' }, selected: environmentLegend },
            xAxis: { ...baseChartOptions.xAxis, data: ticks },
            yAxis: [
                {
                    ...(baseChartOptions.yAxis as object),
                    type: 'value', name: '°C', position: 'left'
                },
                {
                    ...(baseChartOptions.yAxis as object),
                    type: 'value', name: '%', position: 'right', min: 0, max: 100,
                    splitLine: { show: false },
                }
            ],
            series: [
                { name: 'Temperature (°C)', type: 'line', yAxisIndex: 0, data: history.map(h => h.currentTemperature?.toFixed(1)), color: '#f56565' },
                { name: 'Humidity (%)', type: 'line', yAxisIndex: 1, data: history.map(h => ((h.currentHumidity ?? 0) * 100).toFixed(0)), color: '#4299e1' },
            ],
        };
    }, [history, environmentLegend]);
    
    return <Chart option={environmentOption} onEvents={{ 'legendselectchanged': handleEnvironmentLegendChange }} />;
};
