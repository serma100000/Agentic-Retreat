'use client';

import { cn } from '@/lib/utils';
import { formatDate } from '@/lib/utils';

export interface TimelineEvent {
  readonly id: string;
  readonly state: string;
  readonly description: string;
  readonly occurredAt: string;
  readonly source?: string;
  readonly signals?: readonly {
    readonly detector: string;
    readonly score: number;
  }[];
}

const stateColors: Record<string, { dot: string; line: string; label: string }> = {
  operational: {
    dot: 'bg-green-500',
    line: 'bg-green-200 dark:bg-green-800',
    label: 'Operational',
  },
  investigating: {
    dot: 'bg-yellow-500',
    line: 'bg-yellow-200 dark:bg-yellow-800',
    label: 'Investigating',
  },
  suspected: {
    dot: 'bg-yellow-500',
    line: 'bg-yellow-200 dark:bg-yellow-800',
    label: 'Suspected',
  },
  degraded: {
    dot: 'bg-orange-500',
    line: 'bg-orange-200 dark:bg-orange-800',
    label: 'Degraded',
  },
  partial_outage: {
    dot: 'bg-orange-600',
    line: 'bg-orange-200 dark:bg-orange-800',
    label: 'Partial Outage',
  },
  major_outage: {
    dot: 'bg-red-500',
    line: 'bg-red-200 dark:bg-red-800',
    label: 'Major Outage',
  },
  confirmed: {
    dot: 'bg-red-500',
    line: 'bg-red-200 dark:bg-red-800',
    label: 'Confirmed',
  },
  monitoring: {
    dot: 'bg-blue-500',
    line: 'bg-blue-200 dark:bg-blue-800',
    label: 'Monitoring',
  },
  resolving: {
    dot: 'bg-blue-500',
    line: 'bg-blue-200 dark:bg-blue-800',
    label: 'Resolving',
  },
  resolved: {
    dot: 'bg-green-500',
    line: 'bg-green-200 dark:bg-green-800',
    label: 'Resolved',
  },
};

const defaultColor = { dot: 'bg-gray-400', line: 'bg-gray-200 dark:bg-gray-700', label: 'Unknown' };

interface OutageTimelineProps {
  readonly events: readonly TimelineEvent[];
}

export default function OutageTimeline({ events }: OutageTimelineProps) {
  if (events.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 p-6 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
        No timeline events available.
      </div>
    );
  }

  return (
    <div className="max-h-[600px] overflow-y-auto pr-2">
      <div className="relative">
        {events.map((event, index) => {
          const color = stateColors[event.state] ?? defaultColor;
          const isLast = index === events.length - 1;

          return (
            <div key={event.id} className="relative flex gap-4 pb-8 last:pb-0">
              {/* Vertical line */}
              {!isLast && (
                <div
                  className={cn(
                    'absolute left-[11px] top-6 h-full w-0.5',
                    color.line,
                  )}
                />
              )}

              {/* Dot */}
              <div className="relative z-10 flex h-6 w-6 shrink-0 items-center justify-center">
                <div className={cn('h-3 w-3 rounded-full ring-4 ring-white dark:ring-gray-900', color.dot)} />
              </div>

              {/* Content */}
              <div className="min-w-0 flex-1 pt-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cn(
                    'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                    event.state === 'resolved'
                      ? 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                      : event.state === 'confirmed' || event.state === 'major_outage'
                        ? 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                        : event.state === 'monitoring' || event.state === 'resolving'
                          ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                          : 'bg-yellow-50 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
                  )}>
                    {color.label}
                  </span>
                  <time className="text-xs text-gray-500 dark:text-gray-400">
                    {formatDate(event.occurredAt)}
                  </time>
                </div>

                <p className="mt-1 text-sm text-gray-700 dark:text-gray-300">
                  {event.description}
                </p>

                {event.source && (
                  <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                    Source: {event.source}
                  </p>
                )}

                {event.signals && event.signals.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {event.signals.map((signal) => (
                      <span
                        key={signal.detector}
                        className="inline-flex items-center gap-1 rounded-md bg-gray-100 px-2 py-0.5 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                      >
                        {signal.detector}
                        <span className="font-medium">{Math.round(signal.score * 100)}%</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
