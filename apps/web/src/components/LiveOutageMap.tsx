'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import type { MapReportEvent } from '@/lib/websocket';
import { useWebSocket } from '@/lib/websocket';

// ---------------------------------------------------------------------------
// Simplified world map path data (continents outline as SVG path)
// ---------------------------------------------------------------------------

const WORLD_MAP_PATHS = [
  // North America
  'M 60 55 L 75 45 L 100 40 L 130 42 L 145 55 L 140 70 L 125 80 L 110 95 L 95 110 L 80 105 L 65 90 L 55 75 Z',
  // South America
  'M 110 120 L 120 115 L 135 125 L 140 145 L 135 170 L 125 190 L 115 195 L 105 185 L 100 165 L 105 140 Z',
  // Europe
  'M 220 40 L 240 35 L 260 40 L 265 55 L 255 65 L 240 60 L 225 55 Z',
  // Africa
  'M 220 75 L 240 70 L 260 75 L 270 90 L 265 115 L 255 140 L 240 150 L 225 145 L 215 125 L 210 100 L 215 85 Z',
  // Asia
  'M 265 30 L 300 25 L 340 30 L 370 40 L 380 55 L 370 70 L 350 80 L 330 75 L 310 70 L 290 65 L 275 55 L 270 45 Z',
  // Oceania
  'M 345 130 L 370 125 L 390 130 L 395 145 L 385 155 L 365 155 L 350 150 L 345 140 Z',
];

interface LiveOutageMapProps {
  readonly reports?: MapReportEvent[];
  readonly width?: number;
  readonly height?: number;
}

interface Dot {
  x: number;
  y: number;
  type: 'outage' | 'degraded' | 'investigating';
  intensity: number;
  serviceName: string;
  age: number;
  pulsePhase: number;
}

const TYPE_COLORS: Record<string, { r: number; g: number; b: number }> = {
  outage: { r: 239, g: 68, b: 68 },
  degraded: { r: 249, g: 115, b: 22 },
  investigating: { r: 234, g: 179, b: 8 },
};

const MAX_DOTS = 500;

function latLngToXY(lat: number, lng: number, width: number, height: number): { x: number; y: number } {
  const x = ((lng + 180) / 360) * width;
  const y = ((90 - lat) / 180) * height;
  return { x, y };
}

