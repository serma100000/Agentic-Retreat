import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import Svg, { Path, Line, Circle, Text as SvgText } from 'react-native-svg';

interface DataPoint {
  hour: string;
  count: number;
}

interface ReportChartProps {
  data: DataPoint[];
  width?: number;
  height?: number;
  color?: string;
}

export function ReportChart({
  data,
  width: propWidth,
  height = 180,
  color = '#3B82F6',
}: ReportChartProps): React.JSX.Element {
  const screenWidth = Dimensions.get('window').width;
  const width = propWidth ?? screenWidth - 48;

  const paddingLeft = 36;
  const paddingRight = 12;
  const paddingTop = 16;
  const paddingBottom = 32;

  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;

  if (data.length === 0) {
    return (
      <View style={[styles.container, { width, height }]}>
        <Text style={styles.emptyText}>No report data available</Text>
      </View>
    );
  }

  const maxCount = Math.max(...data.map((d) => d.count), 1);
  const yTicks = calculateYTicks(maxCount);
  const yMax = yTicks[yTicks.length - 1];

  const points = data.map((d, i) => ({
    x: paddingLeft + (i / Math.max(data.length - 1, 1)) * chartWidth,
    y: paddingTop + chartHeight - (d.count / yMax) * chartHeight,
  }));

  const linePath = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
    .join(' ');

  const areaPath = `${linePath} L ${points[points.length - 1].x} ${paddingTop + chartHeight} L ${points[0].x} ${paddingTop + chartHeight} Z`;

  // Show every 6th hour label
  const xLabels = data.filter((_, i) => i % 6 === 0 || i === data.length - 1);
  const xLabelIndices = data
    .map((_, i) => i)
    .filter((i) => i % 6 === 0 || i === data.length - 1);

  return (
    <View style={[styles.container, { width, height }]}>
      <Svg width={width} height={height}>
        {/* Grid lines */}
        {yTicks.map((tick) => {
          const y =
            paddingTop + chartHeight - (tick / yMax) * chartHeight;
          return (
            <Line
              key={`grid-${tick}`}
              x1={paddingLeft}
              y1={y}
              x2={width - paddingRight}
              y2={y}
              stroke="#E5E7EB"
              strokeWidth={1}
              strokeDasharray="4,4"
            />
          );
        })}

        {/* Area fill */}
        <Path d={areaPath} fill={color} opacity={0.1} />

        {/* Line */}
        <Path
          d={linePath}
          stroke={color}
          strokeWidth={2}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Data points for non-zero values */}
        {points.map((p, i) => {
          if (data[i].count === 0) return null;
          return (
            <Circle
              key={`point-${i}`}
              cx={p.x}
              cy={p.y}
              r={3}
              fill={color}
              stroke="#FFFFFF"
              strokeWidth={1.5}
            />
          );
        })}

        {/* Y-axis labels */}
        {yTicks.map((tick) => {
          const y =
            paddingTop + chartHeight - (tick / yMax) * chartHeight;
          return (
            <SvgText
              key={`y-${tick}`}
              x={paddingLeft - 8}
              y={y + 4}
              textAnchor="end"
              fontSize={10}
              fill="#9CA3AF"
            >
              {tick}
            </SvgText>
          );
        })}

        {/* X-axis labels */}
        {xLabelIndices.map((idx) => {
          const x =
            paddingLeft + (idx / Math.max(data.length - 1, 1)) * chartWidth;
          const label = formatHourLabel(data[idx].hour);
          return (
            <SvgText
              key={`x-${idx}`}
              x={x}
              y={height - 6}
              textAnchor="middle"
              fontSize={10}
              fill="#9CA3AF"
            >
              {label}
            </SvgText>
          );
        })}
      </Svg>
    </View>
  );
}

function calculateYTicks(maxValue: number): number[] {
  if (maxValue <= 5) return [0, 1, 2, 3, 4, 5];
  if (maxValue <= 10) return [0, 2, 4, 6, 8, 10];
  const step = Math.ceil(maxValue / 5);
  const ticks: number[] = [];
  for (let i = 0; i <= maxValue + step; i += step) {
    ticks.push(i);
    if (ticks.length >= 6) break;
  }
  return ticks;
}

function formatHourLabel(hour: string): string {
  try {
    const date = new Date(hour);
    return `${date.getHours()}:00`;
  } catch {
    return hour;
  }
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
  },
  emptyText: {
    textAlign: 'center',
    color: '#9CA3AF',
    marginTop: 60,
    fontSize: 14,
  },
});
