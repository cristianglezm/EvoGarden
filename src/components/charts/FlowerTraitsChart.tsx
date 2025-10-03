import React, { useMemo, useState } from 'react';
import type { EChartsOption } from 'echarts';
import type { AnalyticsDataPoint } from '../../types';
import { Chart } from '../Chart';
import { baseChartOptions, createLegendSelectHandler } from './chartOptions';

interface FlowerTraitsChartProps {
    history: AnalyticsDataPoint[];
}

export const FlowerTraitsChart: React.FC<FlowerTraitsChartProps> = ({ history }) => {
    const [traitsLegend, setTraitsLegend] = useState<Record<string, boolean>>({ 'Avg Health': true, 'Max Health': true, 'Avg Stamina': true, 'Max Stamina': true, 'Avg Maturation': true, 'Avg Nutrient Efficiency': true, 'Max Toxicity': true });
    const handleTraitsLegendChange = createLegendSelectHandler(setTraitsLegend);

    const flowerTraitsOption = useMemo<EChartsOption>(() => {
        const ticks = history.map(h => h.tick);
        return {
            ...baseChartOptions,
            title: { text: 'Flower Genetic Traits', left: 'center', textStyle: { color: '#bbf7d0', fontWeight: 'bold' }, top: 0 },
            legend: {
                data: ['Avg Health', 'Max Health', 'Avg Stamina', 'Max Stamina', 'Avg Maturation', 'Avg Nutrient Efficiency', 'Max Toxicity'],
                top: 35,
                textStyle: { color: '#bbf7d0' },
                selected: traitsLegend,
            },
            xAxis: { ...baseChartOptions.xAxis, data: ticks },
            yAxis: [
                {
                    ...(baseChartOptions.yAxis as object),
                    type: 'value', name: 'Health / Stamina / Ticks', position: 'left'
                },
                {
                    ...(baseChartOptions.yAxis as object),
                    type: 'value', name: 'Efficiency / Toxicity', position: 'right', min: 0,
                    axisLabel: { formatter: (value: number) => value.toFixed(2), color: '#bbf7d0' },
                    splitLine: { show: false }, // No grid lines for the right-side Y axis
                }
            ],
            series: [
                { name: 'Avg Health', type: 'line', yAxisIndex: 0, data: history.map(h => h.avgHealth.toFixed(2)), color: '#38b2ac' },
                { name: 'Max Health', type: 'line', yAxisIndex: 0, data: history.map(h => h.maxHealth), color: '#63b3ed' },
                { name: 'Avg Stamina', type: 'line', yAxisIndex: 0, data: history.map(h => h.avgStamina.toFixed(0)), color: '#4299e1' },
                { name: 'Max Stamina', type: 'line', yAxisIndex: 0, data: history.map(h => h.maxStamina), color: '#3182ce' },
                { name: 'Avg Maturation', type: 'line', yAxisIndex: 0, data: history.map(h => h.avgMaturationPeriod.toFixed(0)), color: '#d69e2e' },
                { name: 'Avg Nutrient Efficiency', type: 'line', yAxisIndex: 1, data: history.map(h => h.avgNutrientEfficiency.toFixed(2)), color: '#38a169' },
                { name: 'Max Toxicity', type: 'line', yAxisIndex: 1, data: history.map(h => h.maxToxicity.toFixed(2)), color: '#c05621' },
            ],
        };
    }, [history, traitsLegend]);

    return <Chart option={flowerTraitsOption} onEvents={{ 'legendselectchanged': handleTraitsLegendChange }} />;
};
