import React from 'react';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';

interface ChartProps {
  option: EChartsOption;
  style?: React.CSSProperties;
}

export const Chart: React.FC<ChartProps> = ({ option, style }) => {
  return (
    <ReactECharts
      option={option}
      notMerge={true}
      lazyUpdate={true}
      theme="dark"
      style={{ height: '300px', width: '100%', ...style }}
    />
  );
};
