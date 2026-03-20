'use client';

import { useState } from 'react';
import Link from 'next/link';
/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  ArrowLeft,
  Plus,
  CheckCircle2,
  XCircle,
  Target,
  AlertTriangle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import ComplianceTimeline from '@/components/ComplianceTimeline';
import TrendChart from '@/components/TrendChart';

interface SlaTarget {
  id: string;
  serviceName: string;
  serviceSlug: string;
  target: number;
  currentUptime: number;
  met: boolean;
  window: string;
  complianceHistory: {
    month: string;
    uptime: number;
    target: number;
    met: boolean;
  }[];
  violations: {
    date: string;
    duration: string;
    impact: string;
  }[];
  errorBudgetUsed: number;
  errorBudgetTotal: number;
}

const initialSlas: SlaTarget[] = [
  {
    id: '1',
    serviceName: 'API Gateway',
    serviceSlug: 'api-gateway',
    target: 99.95,
    currentUptime: 99.97,
    met: true,
    window: '30 days',
    complianceHistory: [
      { month: 'Oct 2025', uptime: 99.98, target: 99.95, met: true },
      { month: 'Nov 2025', uptime: 99.92, target: 99.95, met: false },
      { month: 'Dec 2025', uptime: 99.96, target: 99.95, met: true },
      { month: 'Jan 2026', uptime: 99.99, target: 99.95, met: true },
      { month: 'Feb 2026', uptime: 99.97, target: 99.95, met: true },
      { month: 'Mar 2026', uptime: 99.97, target: 99.95, met: true },
    ],
    violations: [
      { date: 'Nov 12, 2025', duration: '23 min', impact: 'API latency spike, 503 errors' },
    ],
    errorBudgetUsed: 1.3,
    errorBudgetTotal: 21.6,
  },
  {
    id: '2',
    serviceName: 'Auth Service',
    serviceSlug: 'auth-service',
    target: 99.99,
    currentUptime: 99.95,
    met: false,
    window: '30 days',
    complianceHistory: [
      { month: 'Oct 2025', uptime: 100, target: 99.99, met: true },
      { month: 'Nov 2025', uptime: 99.99, target: 99.99, met: true },
      { month: 'Dec 2025', uptime: 99.97, target: 99.99, met: false },
      { month: 'Jan 2026', uptime: 100, target: 99.99, met: true },
      { month: 'Feb 2026', uptime: 99.98, target: 99.99, met: false },
      { month: 'Mar 2026', uptime: 99.95, target: 99.99, met: false },
    ],
    violations: [
      { date: 'Dec 5, 2025', duration: '12 min', impact: 'Login failures' },
      { date: 'Feb 18, 2026', duration: '8 min', impact: 'Token refresh errors' },
      { date: 'Mar 10, 2026', duration: '22 min', impact: 'SSO degradation' },
    ],
    errorBudgetUsed: 4.1,
    errorBudgetTotal: 4.3,
  },
  {
    id: '3',
    serviceName: 'CDN Edge',
    serviceSlug: 'cdn-edge',
    target: 99.9,
    currentUptime: 99.98,
    met: true,
    window: '30 days',
    complianceHistory: [
      { month: 'Oct 2025', uptime: 99.95, target: 99.9, met: true },
      { month: 'Nov 2025', uptime: 99.99, target: 99.9, met: true },
      { month: 'Dec 2025', uptime: 99.93, target: 99.9, met: true },
      { month: 'Jan 2026', uptime: 100, target: 99.9, met: true },
      { month: 'Feb 2026', uptime: 99.97, target: 99.9, met: true },
      { month: 'Mar 2026', uptime: 99.98, target: 99.9, met: true },
    ],
    violations: [],
    errorBudgetUsed: 0.9,
    errorBudgetTotal: 43.2,
  },
  {
    id: '4',
    serviceName: 'Database Cluster',
    serviceSlug: 'database-cluster',
    target: 99.99,
    currentUptime: 100,
    met: true,
    window: '30 days',
    complianceHistory: [
      { month: 'Oct 2025', uptime: 100, target: 99.99, met: true },
      { month: 'Nov 2025', uptime: 100, target: 99.99, met: true },
      { month: 'Dec 2025', uptime: 100, target: 99.99, met: true },
      { month: 'Jan 2026', uptime: 99.998, target: 99.99, met: true },
      { month: 'Feb 2026', uptime: 100, target: 99.99, met: true },
      { month: 'Mar 2026', uptime: 100, target: 99.99, met: true },
    ],
    violations: [],
    errorBudgetUsed: 0.1,
    errorBudgetTotal: 4.3,
  },
  {
    id: '5',
    serviceName: 'Payment Processing',
    serviceSlug: 'payment-processing',
    target: 99.95,
    currentUptime: 99.91,
    met: false,
    window: '30 days',
    complianceHistory: [
      { month: 'Oct 2025', uptime: 99.96, target: 99.95, met: true },
      { month: 'Nov 2025', uptime: 99.97, target: 99.95, met: true },
      { month: 'Dec 2025', uptime: 99.88, target: 99.95, met: false },
      { month: 'Jan 2026', uptime: 99.95, target: 99.95, met: true },
      { month: 'Feb 2026', uptime: 99.93, target: 99.95, met: false },
      { month: 'Mar 2026', uptime: 99.91, target: 99.95, met: false },
    ],
    violations: [
      { date: 'Dec 20, 2025', duration: '45 min', impact: 'Transaction failures' },
      { date: 'Feb 5, 2026', duration: '28 min', impact: 'Payment timeout errors' },
      { date: 'Mar 14, 2026', duration: '35 min', impact: 'Webhook delivery delays' },
    ],
    errorBudgetUsed: 19.8,
    errorBudgetTotal: 21.6,
  },
];

