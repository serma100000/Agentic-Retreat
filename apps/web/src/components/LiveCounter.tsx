'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface LiveCounterProps {
  readonly value: number;
  readonly label: string;
  readonly icon?: ReactNode;
  readonly trend?: 'up' | 'down' | 'stable';
}

function useAnimatedValue(target: number, duration: number = 600): number {
  const [display, setDisplay] = useState(target);
  const prevRef = useRef(target);
  const frameRef = useRef<number>(0);

  useEffect(() => {
    const from = prevRef.current;
    const to = target;
    prevRef.current = target;

    if (from === to) {
      setDisplay(to);
      return;
    }

    const startTime = performance.now();
    const diff = to - from;

    function step(now: number) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(from + diff * eased);
      setDisplay(current);

      if (progress < 1) {
        frameRef.current = requestAnimationFrame(step);
      }
    }

    frameRef.current = requestAnimationFrame(step);

    return () => {
      cancelAnimationFrame(frameRef.current);
    };
  }, [target, duration]);

  return display;
}

const trendConfig = {
  up: {
    icon: TrendingUp,
    color: 'text-green-500',
    bg: 'bg-green-50 dark:bg-green-900/20',
  },
  down: {
    icon: TrendingDown,
    color: 'text-red-500',
    bg: 'bg-red-50 dark:bg-red-900/20',
  },
  stable: {
    icon: Minus,
    color: 'text-gray-400',
    bg: 'bg-gray-50 dark:bg-gray-800',
  },
};

export default function LiveCounter({ value, label, icon, trend }: LiveCounterProps) {
  const animatedValue = useAnimatedValue(value);
  const trendInfo = trend ? trendConfig[trend] : null;

  return (
    <div className="card flex items-center gap-4">
      {icon && (
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
          {icon}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-2xl font-bold tabular-nums text-gray-900 dark:text-gray-50">
          {animatedValue.toLocaleString()}
        </p>
        <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
      </div>
      {trendInfo && (
        <div className={cn('flex h-8 w-8 items-center justify-center rounded-full', trendInfo.bg)}>
          <trendInfo.icon className={cn('h-4 w-4', trendInfo.color)} />
        </div>
      )}
    </div>
  );
}
