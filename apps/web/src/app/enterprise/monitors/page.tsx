'use client';

import { useState } from 'react';
import Link from 'next/link';
/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  ArrowLeft,
  Plus,
  Pencil,
  Trash2,
  CheckCircle2,
  XCircle,
  Clock,
  Wifi,
  Globe,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Monitor {
  id: string;
  url: string;
  probeTypes: string[];
  interval: number;
  regions: string[];
  alertEmail: boolean;
  alertWebhook: boolean;
  alertSlack: boolean;
  status: 'up' | 'down' | 'degraded';
  lastCheck: string;
  latency: number;
  uptime24h: number;
}

const availableRegions = [
  'us-east-1',
  'us-west-2',
  'eu-west-1',
  'eu-central-1',
  'ap-southeast-1',
  'ap-northeast-1',
];

const probeTypeOptions = ['HTTP', 'HTTPS', 'TCP', 'ICMP', 'DNS'];

const intervalOptions = [
  { label: '30 seconds', value: 30 },
  { label: '1 minute', value: 60 },
  { label: '5 minutes', value: 300 },
  { label: '10 minutes', value: 600 },
  { label: '15 minutes', value: 900 },
];

const initialMonitors: Monitor[] = [
  {
    id: '1',
    url: 'https://api.acme.com/health',
    probeTypes: ['HTTPS'],
    interval: 60,
    regions: ['us-east-1', 'eu-west-1'],
    alertEmail: true,
    alertWebhook: false,
    alertSlack: true,
    status: 'up',
    lastCheck: '2 min ago',
    latency: 142,
    uptime24h: 100,
  },
  {
    id: '2',
    url: 'https://dashboard.acme.com',
    probeTypes: ['HTTPS', 'TCP'],
    interval: 300,
    regions: ['us-east-1', 'us-west-2', 'eu-central-1'],
    alertEmail: true,
    alertWebhook: true,
    alertSlack: false,
    status: 'up',
    lastCheck: '5 min ago',
    latency: 234,
    uptime24h: 99.98,
  },
  {
    id: '3',
    url: 'https://auth.acme.com/status',
    probeTypes: ['HTTPS'],
    interval: 30,
    regions: ['us-east-1'],
    alertEmail: true,
    alertWebhook: true,
    alertSlack: true,
    status: 'degraded',
    lastCheck: '30 sec ago',
    latency: 892,
    uptime24h: 99.85,
  },
  {
    id: '4',
    url: 'tcp://db.acme.internal:5432',
    probeTypes: ['TCP'],
    interval: 60,
    regions: ['us-east-1'],
    alertEmail: true,
    alertWebhook: false,
    alertSlack: false,
    status: 'up',
    lastCheck: '1 min ago',
    latency: 8,
    uptime24h: 100,
  },
  {
    id: '5',
    url: 'https://cdn.acme.com/probe.txt',
    probeTypes: ['HTTPS', 'DNS'],
    interval: 300,
    regions: ['us-east-1', 'us-west-2', 'eu-west-1', 'ap-southeast-1'],
    alertEmail: true,
    alertWebhook: false,
    alertSlack: true,
    status: 'down',
    lastCheck: '5 min ago',
    latency: 0,
    uptime24h: 97.2,
  },
];

const statusConfig = {
  up: { icon: CheckCircle2, label: 'Up', cls: 'text-green-600 dark:text-green-400' },
  down: { icon: XCircle, label: 'Down', cls: 'text-red-600 dark:text-red-400' },
  degraded: { icon: Clock, label: 'Degraded', cls: 'text-yellow-600 dark:text-yellow-400' },
};

