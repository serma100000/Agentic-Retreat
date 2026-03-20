'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Filler,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  type ChartData,
  type ChartOptions,
} from 'chart.js';
import { Bar, Line, Pie } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Filler,
  Title,
  Tooltip,
  Legend,
  ArcElement,
);

export interface TrendDataset {
  readonly label: string;
  readonly data: readonly number[];
  readonly color?: string;
}

interface TrendChartProps {
  readonly data: readonly TrendDataset[];
  readonly type: 'bar' | 'line' | 'area' | 'pie';
  readonly labels: readonly string[];
  readonly title?: string;
  readonly height?: number;
}

const defaultColors = [
  '#3b82f6',
  '#ef4444',
  '#22c55e',
  '#f59e0b',
  '#8b5cf6',
  '#ec4899',
  '#06b6d4',
  '#f97316',
];

function useDarkMode(): boolean {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    function check() {
      setIsDark(document.documentElement.classList.contains('dark'));
    }
    check();
    const observer = new MutationObserver(check);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });
    return () => observer.disconnect();
  }, []);

  return isDark;
}

export default function TrendChart({
  data,
  type,
  labels,
  title,
  height = 300,
}: TrendChartProps) {
  const isDark = useDarkMode();

  const textColor = isDark ? '#9ca3af' : '#6b7280';
  const gridColor = isDark ? 'rgba(75, 85, 99, 0.3)' : 'rgba(229, 231, 235, 0.8)';

  const datasets = data.map((ds, i) => {
    const color = ds.color ?? defaultColors[i % defaultColors.length];

    if (type === 'pie') {
      return {
        label: ds.label,
        data: [...ds.data],
        backgroundColor: ds.data.map((_, j) => defaultColors[j % defaultColors.length]),
        borderColor: isDark ? '#1f2937' : '#ffffff',
        borderWidth: 2,
      };
    }

    return {
      label: ds.label,
      data: [...ds.data],
      backgroundColor:
        type === 'area'
          ? color + '33'
          : color,
      borderColor: color,
      borderWidth: type === 'bar' ? 0 : 2,
      fill: type === 'area',
      tension: 0.3,
      pointRadius: type === 'line' || type === 'area' ? 3 : 0,
      pointHoverRadius: 5,
      borderRadius: type === 'bar' ? 4 : 0,
    };
  });

  const chartData: ChartData<'bar' | 'line' | 'pie'> = {
    labels: [...labels],
    datasets: datasets as ChartData<'bar' | 'line' | 'pie'>['datasets'],
  };

  const options: ChartOptions<'bar' | 'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: data.length > 1 || type === 'pie',
        position: 'top' as const,
        labels: {
          color: textColor,
          usePointStyle: true,
          padding: 16,
        },
      },
      title: {
        display: !!title,
        text: title ?? '',
        color: isDark ? '#f3f4f6' : '#111827',
        font: { size: 14, weight: 'bold' as const },
        padding: { bottom: 16 },
      },
      tooltip: {
        backgroundColor: isDark ? '#374151' : '#ffffff',
        titleColor: isDark ? '#f3f4f6' : '#111827',
        bodyColor: isDark ? '#d1d5db' : '#4b5563',
        borderColor: isDark ? '#4b5563' : '#e5e7eb',
        borderWidth: 1,
        cornerRadius: 8,
        padding: 12,
      },
    },
    scales:
      type === 'pie'
        ? undefined
        : {
            x: {
              ticks: { color: textColor },
              grid: { color: gridColor },
            },
            y: {
              ticks: { color: textColor },
              grid: { color: gridColor },
              beginAtZero: true,
            },
          },
  };

  const pieOptions: ChartOptions<'pie'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'right' as const,
        labels: {
          color: textColor,
          usePointStyle: true,
          padding: 12,
        },
      },
      title: {
        display: !!title,
        text: title ?? '',
        color: isDark ? '#f3f4f6' : '#111827',
        font: { size: 14, weight: 'bold' as const },
        padding: { bottom: 16 },
      },
      tooltip: {
        backgroundColor: isDark ? '#374151' : '#ffffff',
        titleColor: isDark ? '#f3f4f6' : '#111827',
        bodyColor: isDark ? '#d1d5db' : '#4b5563',
        borderColor: isDark ? '#4b5563' : '#e5e7eb',
        borderWidth: 1,
        cornerRadius: 8,
        padding: 12,
      },
    },
  };

  if (type === 'pie') {
    return (
      <div style={{ height }}>
        <Pie data={chartData as ChartData<'pie'>} options={pieOptions} />
      </div>
    );
  }

  if (type === 'bar') {
    return (
      <div style={{ height }}>
        <Bar data={chartData as ChartData<'bar'>} options={options as ChartOptions<'bar'>} />
      </div>
    );
  }

  return (
    <div style={{ height }}>
      <Line data={chartData as ChartData<'line'>} options={options as ChartOptions<'line'>} />
    </div>
  );
}
