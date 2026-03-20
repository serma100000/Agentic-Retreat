'use client';

import { useEffect, useRef } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Filler,
  type ChartOptions,
} from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Filler);

interface ReportChartProps {
  readonly data: readonly { readonly timestamp: string; readonly count: number }[];
  readonly serviceName: string;
}

export default function ReportChart({ data, serviceName }: ReportChartProps) {
  const chartRef = useRef<ChartJS<'line'>>(null);

  useEffect(() => {
    return () => {
      if (chartRef.current) {
        chartRef.current.destroy();
      }
    };
  }, []);

  const labels = data.map((point) => {
    const date = new Date(point.timestamp);
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  });

  const counts = data.map((point) => point.count);

  const chartData = {
    labels,
    datasets: [
      {
        label: 'Reports',
        data: counts,
        borderColor: 'rgb(59, 130, 246)',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        borderWidth: 2,
        pointRadius: 3,
        pointHoverRadius: 5,
        pointBackgroundColor: 'rgb(59, 130, 246)',
        tension: 0.3,
        fill: true,
      },
    ],
  };

  const options: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      intersect: false,
      mode: 'index',
    },
    plugins: {
      title: {
        display: true,
        text: `${serviceName} - Reports (24h)`,
        font: { size: 14, weight: 'normal' },
        color: '#6b7280',
        padding: { bottom: 16 },
      },
      tooltip: {
        backgroundColor: 'rgba(17, 24, 39, 0.9)',
        titleColor: '#f3f4f6',
        bodyColor: '#d1d5db',
        borderColor: 'rgba(75, 85, 99, 0.3)',
        borderWidth: 1,
        padding: 10,
        cornerRadius: 8,
        displayColors: false,
        callbacks: {
          label: (context) => `${context.parsed.y} reports`,
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: {
          color: '#9ca3af',
          maxTicksLimit: 12,
          font: { size: 11 },
        },
        border: { display: false },
      },
      y: {
        beginAtZero: true,
        grid: {
          color: 'rgba(156, 163, 175, 0.15)',
        },
        ticks: {
          color: '#9ca3af',
          stepSize: 1,
          font: { size: 11 },
        },
        border: { display: false },
      },
    },
  };

  return (
    <div className="card">
      <div className="h-72">
        <Line ref={chartRef} data={chartData} options={options} />
      </div>
    </div>
  );
}