export default function LiveOutageMap({ reports: externalReports, width: propWidth, height: propHeight }: LiveOutageMapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dotsRef = useRef<Dot[]>([]);
  const animFrameRef = useRef<number>(0);
  const [dimensions, setDimensions] = useState({ width: propWidth ?? 800, height: propHeight ?? 400 });

  // Subscribe to live data
  const { data: liveReport } = useWebSocket<MapReportEvent>('map:reports');

  // Handle resize
  useEffect(() => {
    if (propWidth && propHeight) {
      setDimensions({ width: propWidth, height: propHeight });
      return;
    }

    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = entry.contentRect.width;
        const h = Math.max(Math.round(w * 0.5), 300);
        setDimensions({ width: w, height: h });
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, [propWidth, propHeight]);

  // Add external reports as dots
  useEffect(() => {
    if (!externalReports) return;
    const { width, height } = dimensions;

    for (const report of externalReports) {
      const { x, y } = latLngToXY(report.lat, report.lng, width, height);
      dotsRef.current.push({
        x,
        y,
        type: report.type,
        intensity: report.intensity,
        serviceName: report.serviceName,
        age: 0,
        pulsePhase: Math.random() * Math.PI * 2,
      });
    }

    if (dotsRef.current.length > MAX_DOTS) {
      dotsRef.current = dotsRef.current.slice(-MAX_DOTS);
    }
  }, [externalReports, dimensions]);

  // Add live WebSocket reports as dots
  useEffect(() => {
    if (!liveReport) return;
    const { width, height } = dimensions;
    const { x, y } = latLngToXY(liveReport.lat, liveReport.lng, width, height);

    dotsRef.current.push({
      x,
      y,
      type: liveReport.type,
      intensity: liveReport.intensity,
      serviceName: liveReport.serviceName,
      age: 0,
      pulsePhase: Math.random() * Math.PI * 2,
    });

    if (dotsRef.current.length > MAX_DOTS) {
      dotsRef.current = dotsRef.current.slice(-MAX_DOTS);
    }
  }, [liveReport, dimensions]);

  // Render loop
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height } = dimensions;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    // Background
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, width, height);

    // Draw grid lines
    ctx.strokeStyle = 'rgba(51, 65, 85, 0.3)';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 12; i++) {
      const x = (i / 12) * width;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let i = 0; i <= 6; i++) {
      const y = (i / 6) * height;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Draw continents
    const scaleX = width / 430;
    const scaleY = height / 220;

    ctx.fillStyle = 'rgba(30, 58, 95, 0.6)';
    ctx.strokeStyle = 'rgba(71, 85, 105, 0.5)';
    ctx.lineWidth = 1;

    for (const pathStr of WORLD_MAP_PATHS) {
      const path = new Path2D();
      const parts = pathStr.split(/\s+/);
      let i = 0;
      while (i < parts.length) {
        const cmd = parts[i];
        if (cmd === 'M' || cmd === 'L') {
          const px = parseFloat(parts[i + 1]) * scaleX;
          const py = parseFloat(parts[i + 2]) * scaleY;
          if (cmd === 'M') {
            path.moveTo(px, py);
          } else {
            path.lineTo(px, py);
          }
          i += 3;
        } else if (cmd === 'Z') {
          path.closePath();
          i++;
        } else {
          i++;
        }
      }
      ctx.fill(path);
      ctx.stroke(path);
    }

    // Draw heatmap clusters
    const dots = dotsRef.current;
    const now = performance.now();

    // Simple clustering for heatmap effect
    const gridSize = 20;
    const clusters = new Map<string, { x: number; y: number; count: number; type: string }>();
    for (const dot of dots) {
      const gx = Math.floor(dot.x / gridSize);
      const gy = Math.floor(dot.y / gridSize);
      const key = `${gx},${gy}`;
      const existing = clusters.get(key);
      if (existing) {
        existing.count++;
        existing.x = (existing.x + dot.x) / 2;
        existing.y = (existing.y + dot.y) / 2;
      } else {
        clusters.set(key, { x: dot.x, y: dot.y, count: 1, type: dot.type });
      }
    }

    // Draw heatmap blobs for clusters
    for (const cluster of clusters.values()) {
      if (cluster.count < 2) continue;
      const color = TYPE_COLORS[cluster.type] ?? TYPE_COLORS.outage;
      const radius = Math.min(8 + cluster.count * 3, 40);
      const alpha = Math.min(0.1 + cluster.count * 0.05, 0.4);

      const gradient = ctx.createRadialGradient(
        cluster.x, cluster.y, 0,
        cluster.x, cluster.y, radius,
      );
      gradient.addColorStop(0, `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha})`);
      gradient.addColorStop(1, `rgba(${color.r}, ${color.g}, ${color.b}, 0)`);

      ctx.beginPath();
      ctx.arc(cluster.x, cluster.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = gradient;
      ctx.fill();
    }

    // Draw individual dots with pulse
    for (const dot of dots) {
      dot.age++;
      const color = TYPE_COLORS[dot.type] ?? TYPE_COLORS.outage;
      const pulse = Math.sin(now / 800 + dot.pulsePhase) * 0.3 + 0.7;
      const baseRadius = 3 + dot.intensity * 2;

      // Outer pulse ring
      const pulseRadius = baseRadius + pulse * 4;
      ctx.beginPath();
      ctx.arc(dot.x, dot.y, pulseRadius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${0.15 * pulse})`;
      ctx.fill();

      // Inner dot
      ctx.beginPath();
      ctx.arc(dot.x, dot.y, baseRadius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${0.7 + pulse * 0.3})`;
      ctx.fill();

      // Center bright spot
      ctx.beginPath();
      ctx.arc(dot.x, dot.y, baseRadius * 0.4, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 255, 255, ${0.4 + pulse * 0.3})`;
      ctx.fill();
    }

    animFrameRef.current = requestAnimationFrame(render);
  }, [dimensions]);

  useEffect(() => {
    animFrameRef.current = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(animFrameRef.current);
    };
  }, [render]);

  return (
    <div ref={containerRef} className="relative w-full overflow-hidden rounded-xl border border-gray-700 bg-slate-900">
      <canvas
        ref={canvasRef}
        style={{ width: dimensions.width, height: dimensions.height }}
        className="block"
      />
      {/* Legend */}
      <div className="absolute bottom-3 left-3 flex items-center gap-4 rounded-lg bg-slate-900/80 px-3 py-2 text-xs text-gray-300 backdrop-blur">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-red-500" />
          Outage
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-orange-500" />
          Degraded
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-yellow-500" />
          Investigating
        </span>
      </div>
    </div>
  );
}
