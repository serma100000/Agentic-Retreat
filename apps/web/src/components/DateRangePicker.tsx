'use client';

import { useState, useCallback } from 'react';

interface DateRangePickerProps {
  readonly startDate: string;
  readonly endDate: string;
  readonly onChange: (start: string, end: string) => void;
}

function formatDateISO(date: Date): string {
  return date.toISOString().split('T')[0];
}

function daysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return formatDateISO(d);
}

const presets = [
  { label: 'Last 7 days', days: 7 },
  { label: 'Last 30 days', days: 30 },
  { label: 'Last 90 days', days: 90 },
  { label: 'Last year', days: 365 },
] as const;

export default function DateRangePicker({ startDate, endDate, onChange }: DateRangePickerProps) {
  const [error, setError] = useState('');

  const handleStartChange = useCallback(
    (value: string) => {
      if (endDate && value > endDate) {
        setError('Start date cannot be after end date');
        return;
      }
      setError('');
      onChange(value, endDate);
    },
    [endDate, onChange],
  );

  const handleEndChange = useCallback(
    (value: string) => {
      if (startDate && value < startDate) {
        setError('End date cannot be before start date');
        return;
      }
      setError('');
      onChange(startDate, value);
    },
    [startDate, onChange],
  );

  const applyPreset = useCallback(
    (days: number) => {
      setError('');
      onChange(daysAgo(days), formatDateISO(new Date()));
    },
    [onChange],
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="range-start"
            className="text-xs font-medium text-gray-500 dark:text-gray-400"
          >
            Start Date
          </label>
          <input
            id="range-start"
            type="date"
            value={startDate}
            max={endDate || undefined}
            onChange={(e) => handleStartChange(e.target.value)}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="range-end"
            className="text-xs font-medium text-gray-500 dark:text-gray-400"
          >
            End Date
          </label>
          <input
            id="range-end"
            type="date"
            value={endDate}
            min={startDate || undefined}
            onChange={(e) => handleEndChange(e.target.value)}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {presets.map((preset) => (
          <button
            key={preset.days}
            type="button"
            onClick={() => applyPreset(preset.days)}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            {preset.label}
          </button>
        ))}
      </div>

      {error && (
        <p className="text-xs text-red-500 dark:text-red-400">{error}</p>
      )}
    </div>
  );
}
