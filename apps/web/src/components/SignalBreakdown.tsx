'use client';

import { cn } from '@/lib/utils';

export interface Signal {
  readonly source: string;
  readonly score: number;
  readonly confidence: number;
}

const SOURCE_CONFIG: Record<string, { color: string; bg: string; label: string }> = {
  reports: {
    color: 'bg-blue-500',
    bg: 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    label: 'User Reports',
  },
  probes: {
    color: 'bg-green-500',
    bg: 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    label: 'Probe Checks',
  },
  social: {
    color: 'bg-purple-500',
    bg: 'bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
    label: 'Social Media',
  },
  statuspage: {
    color: 'bg-gray-400',
    bg: 'bg-gray-50 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
    label: 'Status Page',
  },
  ml: {
    color: 'bg-orange-500',
    bg: 'bg-orange-50 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
    label: 'ML Model',
  },
};

const defaultSourceConfig = {
  color: 'bg-gray-400',
  bg: 'bg-gray-50 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  label: 'Other',
};

interface SignalBreakdownProps {
  readonly signals: readonly Signal[];
}

export default function SignalBreakdown({ signals }: SignalBreakdownProps) {
  if (signals.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 p-6 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
        No signal data available.
      </div>
    );
  }

  const totalScore = signals.reduce((sum, s) => sum + s.score, 0);
  const sorted = [...signals].sort((a, b) => b.score - a.score);

  return (
    <div className="space-y-4">
      {/* Overall confidence bar */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Overall Confidence
          </span>
          <span className="text-sm font-bold text-gray-900 dark:text-gray-100">
            {totalScore > 0 ? Math.round((sorted.reduce((s, sig) => s + sig.confidence, 0) / sorted.length) * 100) : 0}%
          </span>
        </div>
        <div className="flex h-3 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
          {sorted.map((signal) => {
            const config = SOURCE_CONFIG[signal.source] ?? defaultSourceConfig;
            const widthPercent = totalScore > 0 ? (signal.score / totalScore) * 100 : 0;
            return (
              <div
                key={signal.source}
                className={cn('h-full transition-all duration-500', config.color)}
                style={{ width: `${widthPercent}%` }}
                title={`${config.label}: ${Math.round(widthPercent)}%`}
              />
            );
          })}
        </div>
      </div>

      {/* Individual signal bars */}
      <div className="space-y-3">
        {sorted.map((signal) => {
          const config = SOURCE_CONFIG[signal.source] ?? defaultSourceConfig;
          const contribution = totalScore > 0 ? (signal.score / totalScore) * 100 : 0;

          return (
            <div key={signal.source}>
              <div className="mb-1 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={cn('inline-block h-2.5 w-2.5 rounded-full', config.color)} />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {config.label}
                  </span>
                  <span className={cn('rounded-full px-1.5 py-0.5 text-xs font-medium', config.bg)}>
                    {Math.round(contribution)}%
                  </span>
                </div>
                <span className="text-xs tabular-nums text-gray-500 dark:text-gray-400">
                  confidence: {Math.round(signal.confidence * 100)}%
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                <div
                  className={cn('h-full rounded-full transition-all duration-500', config.color)}
                  style={{ width: `${Math.round(signal.confidence * 100)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 border-t border-gray-100 pt-3 dark:border-gray-800">
        {sorted.map((signal) => {
          const config = SOURCE_CONFIG[signal.source] ?? defaultSourceConfig;
          return (
            <span key={signal.source} className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
              <span className={cn('inline-block h-2 w-2 rounded-full', config.color)} />
              {config.label}
            </span>
          );
        })}
      </div>
    </div>
  );
}
