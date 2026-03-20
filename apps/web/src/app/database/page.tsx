'use client';

import { useState, useMemo, useCallback } from 'react';
import {
  Search, Download, Database, Clock, AlertTriangle,
  ChevronDown, ChevronUp, BarChart3, X,
} from 'lucide-react';
import DateRangePicker from '@/components/DateRangePicker';

interface OutageRecord {
  id: string;
  service: string;
  status: 'major_outage' | 'partial_outage' | 'degraded';
  duration: string;
  durationMinutes: number;
  confidence: number;
  date: string;
  regions: string[];
  description: string;
}

const outages: OutageRecord[] = [
  { id: 'o-001', service: 'AWS', status: 'major_outage', duration: '2h 14m', durationMinutes: 134, confidence: 0.97, date: '2026-03-18', regions: ['us-east-1', 'eu-west-1'], description: 'S3 and Lambda services experienced elevated error rates and timeouts in affected regions.' },
  { id: 'o-002', service: 'GitHub', status: 'degraded', duration: '47m', durationMinutes: 47, confidence: 0.89, date: '2026-03-17', regions: ['global'], description: 'Git operations and API requests showed increased latency. Actions queuing was delayed.' },
  { id: 'o-003', service: 'Cloudflare', status: 'partial_outage', duration: '23m', durationMinutes: 23, confidence: 0.92, date: '2026-03-16', regions: ['asia-east', 'asia-southeast'], description: 'DNS resolution and CDN caching impacted in Asia-Pacific regions.' },
  { id: 'o-004', service: 'Stripe', status: 'degraded', duration: '18m', durationMinutes: 18, confidence: 0.85, date: '2026-03-15', regions: ['us-east-1'], description: 'Payment processing API experienced intermittent 500 errors.' },
  { id: 'o-005', service: 'Vercel', status: 'partial_outage', duration: '35m', durationMinutes: 35, confidence: 0.91, date: '2026-03-14', regions: ['us-east-1', 'us-west-2'], description: 'Deployment pipeline and edge function invocations were delayed.' },
  { id: 'o-006', service: 'Slack', status: 'major_outage', duration: '1h 52m', durationMinutes: 112, confidence: 0.96, date: '2026-03-13', regions: ['global'], description: 'Complete service disruption affecting messaging, file uploads, and API access.' },
  { id: 'o-007', service: 'Google Cloud', status: 'degraded', duration: '28m', durationMinutes: 28, confidence: 0.88, date: '2026-03-12', regions: ['us-central1'], description: 'Cloud Run and Cloud Functions experienced cold start delays and timeout errors.' },
  { id: 'o-008', service: 'Datadog', status: 'partial_outage', duration: '41m', durationMinutes: 41, confidence: 0.87, date: '2026-03-11', regions: ['us-east-1', 'eu-west-1'], description: 'Metric ingestion and dashboard rendering were delayed. Alerting was unaffected.' },
  { id: 'o-009', service: 'MongoDB Atlas', status: 'degraded', duration: '15m', durationMinutes: 15, confidence: 0.83, date: '2026-03-10', regions: ['us-east-1'], description: 'Increased query latency observed on shared tier clusters.' },
  { id: 'o-010', service: 'Azure', status: 'major_outage', duration: '3h 7m', durationMinutes: 187, confidence: 0.98, date: '2026-03-09', regions: ['eastus', 'eastus2', 'westeurope'], description: 'Azure Active Directory authentication failures caused widespread service disruptions.' },
  { id: 'o-011', service: 'PagerDuty', status: 'degraded', duration: '12m', durationMinutes: 12, confidence: 0.81, date: '2026-03-08', regions: ['us-east-1'], description: 'Webhook delivery delays for incident notifications.' },
  { id: 'o-012', service: 'Twilio', status: 'partial_outage', duration: '56m', durationMinutes: 56, confidence: 0.90, date: '2026-03-07', regions: ['us-east-1', 'eu-west-1'], description: 'SMS delivery delays and voice call connection failures.' },
];

