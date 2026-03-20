'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { AlertCircle, ChevronDown, Check, X, Loader2 } from 'lucide-react';
import { submitReport } from '@/lib/api';
import { cn } from '@/lib/utils';

interface ReportButtonProps {
  readonly serviceSlug: string;
}

type ReportType = 'outage' | 'degraded' | 'resolved';

const reportOptions: { type: ReportType; label: string; icon: React.ElementType; color: string }[] = [
  { type: 'outage', label: 'Outage', icon: AlertCircle, color: 'text-red-500' },
  { type: 'degraded', label: 'Degraded', icon: AlertCircle, color: 'text-orange-500' },
  { type: 'resolved', label: 'Working Fine', icon: Check, color: 'text-green-500' },
];

export default function ReportButton({ serviceSlug }: ReportButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const handleReport = useCallback(async (type: ReportType) => {
    setIsSubmitting(true);
    setIsOpen(false);
    try {
      await submitReport({ serviceSlug, type });
      setToast({ type: 'success', message: 'Report submitted. Thank you!' });
    } catch {
      setToast({ type: 'error', message: 'Failed to submit report. Please try again.' });
    } finally {
      setIsSubmitting(false);
    }
  }, [serviceSlug]);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        disabled={isSubmitting}
        className="btn-primary gap-2"
      >
        {isSubmitting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <AlertCircle className="h-4 w-4" />
        )}
        Report a Problem
        <ChevronDown className={cn('h-4 w-4 transition-transform', isOpen && 'rotate-180')} />
      </button>

      {isOpen && (
        <div className="absolute right-0 z-50 mt-2 w-52 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800">
          {reportOptions.map((option) => {
            const Icon = option.icon;
            return (
              <button
                key={option.type}
                type="button"
                onClick={() => handleReport(option.type)}
                className="flex w-full items-center gap-3 px-4 py-3 text-sm text-gray-700 transition-colors hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                <Icon className={cn('h-4 w-4', option.color)} />
                {option.label}
              </button>
            );
          })}
        </div>
      )}

      {toast && (
        <div
          className={cn(
            'absolute right-0 z-50 mt-2 flex items-center gap-2 rounded-lg px-4 py-3 text-sm font-medium shadow-lg',
            toast.type === 'success'
              ? 'bg-green-50 text-green-700 dark:bg-green-900/50 dark:text-green-300'
              : 'bg-red-50 text-red-700 dark:bg-red-900/50 dark:text-red-300',
          )}
        >
          {toast.type === 'success' ? (
            <Check className="h-4 w-4" />
          ) : (
            <X className="h-4 w-4" />
          )}
          {toast.message}
        </div>
      )}
    </div>
  );
}
