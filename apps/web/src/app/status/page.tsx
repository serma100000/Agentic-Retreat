'use client';

import { useState, useCallback } from 'react';
import { Activity, Bell, CheckCircle2, AlertTriangle, Clock, Mail } from 'lucide-react';
import SystemHealth from '@/components/SystemHealth';

interface Incident {
  id: string;
  title: string;
  status: 'resolved' | 'investigating' | 'monitoring';
  date: string;
  duration: string;
  description: string;
}

const incidents: Incident[] = [
  {
    id: 'inc-007',
    title: 'Elevated API latency in us-east-1',
    status: 'resolved',
    date: '2026-03-15',
    duration: '18m',
    description: 'API Gateway experienced increased latency due to a configuration rollout. Resolved by rolling back the change.',
  },
  {
    id: 'inc-006',
    title: 'Kafka consumer lag spike',
    status: 'resolved',
    date: '2026-03-10',
    duration: '12m',
    description: 'Consumer group rebalancing caused temporary message processing delays. Auto-recovered after rebalance completion.',
  },
  {
    id: 'inc-005',
    title: 'Redis failover event',
    status: 'resolved',
    date: '2026-03-05',
    duration: '3m',
    description: 'Planned Redis sentinel failover. Brief connection reset for cache clients. No data loss.',
  },
  {
    id: 'inc-004',
    title: 'DNS prober timeout in asia-southeast',
    status: 'resolved',
    date: '2026-02-28',
    duration: '8m',
    description: 'DNS probers in Singapore datacenter lost connectivity briefly due to upstream provider maintenance.',
  },
  {
    id: 'inc-003',
    title: 'Database connection pool exhaustion',
    status: 'resolved',
    date: '2026-02-20',
    duration: '25m',
    description: 'A surge in write operations caused connection pool saturation. Mitigated by increasing pool size and adding connection queuing.',
  },
];

const uptimeData = Array.from({ length: 30 }, (_, i) => {
  const date = new Date();
  date.setDate(date.getDate() - (29 - i));
  const day = date.toISOString().split('T')[0];
  // Most days are 100%, with a few minor dips
  const uptime = [5, 10, 20].includes(i) ? 99.85 + Math.random() * 0.1 : 99.95 + Math.random() * 0.05;
  return { date: day, uptime: Math.min(100, uptime) };
});

const incidentStatusConfig = {
  resolved: {
    label: 'Resolved',
    bg: 'bg-gray-50 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
    icon: CheckCircle2,
    iconClass: 'text-gray-400',
  },
  investigating: {
    label: 'Investigating',
    bg: 'bg-yellow-50 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
    icon: AlertTriangle,
    iconClass: 'text-yellow-500',
  },
  monitoring: {
    label: 'Monitoring',
    bg: 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    icon: Clock,
    iconClass: 'text-blue-500',
  },
};

