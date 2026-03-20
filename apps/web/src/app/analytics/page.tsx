'use client';

import { useState } from 'react';
import {
  BarChart3,
  TrendingUp,
  Layers,
  Search,
  Clock,
  AlertTriangle,
  ArrowUpRight,
  Activity,
  Server,
} from 'lucide-react';
import Link from 'next/link';
/* eslint-disable @typescript-eslint/no-explicit-any */
import { cn } from '@/lib/utils';
import TrendChart from '@/components/TrendChart';

type Tab = 'overview' | 'services' | 'categories' | 'trends';

const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'overview', label: 'Overview', icon: BarChart3 },
  { id: 'services', label: 'Services', icon: Server },
  { id: 'categories', label: 'Categories', icon: Layers },
  { id: 'trends', label: 'Trends', icon: TrendingUp },
];

// --- Mock Data ---

const statsCards = [
  { label: 'Total Outages (This Month)', value: '47', icon: AlertTriangle, color: 'red' },
  { label: 'Avg MTTR', value: '2h 14m', icon: Clock, color: 'blue' },
  { label: 'Avg MTTD', value: '8m 32s', icon: Activity, color: 'purple' },
  { label: 'Platform Uptime', value: '99.94%', icon: ArrowUpRight, color: 'green' },
];

const monthlyOutageData = {
  labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  data: [32, 28, 45, 38, 41, 52, 35, 29, 47, 33, 39, 47],
};

const topServices = [
  { rank: 1, name: 'AWS', slug: 'aws', outages: 12, avgDuration: '1h 45m', lastOutage: '2 days ago' },
  { rank: 2, name: 'Google Cloud', slug: 'google-cloud', outages: 9, avgDuration: '2h 10m', lastOutage: '5 days ago' },
  { rank: 3, name: 'Microsoft Azure', slug: 'microsoft-azure', outages: 8, avgDuration: '3h 20m', lastOutage: '1 day ago' },
  { rank: 4, name: 'Cloudflare', slug: 'cloudflare', outages: 7, avgDuration: '45m', lastOutage: '1 week ago' },
  { rank: 5, name: 'GitHub', slug: 'github', outages: 6, avgDuration: '1h 05m', lastOutage: '3 days ago' },
  { rank: 6, name: 'Stripe', slug: 'stripe', outages: 5, avgDuration: '30m', lastOutage: '2 weeks ago' },
  { rank: 7, name: 'Vercel', slug: 'vercel', outages: 4, avgDuration: '55m', lastOutage: '4 days ago' },
  { rank: 8, name: 'Datadog', slug: 'datadog', outages: 4, avgDuration: '1h 20m', lastOutage: '6 days ago' },
  { rank: 9, name: 'PagerDuty', slug: 'pagerduty', outages: 3, avgDuration: '25m', lastOutage: '10 days ago' },
  { rank: 10, name: 'Twilio', slug: 'twilio', outages: 3, avgDuration: '50m', lastOutage: '8 days ago' },
];

const allServices = [
  { name: 'AWS', slug: 'aws', category: 'Cloud', status: 'operational' },
  { name: 'Google Cloud', slug: 'google-cloud', category: 'Cloud', status: 'operational' },
  { name: 'Microsoft Azure', slug: 'microsoft-azure', category: 'Cloud', status: 'degraded' },
  { name: 'Cloudflare', slug: 'cloudflare', category: 'CDN', status: 'operational' },
  { name: 'GitHub', slug: 'github', category: 'DevTools', status: 'operational' },
  { name: 'Stripe', slug: 'stripe', category: 'Payments', status: 'operational' },
  { name: 'Vercel', slug: 'vercel', category: 'Cloud', status: 'operational' },
  { name: 'Datadog', slug: 'datadog', category: 'Monitoring', status: 'operational' },
  { name: 'PagerDuty', slug: 'pagerduty', category: 'Monitoring', status: 'operational' },
  { name: 'Twilio', slug: 'twilio', category: 'Communications', status: 'operational' },
  { name: 'Slack', slug: 'slack', category: 'Messaging', status: 'operational' },
  { name: 'Discord', slug: 'discord', category: 'Messaging', status: 'operational' },
  { name: 'Fastly', slug: 'fastly', category: 'CDN', status: 'operational' },
  { name: 'SendGrid', slug: 'sendgrid', category: 'Email', status: 'operational' },
  { name: 'Okta', slug: 'okta', category: 'Identity', status: 'operational' },
];

