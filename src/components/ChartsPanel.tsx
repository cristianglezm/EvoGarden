import React, { useMemo, useState } from 'react';
import { useAnalyticsStore } from '../stores/analyticsStore';
import { Chart } from './Chart';
import type { EChartsOption } from 'echarts';

const baseChartOptions: EChartsOption = {
    grid: { top: 120, left: '3%', right: '4%', bottom: '3%', containLabel: true },
    tooltip: { trigger: 'axis' },
    xAxis: { 
        type: 'category',
        axisLine: { lineStyle: { color: 'hsl(90, 50%, 70%)' } },
        splitLine: { show: false },
        axisLabel: { color: '#bbf7d0' },
    },
    yAxis: { 
        type: 'value',
        axisLine: { show: true, lineStyle: { color: 'hsl(90, 50%, 70%)' } },
        splitLine: { 
            lineStyle: { 
                color: 'hsl(120, 10%, 45%)',
                type: 'solid' 
            } 
        },
        axisLabel: { color: '#bbf7d0' },
    },
    legend: { data: [] },
    backgroundColor: 'transparent',
    textStyle: {
        fontFamily: 'sans-serif',
        color: '#bbf7d0' // primary-light
    }
};

const createLegendSelectHandler = (
    setter: React.Dispatch<React.SetStateAction<Record<string, boolean>>>
) => (params: { selected: Record<string, boolean> }) => {
    setter(params.selected);
};


export const ChartsPanel: React.FC = () => {
    const history = useAnalyticsStore(state => state.history);
    
    // State to hold legend visibility for each chart
    const [performanceLegend, setPerformanceLegend] = useState<Record<string, boolean>>({ 'Tick Time (Worker)': true, 'Render Time (UI)': true, 'Pending Requests': true });
    const [populationLegend, setPopulationLegend] = useState<Record<string, boolean>>({ 'Flowers': true, 'Insects': true, 'Birds': true, 'Eagles': true, 'Herbicide Planes': true, 'Herbicide Smokes': true, 'Eggs': true });
    const [eventsLegend, setEventsLegend] = useState<Record<string, boolean>>({ 'Reproductions': true, 'Insects Eaten': true, 'Eggs Laid': true, 'Insects Born': true, 'Eggs Eaten': true, 'Died of Old Age': true });
    const [traitsLegend, setTraitsLegend] = useState<Record<string, boolean>>({ 'Avg Health': true, 'Max Health': true, 'Avg Stamina': true, 'Max Stamina': true, 'Avg Maturation': true, 'Avg Nutrient Efficiency': true, 'Max Toxicity': true });
    const [effectsLegend, setEffectsLegend] = useState<Record<string, boolean>>({ 'Avg Vitality': true, 'Avg Agility': true, 'Avg Strength': true, 'Avg Intelligence': true, 'Avg Luck': true });
    const [environmentLegend, setEnvironmentLegend] = useState<Record<string, boolean>>({ 'Temperature (°C)': true, 'Humidity (%)': true });

    // Event handlers for legend changes
    const handlePerformanceLegendChange = createLegendSelectHandler(setPerformanceLegend);
    const handlePopulationLegendChange = createLegendSelectHandler(setPopulationLegend);
    const handleEventsLegendChange = createLegendSelectHandler(setEventsLegend);
    const handleTraitsLegendChange = createLegendSelectHandler(setTraitsLegend);
    const handleEffectsLegendChange = createLegendSelectHandler(setEffectsLegend);
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

    const populationOption = useMemo<EChartsOption>(() => {
        const ticks = history.map(h => h.tick);
        return {
            ...baseChartOptions,
            title: { text: 'Population Dynamics', left: 'center', textStyle: { color: '#bbf7d0', fontWeight: 'bold' }, top: 0 },
            legend: { data: ['Flowers', 'Insects', 'Birds', 'Eagles', 'Eggs', 'Herbicide Planes', 'Herbicide Smokes'], top: 35, textStyle: { color: '#bbf7d0' }, selected: populationLegend },
            xAxis: { ...baseChartOptions.xAxis, data: ticks },
            series: [
                { name: 'Flowers', type: 'line', data: history.map(h => h.flowers), color: '#48bb78' },
                { name: 'Insects', type: 'line', data: history.map(h => h.insects), color: '#4299e1' },
                { name: 'Birds', type: 'line', data: history.map(h => h.birds), color: '#f56565' },
                { name: 'Eagles', type: 'line', data: history.map(h => h.eagles), color: '#d69e2e' },
                { name: 'Eggs', type: 'line', data: history.map(h => h.eggCount), color: '#a0aec0' },
                { name: 'Herbicide Planes', type: 'line', data: history.map(h => h.herbicidePlanes || 0), color: '#cbd5e0' },
                { name: 'Herbicide Smokes', type: 'line', data: history.map(h => h.herbicideSmokes || 0), color: '#718096' },
            ],
        };
    }, [history, populationLegend]);

    const eventsOption = useMemo<EChartsOption>(() => {
        const ticks = history.map(h => h.tick);
        return {
            ...baseChartOptions,
            title: { text: 'Ecosystem Events', left: 'center', textStyle: { color: '#bbf7d0', fontWeight: 'bold' }, top: 0 },
            legend: { data: ['Reproductions', 'Insects Eaten', 'Eggs Laid', 'Insects Born', 'Eggs Eaten', 'Died of Old Age'], top: 35, textStyle: { color: '#bbf7d0' }, selected: eventsLegend },
            xAxis: { ...baseChartOptions.xAxis, data: ticks },
            series: [
                { name: 'Reproductions', type: 'line', data: history.map(h => h.reproductions), color: '#9f7aea' },
                { name: 'Insects Eaten', type: 'line', data: history.map(h => h.insectsEaten), color: '#ed8936' },
                { name: 'Eggs Eaten', type: 'line', data: history.map(h => h.eggsEaten), color: '#a0aec0' },
                { name: 'Eggs Laid', type: 'line', data: history.map(h => h.eggsLaid), color: '#ecc94b' },
                { name: 'Insects Born', type: 'line', data: history.map(h => h.insectsBorn), color: '#63b3ed' },
                { name: 'Died of Old Age', type: 'line', data: history.map(h => h.insectsDiedOfOldAge), color: '#f7fafc' },
            ],
        };
    }, [history, eventsLegend]);

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


    return (
        <div className="p-4 space-y-4">
            <div className="bg-chart-background border-2 border-chart-border rounded-lg p-2">
                <Chart option={environmentOption} onEvents={{ 'legendselectchanged': handleEnvironmentLegendChange }} />
            </div>
            <div className="bg-chart-background border-2 border-chart-border rounded-lg p-2">
                <Chart option={populationOption} onEvents={{ 'legendselectchanged': handlePopulationLegendChange }} />
            </div>
             <div className="bg-chart-background border-2 border-chart-border rounded-lg p-2">
                <Chart option={eventsOption} onEvents={{ 'legendselectchanged': handleEventsLegendChange }} />
            </div>
            <div className="bg-chart-background border-2 border-chart-border rounded-lg p-2">
                <Chart option={flowerTraitsOption} onEvents={{ 'legendselectchanged': handleTraitsLegendChange }} />
            </div>
            <div className="bg-chart-background border-2 border-chart-border rounded-lg p-2">
                <Chart option={baseEffectsOption} onEvents={{ 'legendselectchanged': handleEffectsLegendChange }} />
            </div>
             <div className="bg-chart-background border-2 border-chart-border rounded-lg p-2">
                <Chart option={performanceOption} onEvents={{ 'legendselectchanged': handlePerformanceLegendChange }} />
            </div>
        </div>
    );
};
