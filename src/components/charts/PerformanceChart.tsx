import React, { useMemo, useState } from 'react';
import type { EChartsOption } from 'echarts';
import type { AnalyticsDataPoint } from '../../types';
import { Chart } from '../Chart';
import { baseChartOptions, createLegendSelectHandler } from './chartOptions';

interface PerformanceChartProps {
    history: AnalyticsDataPoint[];
}

export const PerformanceChart: React.FC<PerformanceChartProps> = ({ history }) => {
    const [performanceLegend, setPerformanceLegend] = useState<Record<string, boolean>>({ 'Tick Time (Worker)': true, 'Render Time (UI)': true, 'Pending Requests': true });
    const handlePerformanceLegendChange = createLegendSelectHandler(setPerformanceLegend);

    const performanceOption = useMemo<EChartsOption>(() => {
        const ticks = history.map(h => h.tick);
        return {
            ...baseChartOptions,
            title: { text: 'Performance & Workload', left: 'center', textStyle: { color: '#bbf7d0', fontWeight: 'bold' }, top: 0 },
            legend: { data: ['Tick Time (Worker)', 'Render Time (UI)', 'Pending Requests'], top: 35, textStyle: { color: '#bbf7d0' }, selected: performanceLegend },
            xAxis: { ...baseChartOptions.xAxis, data: ticks },
            yAxis: [
                {
                    ...(baseChartOptions.yAxis as object),
                    type: 'value',
                    name: 'Milliseconds',
                    position: 'left',
                },
                {
                    ...(baseChartOptions.yAxis as object),
                    type: 'value',
                    name: 'Count',
                    position: 'right',
                    splitLine: { show: false },
                },
            ],
            series: [
                { name: 'Tick Time (Worker)', type: 'line', yAxisIndex: 0, data: history.map(h => h.tickTimeMs.toFixed(2)), color: '#38b2ac' },
                { name: 'Render Time (UI)', type: 'line', yAxisIndex: 0, data: history.map(h => h.renderTimeMs.toFixed(2)), color: '#ed8936' },
                { name: 'Pending Requests', type: 'line', yAxisIndex: 1, data: history.map(h => h.pendingFlowerRequests), color: '#ed64a6' },
            ],
        };
    }, [history, performanceLegend]);

    return <Chart option={performanceOption} onEvents={{ 'legendselectchanged': handlePerformanceLegendChange }} />;
};