const categories = [
  { name: 'Cloud', count: 18, avgDuration: '2h 15m', services: 3 },
  { name: 'CDN', count: 9, avgDuration: '45m', services: 2 },
  { name: 'DevTools', count: 7, avgDuration: '1h 05m', services: 1 },
  { name: 'Payments', count: 5, avgDuration: '30m', services: 1 },
  { name: 'Monitoring', count: 7, avgDuration: '1h 10m', services: 2 },
  { name: 'Communications', count: 4, avgDuration: '50m', services: 1 },
  { name: 'Messaging', count: 6, avgDuration: '35m', services: 2 },
  { name: 'Email', count: 3, avgDuration: '40m', services: 1 },
  { name: 'Identity', count: 2, avgDuration: '1h 30m', services: 1 },
];

const severityBreakdown = {
  labels: ['Critical', 'Major', 'Minor', 'Informational'],
  data: [12, 18, 24, 8],
};

const quarterlyTrend = {
  labels: ['Q1 2025', 'Q2 2025', 'Q3 2025', 'Q4 2025', 'Q1 2026'],
  data: [105, 131, 116, 119, 47],
};

const colorMap: Record<string, string> = {
  red: 'bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400',
  blue: 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
  purple: 'bg-purple-50 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400',
  green: 'bg-green-50 text-green-600 dark:bg-green-900/30 dark:text-green-400',
};