export default function MonitorsPage() {
  const [monitors, setMonitors] = useState<Monitor[]>(initialMonitors);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  // Form state
  const [formUrl, setFormUrl] = useState('');
  const [formProbes, setFormProbes] = useState<string[]>(['HTTPS']);
  const [formInterval, setFormInterval] = useState(60);
  const [formRegions, setFormRegions] = useState<string[]>(['us-east-1']);
  const [formAlertEmail, setFormAlertEmail] = useState(true);
  const [formAlertWebhook, setFormAlertWebhook] = useState(false);
  const [formAlertSlack, setFormAlertSlack] = useState(false);

  function resetForm() {
    setFormUrl('');
    setFormProbes(['HTTPS']);
    setFormInterval(60);
    setFormRegions(['us-east-1']);
    setFormAlertEmail(true);
    setFormAlertWebhook(false);
    setFormAlertSlack(false);
    setEditId(null);
  }

  function handleOpenAdd() {
    resetForm();
    setShowForm(true);
  }

  function handleEdit(monitor: Monitor) {
    setFormUrl(monitor.url);
    setFormProbes([...monitor.probeTypes]);
    setFormInterval(monitor.interval);
    setFormRegions([...monitor.regions]);
    setFormAlertEmail(monitor.alertEmail);
    setFormAlertWebhook(monitor.alertWebhook);
    setFormAlertSlack(monitor.alertSlack);
    setEditId(monitor.id);
    setShowForm(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formUrl.trim()) return;

    if (editId) {
      setMonitors((prev) =>
        prev.map((m) =>
          m.id === editId
            ? {
                ...m,
                url: formUrl,
                probeTypes: formProbes,
                interval: formInterval,
                regions: formRegions,
                alertEmail: formAlertEmail,
                alertWebhook: formAlertWebhook,
                alertSlack: formAlertSlack,
              }
            : m,
        ),
      );
    } else {
      const newMonitor: Monitor = {
        id: Date.now().toString(),
        url: formUrl,
        probeTypes: formProbes,
        interval: formInterval,
        regions: formRegions,
        alertEmail: formAlertEmail,
        alertWebhook: formAlertWebhook,
        alertSlack: formAlertSlack,
        status: 'up',
        lastCheck: 'Just now',
        latency: 0,
        uptime24h: 100,
      };
      setMonitors((prev) => [...prev, newMonitor]);
    }

    setShowForm(false);
    resetForm();
  }

  function handleDelete(id: string) {
    setMonitors((prev) => prev.filter((m) => m.id !== id));
    setConfirmDelete(null);
  }

  function toggleProbe(probe: string) {
    setFormProbes((prev) =>
      prev.includes(probe) ? prev.filter((p) => p !== probe) : [...prev, probe],
    );
  }

  function toggleRegion(region: string) {
    setFormRegions((prev) =>
      prev.includes(region) ? prev.filter((r) => r !== region) : [...prev, region],
    );
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
            Custom Monitors
          </h1>
          <p className="mt-1 text-gray-600 dark:text-gray-400">
            Configure endpoint monitoring with custom probes and alert policies.
          </p>
        </div>
        <button onClick={handleOpenAdd} className="btn-primary gap-2">
          <Plus className="h-4 w-4" />
          Add Monitor
        </button>
      </div>

      {/* Add/Edit Form */}
      {showForm && (
        <div className="card mb-6">
          <h3 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-50">
            {editId ? 'Edit Monitor' : 'Add New Monitor'}
          </h3>
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* URL */}
            <div>
              <label htmlFor="monitor-url" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                URL / Endpoint
              </label>
              <div className="relative">
                <Globe className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  id="monitor-url"
                  type="text"
                  required
                  value={formUrl}
                  onChange={(e) => setFormUrl(e.target.value)}
                  placeholder="https://api.example.com/health"
                  className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-10 pr-4 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500"
                />
              </div>
            </div>

            {/* Probe Types */}
            <div>
              <span className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Probe Types
              </span>
              <div className="flex flex-wrap gap-2">
                {probeTypeOptions.map((probe) => (
                  <button
                    key={probe}
                    type="button"
                    onClick={() => toggleProbe(probe)}
                    className={cn(
                      'rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
                      formProbes.includes(probe)
                        ? 'border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-400 dark:bg-blue-900/30 dark:text-blue-300'
                        : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700',
                    )}
                  >
                    {probe}
                  </button>
                ))}
              </div>
            </div>

            {/* Interval */}
            <div>
              <label htmlFor="monitor-interval" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Check Interval
              </label>
              <select
                id="monitor-interval"
                value={formInterval}
                onChange={(e) => setFormInterval(Number(e.target.value))}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 sm:w-60"
              >
                {intervalOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Regions */}
            <div>
              <span className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Monitoring Regions
              </span>
              <div className="flex flex-wrap gap-2">
                {availableRegions.map((region) => (
                  <button
                    key={region}
                    type="button"
                    onClick={() => toggleRegion(region)}
                    className={cn(
                      'rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
                      formRegions.includes(region)
                        ? 'border-green-500 bg-green-50 text-green-700 dark:border-green-400 dark:bg-green-900/30 dark:text-green-300'
                        : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700',
                    )}
                  >
                    {region}
                  </button>
                ))}
              </div>
            </div>

            {/* Alert Policy */}
            <div>
              <span className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Alert Policy
              </span>
              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <input
                    type="checkbox"
                    checked={formAlertEmail}
                    onChange={(e) => setFormAlertEmail(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:border-gray-600"
                  />
                  Email
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <input
                    type="checkbox"
                    checked={formAlertWebhook}
                    onChange={(e) => setFormAlertWebhook(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:border-gray-600"
                  />
                  Webhook
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <input
                    type="checkbox"
                    checked={formAlertSlack}
                    onChange={(e) => setFormAlertSlack(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:border-gray-600"
                  />
                  Slack
                </label>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button type="submit" className="btn-primary">
                {editId ? 'Save Changes' : 'Create Monitor'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  resetForm();
                }}
                className="btn-secondary"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Monitors List */}
      <div className="space-y-4">
        {monitors.map((monitor) => {
          const st = statusConfig[monitor.status];
          const StatusIcon = st.icon;
          return (
            <div key={monitor.id} className="card">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <StatusIcon className={cn('mt-0.5 h-5 w-5 shrink-0', st.cls)} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
                      {monitor.url}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                      <span className="flex items-center gap-1">
                        <Wifi className="h-3 w-3" />
                        {monitor.probeTypes.join(', ')}
                      </span>
                      <span>Every {intervalOptions.find((o) => o.value === monitor.interval)?.label ?? `${monitor.interval}s`}</span>
                      <span>{monitor.regions.length} region{monitor.regions.length !== 1 ? 's' : ''}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-6">
                  <div className="text-right">
                    <div className="flex items-center gap-4 text-sm">
                      <div>
                        <span className="text-gray-500 dark:text-gray-400">Last check: </span>
                        <span className="text-gray-700 dark:text-gray-300">{monitor.lastCheck}</span>
                      </div>
                      <div>
                        <span className="text-gray-500 dark:text-gray-400">Latency: </span>
                        <span className="font-medium text-gray-700 dark:text-gray-300">
                          {monitor.latency > 0 ? `${monitor.latency}ms` : '--'}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-500 dark:text-gray-400">24h: </span>
                        <span
                          className={cn(
                            'font-medium',
                            monitor.uptime24h >= 99.9
                              ? 'text-green-600 dark:text-green-400'
                              : monitor.uptime24h >= 99
                                ? 'text-yellow-600 dark:text-yellow-400'
                                : 'text-red-600 dark:text-red-400',
                          )}
                        >
                          {monitor.uptime24h}%
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleEdit(monitor)}
                      className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
                      title="Edit monitor"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    {confirmDelete === monitor.id ? (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleDelete(monitor.id)}
                          className="rounded-md bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700"
                        >
                          Delete
                        </button>
                        <button
                          onClick={() => setConfirmDelete(null)}
                          className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmDelete(monitor.id)}
                        className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/30 dark:hover:text-red-400"
                        title="Delete monitor"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {monitors.length === 0 && (
        <div className="rounded-xl border-2 border-dashed border-gray-200 p-12 text-center dark:border-gray-700">
          <Wifi className="mx-auto mb-3 h-10 w-10 text-gray-400" />
          <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300">No monitors yet</h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Add your first custom monitor to start tracking endpoint health.
          </p>
        </div>
      )}
    </div>
  );
}
