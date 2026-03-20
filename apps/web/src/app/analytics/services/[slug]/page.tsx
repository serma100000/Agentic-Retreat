'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
/* eslint-disable @typescript-eslint/no-explicit-any */
import { ArrowLeft, Clock, AlertTriangle, TrendingUp, Zap } from 'lucide-react';
import UptimeGauge from '@/components/UptimeGauge';
import TrendChart from '@/components/TrendChart';
import CorrelationGraph from '@/components/CorrelationGraph';

// --- Mock Data Factory ---

function getServiceData(slug: string) {
  const name = slug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

  return {
    name,
    slug,
    reliabilityScore: 94.7,
    uptimePercent: 99.92,
    uptimeTarget: 99.9,
    mttr: { avg: '2h 14m', p50: '1h 32m', p95: '6h 45m' },
    mttd: { avg: '8m 32s', p50: '5m 10s', p95: '22m 18s' },
    outageHistory: [
      { month: 'Apr 2025', count: 2, severity: 'minor' },
      { month: 'May 2025', count: 1, severity: 'major' },
      { month: 'Jun 2025', count: 3, severity: 'minor' },
      { month: 'Jul 2025', count: 0, severity: 'none' },
      { month: 'Aug 2025', count: 1, severity: 'minor' },
      { month: 'Sep 2025', count: 2, severity: 'minor' },
      { month: 'Oct 2025', count: 0, severity: 'none' },
      { month: 'Nov 2025', count: 1, severity: 'major' },
      { month: 'Dec 2025', count: 2, severity: 'minor' },
      { month: 'Jan 2026', count: 1, severity: 'minor' },
      { month: 'Feb 2026', count: 0, severity: 'none' },
      { month: 'Mar 2026', count: 1, severity: 'minor' },
    ],
    monthlyUptime: {
      labels: ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'],
      data: [99.95, 99.82, 99.89, 100, 99.97, 99.91, 100, 99.78, 99.93, 99.96, 100, 99.92],
    },
    correlations: [
      { serviceA: slug, serviceB: 'cloudflare', score: 0.82, coOccurrences: 7 },
      { serviceA: slug, serviceB: 'github', score: 0.65, coOccurrences: 4 },
      { serviceA: slug, serviceB: 'datadog', score: 0.48, coOccurrences: 3 },
      { serviceA: slug, serviceB: 'vercel', score: 0.71, coOccurrences: 5 },
    ],
  };
}

const severityColors: Record<string, string> = {
  none: 'bg-gray-100 dark:bg-gray-800',
  minor: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  major: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  critical: 'bg-red-200 text-red-900 dark:bg-red-900/50 dark:text-red-300',
};

export default function ServiceAnalyticsPage() {
  const params = useParams();
  const slug = typeof params.slug === 'string' ? params.slug : '';
  const data = getServiceData(slug);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Back Link */}
      <Link
        href={"/analytics" as any}
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-gray-500 transition-colors hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Analytics
      </Link>

      {/* Service Header */}
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-50">
            {data.name}
          </h1>
          <p className="mt-1 text-gray-600 dark:text-gray-400">
            Service reliability analytics and outage history
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500 dark:text-gray-400">Reliability Score</span>
          <span className="rounded-full bg-blue-50 px-4 py-1.5 text-lg font-bold text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
            {data.reliabilityScore}
          </span>
        </div>
      </div>

      {/* Uptime Gauge + MTTR/MTTD */}
      <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Uptime Gauge */}
        <div className="card flex flex-col items-center justify-center">
          <h3 className="mb-4 text-sm font-medium text-gray-500 dark:text-gray-400">
            Current Uptime
          </h3>
          <div className="relative">
            <UptimeGauge
              value={data.uptimePercent}
              target={data.uptimeTarget}
              size={180}
            />
          </div>
        </div>

        {/* MTTR Stats */}
        <div className="card">
          <div className="mb-4 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-900/30">
              <Clock className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            </div>
            <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">
              Mean Time to Recovery (MTTR)
            </h3>
          </div>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500 dark:text-gray-400">Average</span>
              <span className="text-lg font-bold text-gray-900 dark:text-gray-100">{data.mttr.avg}</span>
            </div>
            <div className="h-px bg-gray-100 dark:bg-gray-700" />
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500 dark:text-gray-400">P50 (Median)</span>
              <span className="font-semibold text-gray-700 dark:text-gray-300">{data.mttr.p50}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500 dark:text-gray-400">P95</span>
              <span className="font-semibold text-gray-700 dark:text-gray-300">{data.mttr.p95}</span>
            </div>
          </div>
        </div>

        {/* MTTD Stats */}
        <div className="card">
          <div className="mb-4 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-50 dark:bg-purple-900/30">
              <Zap className="h-4 w-4 text-purple-600 dark:text-purple-400" />
            </div>
            <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">
              Mean Time to Detection (MTTD)
            </h3>
          </div>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500 dark:text-gray-400">Average</span>
              <span className="text-lg font-bold text-gray-900 dark:text-gray-100">{data.mttd.avg}</span>
            </div>
            <div className="h-px bg-gray-100 dark:bg-gray-700" />
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500 dark:text-gray-400">P50 (Median)</span>
              <span className="font-semibold text-gray-700 dark:text-gray-300">{data.mttd.p50}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500 dark:text-gray-400">P95</span>
              <span className="font-semibold text-gray-700 dark:text-gray-300">{data.mttd.p95}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Outage History Timeline */}
      <div className="card mb-8">
        <div className="mb-4 flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-gray-500 dark:text-gray-400" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-50">
            Outage History (Last 12 Months)
          </h3>
        </div>
        <div className="overflow-x-auto">
          <div className="flex gap-2 pb-2">
            {data.outageHistory.map((month) => (
              <div
                key={month.month}
                className="flex min-w-[80px] flex-col items-center gap-2 rounded-lg border border-gray-100 p-3 dark:border-gray-700"
              >
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                  {month.month.slice(0, 3)} {month.month.slice(-4)}
                </span>
                <span className="text-xl font-bold text-gray-900 dark:text-gray-100">
                  {month.count}
                </span>
                {month.count > 0 && (
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      severityColors[month.severity] ?? ''
                    }`}
                  >
                    {month.severity}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Monthly Uptime Chart */}
      <div className="card mb-8">
        <div className="mb-4 flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-gray-500 dark:text-gray-400" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-50">
            Monthly Uptime
          </h3>
        </div>
        <TrendChart
          type="line"
          labels={data.monthlyUptime.labels}
          data={[
            {
              label: 'Uptime %',
              data: data.monthlyUptime.data,
              color: '#22c55e',
            },
          ]}
          height={300}
        />
      </div>

      {/* Correlated Services */}
      <div className="card">
        <h3 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-50">
          Correlated Services
        </h3>
        <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
          Services that frequently experience outages at the same time. Click a node to view its analytics.
        </p>
        <CorrelationGraph
          serviceSlug={slug}
          correlations={data.correlations}
        />
      </div>
    </div>
  );
}