const serviceOptions = [
  'API Gateway',
  'Auth Service',
  'CDN Edge',
  'Database Cluster',
  'Payment Processing',
  'Search Service',
  'Notification Service',
  'File Storage',
];

const windowOptions = ['7 days', '30 days', '90 days'];

export default function SlaPage() {
  const [slas, setSlas] = useState<SlaTarget[]>(initialSlas);
  const [selectedSla, setSelectedSla] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [formService, setFormService] = useState('');
  const [formTarget, setFormTarget] = useState('99.9');
  const [formWindow, setFormWindow] = useState('30 days');

  const selected = slas.find((s) => s.id === selectedSla);

  function handleAddSla(e: React.FormEvent) {
    e.preventDefault();
    if (!formService) return;

    const newSla: SlaTarget = {
      id: Date.now().toString(),
      serviceName: formService,
      serviceSlug: formService.toLowerCase().replace(/\s+/g, '-'),
      target: parseFloat(formTarget),
      currentUptime: 100,
      met: true,
      window: formWindow,
      complianceHistory: [],
      violations: [],
      errorBudgetUsed: 0,
      errorBudgetTotal: ((100 - parseFloat(formTarget)) / 100) * 30 * 24 * 60,
    };

    setSlas((prev) => [...prev, newSla]);
    setShowAddForm(false);
    setFormService('');
    setFormTarget('99.9');
    setFormWindow('30 days');
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <Link
        href={"/enterprise" as any}
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-gray-500 transition-colors hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Enterprise
      </Link>

      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-50">
            SLA Targets
          </h1>
          <p className="mt-1 text-gray-600 dark:text-gray-400">
            Track service level agreement compliance and error budgets.
          </p>
        </div>
        <button onClick={() => setShowAddForm(!showAddForm)} className="btn-primary gap-2">
          <Plus className="h-4 w-4" />
          Add SLA Target
        </button>
      </div>

      {/* Add Form */}
      {showAddForm && (
        <div className="card mb-6">
          <h3 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-50">
            Add SLA Target
          </h3>
          <form onSubmit={handleAddSla} className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label htmlFor="sla-service" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Service
              </label>
              <select
                id="sla-service"
                value={formService}
                onChange={(e) => setFormService(e.target.value)}
                required
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
              >
                <option value="">Select a service...</option>
                {serviceOptions.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div className="w-full sm:w-36">
              <label htmlFor="sla-target" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Uptime Target (%)
              </label>
              <input
                id="sla-target"
                type="number"
                step="0.01"
                min="90"
                max="100"
                value={formTarget}
                onChange={(e) => setFormTarget(e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
              />
            </div>
            <div className="w-full sm:w-36">
              <label htmlFor="sla-window" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Window
              </label>
              <select
                id="sla-window"
                value={formWindow}
                onChange={(e) => setFormWindow(e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
              >
                {windowOptions.map((w) => (
                  <option key={w} value={w}>{w}</option>
                ))}
              </select>
            </div>
            <button type="submit" className="btn-primary whitespace-nowrap">
              Add Target
            </button>
          </form>
        </div>
      )}

      {/* SLA List */}
      <div className="space-y-4">
        {slas.map((sla) => (
          <button
            key={sla.id}
            type="button"
            onClick={() => setSelectedSla(selectedSla === sla.id ? null : sla.id)}
            className={cn(
              'card w-full text-left transition-all',
              selectedSla === sla.id && 'ring-2 ring-blue-500 dark:ring-blue-400',
            )}
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                {sla.met ? (
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600 dark:text-green-400" />
                ) : (
                  <XCircle className="h-5 w-5 shrink-0 text-red-600 dark:text-red-400" />
                )}
                <div>
                  <p className="font-semibold text-gray-900 dark:text-gray-100">
                    {sla.serviceName}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Window: {sla.window}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-6 text-sm">
                <div className="text-center">
                  <p className="text-gray-500 dark:text-gray-400">Target</p>
                  <p className="font-semibold text-gray-900 dark:text-gray-100">{sla.target}%</p>
                </div>
                <div className="text-center">
                  <p className="text-gray-500 dark:text-gray-400">Current</p>
                  <p
                    className={cn(
                      'font-semibold',
                      sla.met
                        ? 'text-green-600 dark:text-green-400'
                        : 'text-red-600 dark:text-red-400',
                    )}
                  >
                    {sla.currentUptime}%
                  </p>
                </div>
                <span
                  className={cn(
                    'badge',
                    sla.met
                      ? 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                      : 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400',
                  )}
                >
                  {sla.met ? 'Met' : 'Not Met'}
                </span>
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Detail View */}
      {selected && (
        <div className="mt-8 space-y-6">
          <div className="h-px bg-gray-200 dark:bg-gray-700" />

          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-50">
            {selected.serviceName} - SLA Detail
          </h2>

          {/* Compliance History */}
          {selected.complianceHistory.length > 0 && (
            <div className="card">
              <h3 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-50">
                Compliance History
              </h3>
              <ComplianceTimeline periods={selected.complianceHistory} />
            </div>
          )}

          {/* Compliance Bar Chart */}
          {selected.complianceHistory.length > 0 && (
            <div className="card">
              <h3 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-50">
                Monthly Uptime vs Target
              </h3>
              <TrendChart
                type="bar"
                labels={selected.complianceHistory.map((h) => h.month.slice(0, 3))}
                data={[
                  {
                    label: 'Uptime %',
                    data: selected.complianceHistory.map((h) => h.uptime),
                    color: '#22c55e',
                  },
                ]}
                height={280}
              />
            </div>
          )}

          {/* Error Budget */}
          <div className="card">
            <div className="mb-3 flex items-center gap-2">
              <Target className="h-5 w-5 text-gray-500 dark:text-gray-400" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-50">
                Error Budget
              </h3>
            </div>
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="text-gray-600 dark:text-gray-400">
                {selected.errorBudgetUsed.toFixed(1)} min used of {selected.errorBudgetTotal.toFixed(1)} min
              </span>
              <span
                className={cn(
                  'font-semibold',
                  selected.errorBudgetUsed / selected.errorBudgetTotal > 0.8
                    ? 'text-red-600 dark:text-red-400'
                    : 'text-green-600 dark:text-green-400',
                )}
              >
                {((1 - selected.errorBudgetUsed / selected.errorBudgetTotal) * 100).toFixed(1)}% remaining
              </span>
            </div>
            <div className="h-3 w-full rounded-full bg-gray-200 dark:bg-gray-700">
              <div
                className={cn(
                  'h-3 rounded-full transition-all',
                  selected.errorBudgetUsed / selected.errorBudgetTotal > 0.8
                    ? 'bg-red-500'
                    : selected.errorBudgetUsed / selected.errorBudgetTotal > 0.5
                      ? 'bg-yellow-500'
                      : 'bg-green-500',
                )}
                style={{
                  width: `${Math.min((selected.errorBudgetUsed / selected.errorBudgetTotal) * 100, 100)}%`,
                }}
              />
            </div>
          </div>

          {/* Violations Log */}
          <div className="card">
            <div className="mb-4 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-gray-500 dark:text-gray-400" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-50">
                Violation Log
              </h3>
            </div>
            {selected.violations.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                No violations recorded. SLA has been consistently met.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-700">
                      <th className="pb-3 pr-4 font-medium text-gray-500 dark:text-gray-400">Date</th>
                      <th className="pb-3 pr-4 font-medium text-gray-500 dark:text-gray-400">Duration</th>
                      <th className="pb-3 font-medium text-gray-500 dark:text-gray-400">Impact</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {selected.violations.map((v, i) => (
                      <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                        <td className="py-3 pr-4 font-medium text-gray-900 dark:text-gray-100">
                          {v.date}
                        </td>
                        <td className="py-3 pr-4 text-gray-600 dark:text-gray-400">{v.duration}</td>
                        <td className="py-3 text-gray-600 dark:text-gray-400">{v.impact}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
