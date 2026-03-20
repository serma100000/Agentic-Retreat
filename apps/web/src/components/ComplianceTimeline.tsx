'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

interface CompliancePeriod {
  readonly month: string;
  readonly uptime: number;
  readonly target: number;
  readonly met: boolean;
}

interface ComplianceTimelineProps {
  readonly periods: readonly CompliancePeriod[];
}

export default function ComplianceTimeline({ periods }: ComplianceTimelineProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const currentMonth = new Date().toLocaleString('en-US', { month: 'short', year: '2-digit' });

  return (
    <div className="w-full">
      <div className="flex items-end gap-1.5 overflow-x-auto pb-2">
        {periods.map((period, index) => {
          const isCurrentMonth =
            period.month.toLowerCase().includes(currentMonth.toLowerCase());
          const violations = period.met
            ? 0
            : Math.ceil((period.target - period.uptime) * 100) / 100;

          return (
            <div
              key={period.month}
              className="relative flex flex-col items-center"
              onMouseEnter={() => setHoveredIndex(index)}
              onMouseLeave={() => setHoveredIndex(null)}
            >
              {/* Tooltip */}
              {hoveredIndex === index && (
                <div className="absolute -top-20 left-1/2 z-20 w-48 -translate-x-1/2 rounded-lg border border-gray-200 bg-white p-3 shadow-lg dark:border-gray-700 dark:bg-gray-800">
                  <p className="text-xs font-semibold text-gray-900 dark:text-gray-100">
                    {period.month}
                  </p>
                  <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
                    Uptime: {period.uptime.toFixed(3)}%
                  </p>
                  <p className="text-xs text-gray-600 dark:text-gray-400">
                    Target: {period.target}%
                  </p>
                  {!period.met && (
                    <p className="mt-0.5 text-xs font-medium text-red-600 dark:text-red-400">
                      Missed by {violations.toFixed(3)}%
                    </p>
                  )}
                  <div className="absolute -bottom-1.5 left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 border-b border-r border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800" />
                </div>
              )}

              {/* Block */}
              <div
                className={cn(
                  'h-10 w-10 rounded-md transition-all cursor-pointer',
                  period.met
                    ? 'bg-green-500 hover:bg-green-400 dark:bg-green-600 dark:hover:bg-green-500'
                    : 'bg-red-500 hover:bg-red-400 dark:bg-red-600 dark:hover:bg-red-500',
                  isCurrentMonth && 'ring-2 ring-blue-500 ring-offset-2 dark:ring-offset-gray-900',
                )}
              />

              {/* Label */}
              <span className="mt-1.5 text-[10px] text-gray-500 dark:text-gray-400">
                {period.month.slice(0, 3)}
              </span>
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
        <div className="flex items-center gap-1.5">
          <div className="h-3 w-3 rounded-sm bg-green-500" />
          <span>Target Met</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-3 w-3 rounded-sm bg-red-500" />
          <span>Target Missed</span>
        </div>
      </div>
    </div>
  );
}
