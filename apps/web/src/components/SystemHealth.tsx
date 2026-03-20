'use client';

import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';

interface ServiceHealth {
  name: string;
  status: 'healthy' | 'degraded' | 'down';
  latency: number;
  lastCheck: string;
}

const initialServices: ServiceHealth[] = [
  { name: 'API Gateway', status: 'healthy', latency: 12, lastCheck: new Date().toISOString() },
  { name: 'Web Application', status: 'healthy', latency: 45, lastCheck: new Date().toISOString() },
  { name: 'PostgreSQL', status: 'healthy', latency: 3, lastCheck: new Date().toISOString() },
  { name: 'Redis Cache', status: 'healthy', latency: 1, lastCheck: new Date().toISOString() },
  { name: 'Kafka Cluster', status: 'healthy', latency: 8, lastCheck: new Date().toISOString() },
  { name: 'HTTP Probers', status: 'healthy', latency: 22, lastCheck: new Date().toISOString() },
  { name: 'DNS Probers', status: 'healthy', latency: 18, lastCheck: new Date().toISOString() },
  { name: 'ML Pipeline', status: 'healthy', latency: 95, lastCheck: new Date().toISOString() },
];

const statusConfig = {
  healthy: {
    dot: 'bg-green-500',
    bg: 'bg-green-50 dark:bg-green-900/20',
    border: 'border-green-200 dark:border-green-800',
    label: 'Healthy',
    Icon: CheckCircle2,
    iconClass: 'text-green-500',
  },
  degraded: {
    dot: 'bg-yellow-500',
    bg: 'bg-yellow-50 dark:bg-yellow-900/20',
    border: 'border-yellow-200 dark:border-yellow-800',
    label: 'Degraded',
    Icon: AlertTriangle,
    iconClass: 'text-yellow-500',
  },
  down: {
    dot: 'bg-red-500',
    bg: 'bg-red-50 dark:bg-red-900/20',
    border: 'border-red-200 dark:border-red-800',
    label: 'Down',
    Icon: XCircle,
    iconClass: 'text-red-500',
  },
};

function getOverallStatus(services: ServiceHealth[]): 'healthy' | 'degraded' | 'down' {
  if (services.some((s) => s.status === 'down')) return 'down';
  if (services.some((s) => s.status === 'degraded')) return 'degraded';
  return 'healthy';
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return 'N/A';
  }
}

export default function SystemHealth() {
  const [services, setServices] = useState<ServiceHealth[]>(initialServices);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(new Date());

  const refresh = useCallback(() => {
    setRefreshing(true);
    // Simulate API call with slight random variations
    setTimeout(() => {
      setServices((prev) =>
        prev.map((svc) => ({
          ...svc,
          latency: Math.max(1, svc.latency + Math.floor(Math.random() * 10) - 5),
          lastCheck: new Date().toISOString(),
        })),
      );
      setLastRefresh(new Date());
      setRefreshing(false);
    }, 500);
  }, []);

  useEffect(() => {
    const interval = setInterval(refresh, 30000);
    return () => clearInterval(interval);
  }, [refresh]);

  const overall = getOverallStatus(services);
  const overallConfig = statusConfig[overall];
  const OverallIcon = overallConfig.Icon;

  return (
    <div className="space-y-6">
      {/* Overall Status */}
      <div
        className={`flex items-center justify-between rounded-xl border p-5 ${overallConfig.bg} ${overallConfig.border}`}
      >
        <div className="flex items-center gap-3">
          <OverallIcon className={`h-6 w-6 ${overallConfig.iconClass}`} />
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              System Status: {overallConfig.label}
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Last checked {formatTime(lastRefresh.toISOString())}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={refreshing}
          className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-white/50 hover:text-gray-700 dark:hover:bg-gray-800/50 dark:hover:text-gray-300"
          aria-label="Refresh status"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Service Grid */}
      <div className="grid gap-3 sm:grid-cols-2">
        {services.map((svc) => {
          const cfg = statusConfig[svc.status];
          return (
            <div
              key={svc.name}
              className="card flex items-center justify-between gap-4"
            >
              <div className="flex items-center gap-3">
                <span
                  className={`h-2.5 w-2.5 shrink-0 rounded-full ${cfg.dot} ${
                    svc.status !== 'healthy' ? 'animate-pulse' : ''
                  }`}
                />
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {svc.name}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {formatTime(svc.lastCheck)}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm font-mono font-medium text-gray-900 dark:text-gray-100">
                  {svc.latency}ms
                </p>
                <p className={`text-xs font-medium ${cfg.iconClass}`}>
                  {cfg.label}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
