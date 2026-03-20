'use client';

import { useState, useEffect } from 'react';
import { Activity, AlertTriangle, BarChart3, Radio } from 'lucide-react';
import LiveOutageMap from '@/components/LiveOutageMap';
import ConnectionStatus from '@/components/ConnectionStatus';
import { useWebSocket, useGlobalStats } from '@/lib/websocket';
import type { MapReportEvent, Outage } from '@/lib/websocket';
import { cn } from '@/lib/utils';

// Seed the map with sample data for demonstration
function generateSampleReports(): MapReportEvent[] {
  const types: Array<'outage' | 'degraded' | 'investigating'> = [
    'outage',
    'degraded',
    'investigating',
  ];

  const hotspots = [
    { lat: 37.7749, lng: -122.4194, name: 'AWS US-West-2' },
    { lat: 39.0438, lng: -77.4874, name: 'AWS US-East-1' },
    { lat: 51.5074, lng: -0.1278, name: 'Azure UK South' },
    { lat: 50.1109, lng: 8.6821, name: 'AWS EU-Central-1' },
    { lat: 35.6762, lng: 139.6503, name: 'GCP Asia-NE1' },
    { lat: 1.3521, lng: 103.8198, name: 'AWS AP-SE-1' },
    { lat: -33.8688, lng: 151.2093, name: 'Azure Australia East' },
    { lat: 19.076, lng: 72.8777, name: 'AWS AP-South-1' },
  ];

  const reports: MapReportEvent[] = [];

  for (const hotspot of hotspots) {
    const count = Math.floor(Math.random() * 8) + 2;
    for (let i = 0; i < count; i++) {
      reports.push({
        id: `sample-${hotspot.name}-${i}`,
        lat: hotspot.lat + (Math.random() - 0.5) * 5,
        lng: hotspot.lng + (Math.random() - 0.5) * 5,
        type: types[Math.floor(Math.random() * types.length)],
        serviceName: hotspot.name,
        timestamp: new Date(Date.now() - Math.random() * 3600000).toISOString(),
        intensity: Math.random() * 0.8 + 0.2,
      });
    }
  }

  return reports;
}

const SAMPLE_OUTAGES: Outage[] = [
  {
    id: '1',
    serviceId: 'aws',
    serviceName: 'AWS US-East-1',
    state: 'confirmed',
    severity: 'major',
    title: 'Elevated error rates in EC2 and Lambda',
    confidence: 0.92,
    affectedRegions: ['us-east-1'],
    startedAt: new Date(Date.now() - 45 * 60000).toISOString(),
    resolvedAt: null,
    reportCount: 847,
  },
  {
    id: '2',
    serviceId: 'cloudflare',
    serviceName: 'Cloudflare',
    state: 'suspected',
    severity: 'moderate',
    title: 'Intermittent 522 errors in EU regions',
    confidence: 0.67,
    affectedRegions: ['eu-west-1', 'eu-central-1'],
    startedAt: new Date(Date.now() - 15 * 60000).toISOString(),
    resolvedAt: null,
    reportCount: 213,
  },
  {
    id: '3',
    serviceId: 'github',
    serviceName: 'GitHub',
    state: 'monitoring',
    severity: 'minor',
    title: 'Degraded performance on Actions',
    confidence: 0.54,
    affectedRegions: ['us-west-2'],
    startedAt: new Date(Date.now() - 120 * 60000).toISOString(),
    resolvedAt: null,
    reportCount: 126,
  },
];

const stateColors: Record<string, string> = {
  confirmed: 'bg-red-500',
  suspected: 'bg-yellow-500',
  monitoring: 'bg-blue-500',
  resolving: 'bg-blue-400',
  resolved: 'bg-green-500',
};

export default function MapPage() {
  const [sampleReports] = useState(generateSampleReports);
  const stats = useGlobalStats();
  const { data: liveOutage } = useWebSocket<Outage>('outages:*');
  const [outages, setOutages] = useState<Outage[]>(SAMPLE_OUTAGES);

  useEffect(() => {
    if (!liveOutage) return;
    setOutages((prev) => {
      const idx = prev.findIndex((o) => o.id === liveOutage.id);
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = liveOutage;
        return updated;
      }
      return [liveOutage, ...prev];
    });
  }, [liveOutage]);

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col lg:flex-row">
      {/* Map area */}
      <div className="flex-1 p-4 lg:p-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900 dark:text-gray-50">
              <Radio className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              Live Outage Map
            </h1>
            <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
              Real-time visualization of global outage reports
            </p>
          </div>
          <ConnectionStatus />
        </div>

        <LiveOutageMap reports={sampleReports} />

        {/* Stats overlay */}
        <div className="mt-4 grid grid-cols-3 gap-3">
          <div className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-purple-500" />
              <span className="text-xs text-gray-500 dark:text-gray-400">Reports (1h)</span>
            </div>
            <p className="mt-1 text-xl font-bold text-gray-900 dark:text-gray-50">
              {stats?.reportsLastHour ?? 1186}
            </p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-500" />
              <span className="text-xs text-gray-500 dark:text-gray-400">Active Outages</span>
            </div>
            <p className="mt-1 text-xl font-bold text-gray-900 dark:text-gray-50">
              {stats?.activeOutages ?? outages.length}
            </p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-green-500" />
              <span className="text-xs text-gray-500 dark:text-gray-400">Monitored</span>
            </div>
            <p className="mt-1 text-xl font-bold text-gray-900 dark:text-gray-50">
              {stats?.monitoredServices ?? 142}
            </p>
          </div>
        </div>
      </div>

      {/* Sidebar: active outages list */}
      <aside className="w-full border-t border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-900/50 lg:w-80 lg:border-l lg:border-t-0 lg:p-6">
        <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          <AlertTriangle className="h-4 w-4" />
          Active Outages
          <span className="ml-auto rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700 dark:bg-red-900/30 dark:text-red-400">
            {outages.length}
          </span>
        </h2>

        <div className="space-y-3">
          {outages.map((outage) => (
            <a
              key={outage.id}
              href={`/outages/${outage.id}`}
              className="block rounded-lg border border-gray-200 bg-white p-3 transition-shadow hover:shadow-md dark:border-gray-700 dark:bg-gray-900"
            >
              <div className="flex items-start gap-2">
                <span className={cn('mt-1 h-2 w-2 shrink-0 rounded-full', stateColors[outage.state] ?? 'bg-gray-400')} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    {outage.serviceName}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-600 dark:text-gray-400">
                    {outage.title}
                  </p>
                  <div className="mt-2 flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                    <span>{outage.reportCount} reports</span>
                    <span>{Math.round(outage.confidence * 100)}% confidence</span>
                  </div>
                </div>
              </div>
            </a>
          ))}
        </div>
      </aside>
    </div>
  );
}
