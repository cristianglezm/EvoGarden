import type { EChartsOption } from 'echarts';
import React from 'react';

export const baseChartOptions: EChartsOption = {
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

export const createLegendSelectHandler = (
    setter: React.Dispatch<React.SetStateAction<Record<string, boolean>>>
) => (params: { selected: Record<string, boolean> }) => {
    setter(params.selected);
};
