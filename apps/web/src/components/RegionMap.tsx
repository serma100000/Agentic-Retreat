'use client';

import { cn } from '@/lib/utils';
import { Globe, Wifi, WifiOff, Activity } from 'lucide-react';

export interface RegionInfo {
  readonly code: string;
  readonly status: string;
  readonly probeLatency: number;
}

const REGION_NAMES: Record<string, string> = {
  'us-east-1': 'US East (N. Virginia)',
  'us-east-2': 'US East (Ohio)',
  'us-west-1': 'US West (N. California)',
  'us-west-2': 'US West (Oregon)',
  'eu-west-1': 'Europe (Ireland)',
  'eu-west-2': 'Europe (London)',
  'eu-central-1': 'Europe (Frankfurt)',
  'ap-southeast-1': 'Asia Pacific (Singapore)',
  'ap-southeast-2': 'Asia Pacific (Sydney)',
  'ap-northeast-1': 'Asia Pacific (Tokyo)',
  'ap-south-1': 'Asia Pacific (Mumbai)',
  'sa-east-1': 'South America (Sao Paulo)',
  'ca-central-1': 'Canada (Central)',
  'me-south-1': 'Middle East (Bahrain)',
  'af-south-1': 'Africa (Cape Town)',
};

const statusConfig: Record<string, {
  badge: string;
  bg: string;
  icon: typeof Wifi;
  label: string;
}> = {
  operational: {
    badge: 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    bg: 'border-green-200 dark:border-green-800',
    icon: Wifi,
    label: 'Healthy',
  },
  degraded: {
    badge: 'bg-orange-50 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
    bg: 'border-orange-200 dark:border-orange-800',
    icon: Activity,
    label: 'Degraded',
  },
  partial_outage: {
    badge: 'bg-yellow-50 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
    bg: 'border-yellow-200 dark:border-yellow-800',
    icon: Activity,
    label: 'Partial Outage',
  },
  major_outage: {
    badge: 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    bg: 'border-red-200 dark:border-red-800',
    icon: WifiOff,
    label: 'Outage',
  },
  unknown: {
    badge: 'bg-gray-50 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
    bg: 'border-gray-200 dark:border-gray-700',
    icon: Globe,
    label: 'Unknown',
  },
};

function getLatencyColor(latency: number): string {
  if (latency <= 0) return 'text-gray-400';
  if (latency < 100) return 'text-green-600 dark:text-green-400';
  if (latency < 300) return 'text-yellow-600 dark:text-yellow-400';
  if (latency < 500) return 'text-orange-600 dark:text-orange-400';
  return 'text-red-600 dark:text-red-400';
}

function getLatencyBar(latency: number): number {
  if (latency <= 0) return 0;
  return Math.min((latency / 1000) * 100, 100);
}

interface RegionMapProps {
  readonly regions: readonly RegionInfo[];
}

export default function RegionMap({ regions }: RegionMapProps) {
  if (regions.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 p-6 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
        No region data available.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {regions.map((region) => {
        const config = statusConfig[region.status] ?? statusConfig.unknown;
        const Icon = config.icon;
        const latencyWidth = getLatencyBar(region.probeLatency);
        const name = REGION_NAMES[region.code] ?? region.code;

        return (
          <div
            key={region.code}
            className={cn(
              'rounded-lg border bg-white p-4 transition-shadow hover:shadow-md dark:bg-gray-900',
              config.bg,
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                  {name}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{region.code}</p>
              </div>
              <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium', config.badge)}>
                <Icon className="h-3 w-3" />
                {config.label}
              </span>
            </div>

            <div className="mt-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-500 dark:text-gray-400">Latency</span>
                <span className={cn('font-mono font-medium', getLatencyColor(region.probeLatency))}>
                  {region.probeLatency > 0 ? `${region.probeLatency}ms` : 'N/A'}
                </span>
              </div>
              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                <div
                  className={cn(
                    'h-full rounded-full transition-all duration-500',
                    region.probeLatency < 100
                      ? 'bg-green-500'
                      : region.probeLatency < 300
                        ? 'bg-yellow-500'
                        : region.probeLatency < 500
                          ? 'bg-orange-500'
                          : 'bg-red-500',
                  )}
                  style={{ width: `${latencyWidth}%` }}
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