const statusConfig: Record<string, { label: string; dotClass: string; bgClass: string }> = {
  major_outage: { label: 'Major Outage', dotClass: 'bg-red-500', bgClass: 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  partial_outage: { label: 'Partial Outage', dotClass: 'bg-yellow-500', bgClass: 'bg-yellow-50 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' },
  degraded: { label: 'Degraded', dotClass: 'bg-orange-500', bgClass: 'bg-orange-50 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' },
};

const severityOptions = ['major_outage', 'partial_outage', 'degraded'] as const;
const statusOptions = ['All', 'major_outage', 'partial_outage', 'degraded'] as const;

function formatDateISO(date: Date): string {
  return date.toISOString().split('T')[0];
}

export default function DatabasePage() {
  const [search, setSearch] = useState('');
  const [startDate, setStartDate] = useState(formatDateISO(new Date(Date.now() - 90 * 86400000)));
  const [endDate, setEndDate] = useState(formatDateISO(new Date()));
  const [severityFilter, setSeverityFilter] = useState<string>('All');
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [sortField, setSortField] = useState<'date' | 'duration'>('date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const filtered = useMemo(() => {
    let result = outages.filter((o) => {
      if (search && !o.service.toLowerCase().includes(search.toLowerCase())) return false;
      if (severityFilter !== 'All' && o.status !== severityFilter) return false;
      if (o.date < startDate || o.date > endDate) return false;
      return true;
    });

    result = [...result].sort((a, b) => {
      const mul = sortDir === 'asc' ? 1 : -1;
      if (sortField === 'date') return mul * a.date.localeCompare(b.date);
      return mul * (a.durationMinutes - b.durationMinutes);
    });

    return result;
  }, [search, severityFilter, startDate, endDate, sortField, sortDir]);

  const toggleSort = useCallback((field: 'date' | 'duration') => {
    if (sortField === field) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  }, [sortField]);

  const totalOutages = outages.length;
  const avgDuration = Math.round(outages.reduce((sum, o) => sum + o.durationMinutes, 0) / outages.length);
  const categoryCount: Record<string, number> = {};
  for (const o of outages) {
    categoryCount[o.service] = (categoryCount[o.service] || 0) + 1;
  }
  const mostAffected = Object.entries(categoryCount).sort((a, b) => b[1] - a[1])[0];

  const handleExport = useCallback((format: 'json' | 'csv') => {
    const params = new URLSearchParams({
      start: startDate,
      end: endDate,
      format,
    });
    if (search) params.set('search', search);
    if (severityFilter !== 'All') params.set('severity', severityFilter);
    window.open(`/api/v1/open/export?${params.toString()}`, '_blank');
  }, [startDate, endDate, search, severityFilter]);

  const SortIcon = sortDir === 'asc' ? ChevronUp : ChevronDown;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <section className="mb-8">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 dark:bg-indigo-900/30">
            <Database className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50">
              Public Outage Database
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Browse and search the complete history of recorded outages.
            </p>
          </div>
        </div>
      </section>

      {/* Stats Bar */}
      <section className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="card flex items-center gap-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-900/30">
            <BarChart3 className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-50">{totalOutages}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Total Outages Recorded</p>
          </div>
        </div>
        <div className="card flex items-center gap-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50 dark:bg-amber-900/30">
            <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-50">{avgDuration}m</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Avg Duration</p>
          </div>
        </div>
        <div className="card flex items-center gap-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-50 dark:bg-red-900/30">
            <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-50">
              {mostAffected ? mostAffected[0] : 'N/A'}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Most Affected Service</p>
          </div>
        </div>
      </section>

      {/* Filters */}
      <section className="card mb-6 space-y-4">
        <div className="flex flex-col gap-4 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by service name..."
              className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:placeholder:text-gray-500"
            />
          </div>
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
          >
            <option value="All">All Severities</option>
            {severityOptions.map((sev) => (
              <option key={sev} value={sev}>
                {statusConfig[sev]?.label ?? sev}
              </option>
            ))}
          </select>
        </div>
        <DateRangePicker
          startDate={startDate}
          endDate={endDate}
          onChange={(s, e) => { setStartDate(s); setEndDate(e); }}
        />
      </section>

      {/* Export Buttons */}
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {filtered.length} result{filtered.length !== 1 ? 's' : ''}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => handleExport('json')}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            <Download className="h-3.5 w-3.5" />
            JSON
          </button>
          <button
            type="button"
            onClick={() => handleExport('csv')}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            <Download className="h-3.5 w-3.5" />
            CSV
          </button>
        </div>
      </div>

      {/* Results Table */}
      <section className="card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/50">
                <th className="px-5 py-3 font-medium text-gray-500 dark:text-gray-400">Service</th>
                <th className="px-5 py-3 font-medium text-gray-500 dark:text-gray-400">Status</th>
                <th
                  className="cursor-pointer px-5 py-3 font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                  onClick={() => toggleSort('duration')}
                >
                  <span className="inline-flex items-center gap-1">
                    Duration
                    {sortField === 'duration' && <SortIcon className="h-3 w-3" />}
                  </span>
                </th>
                <th className="px-5 py-3 font-medium text-gray-500 dark:text-gray-400">Confidence</th>
                <th
                  className="cursor-pointer px-5 py-3 font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                  onClick={() => toggleSort('date')}
                >
                  <span className="inline-flex items-center gap-1">
                    Date
                    {sortField === 'date' && <SortIcon className="h-3 w-3" />}
                  </span>
                </th>
                <th className="px-5 py-3 font-medium text-gray-500 dark:text-gray-400">Regions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-gray-500 dark:text-gray-400">
                    No outages found matching your filters.
                  </td>
                </tr>
              ) : (
                filtered.map((outage) => {
                  const cfg = statusConfig[outage.status];
                  const isExpanded = expandedRow === outage.id;
                  return (
                    <>
                      <tr
                        key={outage.id}
                        onClick={() => setExpandedRow(isExpanded ? null : outage.id)}
                        className="cursor-pointer transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50"
                      >
                        <td className="px-5 py-3 font-medium text-gray-900 dark:text-gray-100">
                          {outage.service}
                        </td>
                        <td className="px-5 py-3">
                          <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${cfg?.bgClass}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${cfg?.dotClass}`} />
                            {cfg?.label}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-gray-700 dark:text-gray-300">{outage.duration}</td>
                        <td className="px-5 py-3 font-mono text-gray-700 dark:text-gray-300">
                          {(outage.confidence * 100).toFixed(0)}%
                        </td>
                        <td className="px-5 py-3 text-gray-700 dark:text-gray-300">{outage.date}</td>
                        <td className="px-5 py-3 text-gray-700 dark:text-gray-300">
                          {outage.regions.join(', ')}
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr key={`${outage.id}-detail`}>
                          <td colSpan={6} className="bg-gray-50 px-5 py-4 dark:bg-gray-800/30">
                            <div className="flex items-start justify-between gap-4">
                              <div>
                                <p className="mb-1 text-xs font-medium text-gray-500 dark:text-gray-400">
                                  Outage Details
                                </p>
                                <p className="text-sm text-gray-700 dark:text-gray-300">
                                  {outage.description}
                                </p>
                                <div className="mt-2 flex flex-wrap gap-1.5">
                                  {outage.regions.map((region) => (
                                    <span
                                      key={region}
                                      className="rounded-md bg-gray-200 px-2 py-0.5 text-xs text-gray-600 dark:bg-gray-700 dark:text-gray-400"
                                    >
                                      {region}
                                    </span>
                                  ))}
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); setExpandedRow(null); }}
                                className="rounded-md p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