export default function AnalyticsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [serviceSearch, setServiceSearch] = useState('');

  const filteredServices = allServices.filter(
    (s) =>
      s.name.toLowerCase().includes(serviceSearch.toLowerCase()) ||
      s.category.toLowerCase().includes(serviceSearch.toLowerCase()),
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Page Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-50">
          Analytics
        </h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          Platform-wide outage insights, service reliability metrics, and trend analysis.
        </p>
      </div>

      {/* Tab Navigation */}
      <div className="mb-8 border-b border-gray-200 dark:border-gray-700">
        <nav className="-mb-px flex gap-1" aria-label="Tabs">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'inline-flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors',
                  activeTab === tab.id
                    ? 'border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400'
                    : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:border-gray-600 dark:hover:text-gray-300',
                )}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="space-y-8">
          {/* Stats Cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {statsCards.map((stat) => {
              const Icon = stat.icon;
              return (
                <div key={stat.label} className="card">
                  <div className="flex items-center gap-4">
                    <div
                      className={cn(
                        'flex h-10 w-10 items-center justify-center rounded-lg',
                        colorMap[stat.color],
                      )}
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-gray-900 dark:text-gray-50">
                        {stat.value}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{stat.label}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Monthly Outage Trend */}
          <div className="card">
            <h3 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-50">
              Monthly Outage Trend
            </h3>
            <TrendChart
              type="bar"
              labels={monthlyOutageData.labels}
              data={[{ label: 'Outages', data: monthlyOutageData.data, color: '#3b82f6' }]}
              height={320}
            />
          </div>

          {/* Top 10 Most Affected Services */}
          <div className="card overflow-hidden">
            <h3 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-50">
              Top 10 Most Affected Services
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="pb-3 pr-4 font-medium text-gray-500 dark:text-gray-400">#</th>
                    <th className="pb-3 pr-4 font-medium text-gray-500 dark:text-gray-400">Service</th>
                    <th className="pb-3 pr-4 font-medium text-gray-500 dark:text-gray-400">Outages</th>
                    <th className="pb-3 pr-4 font-medium text-gray-500 dark:text-gray-400">Avg Duration</th>
                    <th className="pb-3 font-medium text-gray-500 dark:text-gray-400">Last Outage</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {topServices.map((svc) => (
                    <tr key={svc.slug} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                      <td className="py-3 pr-4 text-gray-400">{svc.rank}</td>
                      <td className="py-3 pr-4">
                        <Link
                          href={`/analytics/services/${svc.slug}` as any}
                          className="font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                        >
                          {svc.name}
                        </Link>
                      </td>
                      <td className="py-3 pr-4 font-medium text-gray-900 dark:text-gray-100">
                        {svc.outages}
                      </td>
                      <td className="py-3 pr-4 text-gray-600 dark:text-gray-400">{svc.avgDuration}</td>
                      <td className="py-3 text-gray-500 dark:text-gray-400">{svc.lastOutage}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Services Tab */}
      {activeTab === 'services' && (
        <div className="space-y-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search services by name or category..."
              value={serviceSearch}
              onChange={(e) => setServiceSearch(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white py-2.5 pl-10 pr-4 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filteredServices.map((service) => (
              <Link
                key={service.slug}
                href={`/analytics/services/${service.slug}` as any}
                className="card group flex items-center gap-4 transition-all hover:border-blue-300 dark:hover:border-blue-600"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-500 group-hover:bg-blue-50 group-hover:text-blue-600 dark:bg-gray-700 dark:text-gray-400 dark:group-hover:bg-blue-900/30 dark:group-hover:text-blue-400">
                  <Server className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
                    {service.name}
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{service.category}</p>
                </div>
                <div
                  className={cn(
                    'h-2.5 w-2.5 rounded-full',
                    service.status === 'operational'
                      ? 'bg-green-500'
                      : service.status === 'degraded'
                        ? 'bg-yellow-500'
                        : 'bg-red-500',
                  )}
                />
              </Link>
            ))}
          </div>

          {filteredServices.length === 0 && (
            <div className="rounded-lg border-2 border-dashed border-gray-200 p-8 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
              No services match your search.
            </div>
          )}
        </div>
      )}

      {/* Categories Tab */}
      {activeTab === 'categories' && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((cat) => (
            <div key={cat.name} className="card">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-50">
                  {cat.name}
                </h3>
                <span className="badge bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300">
                  {cat.services} {cat.services === 1 ? 'service' : 'services'}
                </span>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500 dark:text-gray-400">Total Outages</span>
                  <span className="font-semibold text-gray-900 dark:text-gray-100">{cat.count}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500 dark:text-gray-400">Avg Duration</span>
                  <span className="font-semibold text-gray-900 dark:text-gray-100">
                    {cat.avgDuration}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Trends Tab */}
      {activeTab === 'trends' && (
        <div className="space-y-8">
          <div className="card">
            <h3 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-50">
              Quarterly Outage Trend
            </h3>
            <TrendChart
              type="line"
              labels={quarterlyTrend.labels}
              data={[{ label: 'Total Outages', data: quarterlyTrend.data, color: '#8b5cf6' }]}
              height={320}
            />
          </div>

          <div className="card">
            <h3 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-50">
              Severity Breakdown
            </h3>
            <TrendChart
              type="pie"
              labels={severityBreakdown.labels}
              data={[{ label: 'Severity', data: severityBreakdown.data }]}
              height={320}
            />
          </div>

          <div className="card">
            <h3 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-50">
              Monthly Trend (Current Year)
            </h3>
            <TrendChart
              type="area"
              labels={monthlyOutageData.labels}
              data={[
                { label: 'Outages', data: monthlyOutageData.data, color: '#06b6d4' },
              ]}
              height={320}
            />
          </div>
        </div>
      )}
    </div>
  );
}