export default function StatusPage() {
  const [subscribeEmail, setSubscribeEmail] = useState('');
  const [subscribed, setSubscribed] = useState(false);

  const handleSubscribe = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!subscribeEmail) return;
      // Simulate subscription
      await new Promise((resolve) => setTimeout(resolve, 800));
      setSubscribed(true);
    },
    [subscribeEmail],
  );

  const avgUptime = uptimeData.reduce((sum, d) => sum + d.uptime, 0) / uptimeData.length;
  const maxBarHeight = 48;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Hero */}
      <section className="mb-10 text-center">
        <div className="mx-auto max-w-3xl">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-green-200 bg-green-50 px-4 py-1.5 text-sm font-medium text-green-700 dark:border-green-800 dark:bg-green-900/30 dark:text-green-300">
            <Activity className="h-4 w-4" />
            All Systems Operational
          </div>
          <h1 className="text-balance text-4xl font-bold tracking-tight text-gray-900 dark:text-gray-50 sm:text-5xl">
            OpenPulse Status
          </h1>
          <p className="mt-4 text-lg text-gray-600 dark:text-gray-400">
            We eat our own dog food. This page monitors the OpenPulse platform itself,
            powered by the same detection engine we use for everyone else.
          </p>
        </div>
      </section>

      {/* System Health */}
      <section className="mb-12">
        <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">
          Component Health
        </h2>
        <SystemHealth />
      </section>

      {/* 30-day Uptime Chart */}
      <section className="mb-12">
        <div className="card">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                30-Day Uptime
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Overall platform availability
              </p>
            </div>
            <span className="rounded-full bg-green-50 px-3 py-1 text-sm font-semibold text-green-700 dark:bg-green-900/30 dark:text-green-400">
              {avgUptime.toFixed(3)}%
            </span>
          </div>
          <div className="flex items-end gap-[3px]" style={{ height: `${maxBarHeight + 16}px` }}>
            {uptimeData.map((day) => {
              const height = Math.max(4, ((day.uptime - 99.5) / 0.5) * maxBarHeight);
              const isLow = day.uptime < 99.9;
              return (
                <div
                  key={day.date}
                  className="group relative flex-1"
                  style={{ height: `${maxBarHeight}px` }}
                >
                  <div
                    className={`absolute bottom-0 w-full rounded-sm transition-colors ${
                      isLow
                        ? 'bg-yellow-400 dark:bg-yellow-500'
                        : 'bg-green-400 group-hover:bg-green-500 dark:bg-green-500 dark:group-hover:bg-green-400'
                    }`}
                    style={{ height: `${height}px` }}
                  />
                  <div className="absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-gray-900 px-2 py-1 text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100 dark:bg-gray-700">
                    {day.date}: {day.uptime.toFixed(3)}%
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-2 flex justify-between text-[10px] text-gray-400 dark:text-gray-500">
            <span>{uptimeData[0]?.date}</span>
            <span>Today</span>
          </div>
        </div>
      </section>

      {/* Incident History */}
      <section className="mb-12">
        <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">
          Incident History
        </h2>
        <div className="space-y-3">
          {incidents.map((incident) => {
            const cfg = incidentStatusConfig[incident.status];
            const StatusIcon = cfg.icon;
            return (
              <div key={incident.id} className="card">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <StatusIcon className={`mt-0.5 h-4 w-4 shrink-0 ${cfg.iconClass}`} />
                    <div>
                      <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {incident.title}
                      </h3>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        {incident.description}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="text-xs text-gray-400 dark:text-gray-500">
                      {incident.duration}
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${cfg.bg}`}>
                      {cfg.label}
                    </span>
                    <span className="text-xs text-gray-400 dark:text-gray-500">
                      {incident.date}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Subscribe */}
      <section className="rounded-xl border border-gray-200 bg-gradient-to-br from-blue-50 to-indigo-50 p-8 dark:border-gray-700 dark:from-blue-900/20 dark:to-indigo-900/20">
        <div className="mx-auto max-w-lg text-center">
          <Bell className="mx-auto h-8 w-8 text-blue-600 dark:text-blue-400" />
          <h3 className="mt-3 text-lg font-semibold text-gray-900 dark:text-gray-100">
            Subscribe to Status Updates
          </h3>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Get notified when OpenPulse experiences issues. We will only email you during incidents.
          </p>

          {subscribed ? (
            <div className="mt-4 flex items-center justify-center gap-2 text-sm text-green-700 dark:text-green-400">
              <CheckCircle2 className="h-4 w-4" />
              Subscribed! You will receive status update emails.
            </div>
          ) : (
            <form onSubmit={handleSubscribe} className="mt-4 flex gap-2">
              <div className="relative flex-1">
                <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="email"
                  required
                  value={subscribeEmail}
                  onChange={(e) => setSubscribeEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="w-full rounded-lg border border-gray-300 bg-white py-2.5 pl-9 pr-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:placeholder:text-gray-500"
                />
              </div>
              <button
                type="submit"
                className="shrink-0 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700"
              >
                Subscribe
              </button>
            </form>
          )}
        </div>
      </section>
    </div>
  );
}
