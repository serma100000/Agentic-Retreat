'use client';

import { useEffect, useState } from 'react';

interface UptimeGaugeProps {
  readonly value: number;
  readonly target?: number;
  readonly size?: number;
}

export default function UptimeGauge({ value, target = 99.9, size = 160 }: UptimeGaugeProps) {
  const [animatedValue, setAnimatedValue] = useState(0);

  useEffect(() => {
    const duration = 1200;
    const startTime = performance.now();

    function animate(currentTime: number) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setAnimatedValue(eased * value);

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    }

    requestAnimationFrame(animate);
  }, [value]);

  const strokeWidth = size * 0.08;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (animatedValue / 100) * circumference;
  const center = size / 2;
  const meetsTarget = value >= target;
  const strokeColor = meetsTarget ? '#22c55e' : '#ef4444';
  const trackColor = meetsTarget
    ? 'rgba(34, 197, 94, 0.15)'
    : 'rgba(239, 68, 68, 0.15)';

  return (
    <div className="inline-flex flex-col items-center gap-2">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
      >
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={trackColor}
          strokeWidth={strokeWidth}
        />
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-[stroke-dashoffset] duration-100 ease-out"
        />
      </svg>
      <div
        className="absolute flex flex-col items-center justify-center"
        style={{ width: size, height: size }}
      >
        <span
          className="font-bold tabular-nums"
          style={{
            fontSize: size * 0.18,
            color: strokeColor,
          }}
        >
          {animatedValue.toFixed(2)}%
        </span>
        <span
          className="text-gray-500 dark:text-gray-400"
          style={{ fontSize: size * 0.08 }}
        >
          Target: {target}%
        </span>
      </div>
    </div>
  );
}
