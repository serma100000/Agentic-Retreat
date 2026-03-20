'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { AlertTriangle, Clock, MapPin, ArrowLeft, ExternalLink, RefreshCw } from 'lucide-react';
import StatusBadge from '@/components/StatusBadge';
import SignalBreakdown from '@/components/SignalBreakdown';
import RegionMap from '@/components/RegionMap';
import OutageTimeline from '@/components/OutageTimeline';
import ConnectionStatus from '@/components/ConnectionStatus';
import { useWebSocket } from '@/lib/websocket';
import { cn } from '@/lib/utils';
import { formatDate, formatDuration, formatConfidence } from '@/lib/utils';
import type { Signal } from '@/components/SignalBreakdown';
import type { RegionInfo } from '@/components/RegionMap';
import type { TimelineEvent } from '@/components/OutageTimeline';

interface OutageDetail {
  id: string;
  serviceId: string;
  serviceName: string;
  serviceSlug: string;
  state: string;
  severity: string;
  title: string;
  summary: string;
  confidence: number;
  affectedRegions: string[];
  startedAt: string;
  resolvedAt: string | null;
  reportCount: number;
  signals: Signal[];
  regions: RegionInfo[];
  timeline: TimelineEvent[];
}

// Mock data for when the API is unavailable
function getMockOutage(id: string): OutageDetail {
  return {
    id,
    serviceId: 'aws',
    serviceName: 'Amazon Web Services',
    serviceSlug: 'aws',
    state: 'confirmed',
    severity: 'major',
    title: 'Elevated error rates in EC2 and Lambda - US-East-1',
    summary:
      'Multiple AWS services experiencing elevated error rates in the US-East-1 region. EC2 instance launches and Lambda invocations are affected. The AWS team has identified the root cause and is working on remediation.',
    confidence: 0.92,
    affectedRegions: ['us-east-1', 'us-east-2'],
    startedAt: new Date(Date.now() - 45 * 60000).toISOString(),
    resolvedAt: null,
    reportCount: 847,
    signals: [
      { source: 'reports', score: 0.85, confidence: 0.94 },
      { source: 'probes', score: 0.72, confidence: 0.88 },
      { source: 'social', score: 0.45, confidence: 0.71 },
      { source: 'statuspage', score: 0.9, confidence: 0.95 },
      { source: 'ml', score: 0.55, confidence: 0.78 },
    ],
    regions: [
      { code: 'us-east-1', status: 'major_outage', probeLatency: 2450 },
      { code: 'us-east-2', status: 'degraded', probeLatency: 380 },
      { code: 'us-west-1', status: 'operational', probeLatency: 45 },
      { code: 'us-west-2', status: 'operational', probeLatency: 52 },
      { code: 'eu-west-1', status: 'operational', probeLatency: 120 },
      { code: 'eu-central-1', status: 'operational', probeLatency: 135 },
      { code: 'ap-southeast-1', status: 'operational', probeLatency: 210 },
      { code: 'ap-northeast-1', status: 'operational', probeLatency: 180 },
    ],
    timeline: [
      {
        id: 'evt-1',
        state: 'investigating',
        description: 'Elevated error rates detected by automated probes in US-East-1.',
        occurredAt: new Date(Date.now() - 45 * 60000).toISOString(),
        source: 'probe-monitor',
        signals: [
          { detector: 'HTTP Probe', score: 0.6 },
          { detector: 'DNS Check', score: 0.4 },
        ],
      },
      {
        id: 'evt-2',
        state: 'suspected',
        description: 'User reports surging. 200+ reports received in 5 minutes. Social media mentions increasing.',
        occurredAt: new Date(Date.now() - 40 * 60000).toISOString(),
        source: 'report-aggregator',
        signals: [
          { detector: 'Report Spike', score: 0.85 },
          { detector: 'Twitter Monitor', score: 0.55 },
        ],
      },
      {
        id: 'evt-3',
        state: 'confirmed',
        description: 'AWS Health Dashboard updated: "We are investigating increased error rates for EC2 RunInstances API calls in the US-EAST-1 Region."',
        occurredAt: new Date(Date.now() - 35 * 60000).toISOString(),
        source: 'statuspage-monitor',
      },
      {
        id: 'evt-4',
        state: 'confirmed',
        description: 'Impact expanded to Lambda. Invocations in US-East-1 experiencing timeouts and throttling.',
        occurredAt: new Date(Date.now() - 25 * 60000).toISOString(),
        source: 'probe-monitor',
        signals: [
          { detector: 'Lambda Probe', score: 0.9 },
        ],
      },
      {
        id: 'evt-5',
        state: 'monitoring',
        description: 'AWS reports root cause identified. Mitigation in progress. Error rates beginning to decrease.',
        occurredAt: new Date(Date.now() - 10 * 60000).toISOString(),
        source: 'statuspage-monitor',
      },
    ],
  };
}

function getDurationText(startedAt: string, resolvedAt: string | null): string {
  const start = new Date(startedAt);
  const end = resolvedAt ? new Date(resolvedAt) : new Date();
  const diffMs = end.getTime() - start.getTime();
  const minutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (hours > 0) {
    return `${hours}h ${remainingMinutes}m`;
  }
  return `${minutes}m`;
}

export default function OutageDetailPage() {
  const params = useParams();
  const outageId = params.id as string;
  const [outage, setOutage] = useState<OutageDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Real-time updates
  const { data: liveUpdate } = useWebSocket<Partial<OutageDetail>>(`outages:${outageId}`);

  // Fetch initial data
  useEffect(() => {
    async function fetchOutage() {
      setLoading(true);
      setError(null);

      try {
        const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
        const response = await fetch(`${baseUrl}/api/v1/outages/${encodeURIComponent(outageId)}`);

        if (!response.ok) {
          throw new Error(`Failed to fetch outage: ${response.status}`);
        }

        const body = await response.json();
        setOutage(body.data);
      } catch {
        // Fall back to mock data
        setOutage(getMockOutage(outageId));
      } finally {
        setLoading(false);
      }
    }

    fetchOutage();
  }, [outageId]);

  // Apply real-time updates
  useEffect(() => {
    if (!liveUpdate || !outage) return;
    setOutage((prev) => (prev ? { ...prev, ...liveUpdate } : prev));
  }, [liveUpdate, outage]);

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="animate-pulse space-y-6">
          <div className="h-8 w-64 rounded-lg bg-gray-200 dark:bg-gray-700" />
          <div className="h-4 w-96 rounded-lg bg-gray-200 dark:bg-gray-700" />
          <div className="grid grid-cols-3 gap-4">
            <div className="h-24 rounded-lg bg-gray-200 dark:bg-gray-700" />
            <div className="h-24 rounded-lg bg-gray-200 dark:bg-gray-700" />
            <div className="h-24 rounded-lg bg-gray-200 dark:bg-gray-700" />
          </div>
          <div className="h-64 rounded-lg bg-gray-200 dark:bg-gray-700" />
        </div>
      </div>
    );
  }

  if (error && !outage) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="rounded-xl border border-red-200 bg-red-50 p-8 text-center dark:border-red-800 dark:bg-red-900/20">
          <AlertTriangle className="mx-auto mb-3 h-10 w-10 text-red-500" />
          <p className="text-red-700 dark:text-red-400">{error}</p>
        </div>
      </div>
    );
  }

  if (!outage) return null;

  const severityBorder: Record<string, string> = {
    minor: 'border-l-yellow-400',
    moderate: 'border-l-orange-400',
    major: 'border-l-red-500',
    critical: 'border-l-red-700',
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Back link */}
      <div className="mb-6 flex items-center justify-between">
        <a
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 transition-colors hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </a>
        <ConnectionStatus />
      </div>

      {/* Header */}
      <div className={cn('rounded-xl border border-l-4 bg-white p-6 dark:bg-gray-900', severityBorder[outage.severity] ?? 'border-l-gray-400', 'border-gray-200 dark:border-gray-700')}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 shrink-0 text-red-500" />
              <h1 className="text-xl font-bold text-gray-900 dark:text-gray-50">
                {outage.serviceName}
              </h1>
              <StatusBadge
                status={outage.state as 'confirmed' | 'suspected' | 'monitoring' | 'resolving' | 'resolved'}
                size="md"
              />
            </div>
            <p className="mt-2 text-gray-600 dark:text-gray-400">
              {outage.title}
            </p>
            {outage.summary && (
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                {outage.summary}
              </p>
            )}
          </div>
          <a
            href={`/services/${outage.serviceSlug}`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            Service Page
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>

        {/* Meta info */}
        <div className="mt-4 flex flex-wrap items-center gap-6 border-t border-gray-100 pt-4 text-sm text-gray-500 dark:border-gray-800 dark:text-gray-400">
          <span className="inline-flex items-center gap-1.5">
            <Clock className="h-4 w-4" />
            Started {formatDuration(outage.startedAt)}
            <span className="text-xs text-gray-400">({formatDate(outage.startedAt)})</span>
          </span>
          {outage.resolvedAt && (
            <span className="inline-flex items-center gap-1.5">
              <RefreshCw className="h-4 w-4 text-green-500" />
              Resolved {formatDate(outage.resolvedAt)}
            </span>
          )}
          <span className="inline-flex items-center gap-1.5">
            <span className="font-medium text-gray-700 dark:text-gray-300">Duration:</span>
            {getDurationText(outage.startedAt, outage.resolvedAt)}
          </span>
          {outage.affectedRegions.length > 0 && (
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="h-4 w-4" />
              {outage.affectedRegions.join(', ')}
            </span>
          )}
          <span>
            <span className="font-medium text-gray-700 dark:text-gray-300">Reports:</span>{' '}
            {outage.reportCount}
          </span>
        </div>
      </div>

      {/* Confidence + Signals */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-900">
          <h2 className="mb-1 text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
            Confidence Score
          </h2>
          <div className="mb-4 flex items-baseline gap-2">
            <span className="text-4xl font-bold text-gray-900 dark:text-gray-50">
              {formatConfidence(outage.confidence)}
            </span>
            <span className="text-sm text-gray-500 dark:text-gray-400">overall</span>
          </div>
          <SignalBreakdown signals={outage.signals} />
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-900">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
            Region Status
          </h2>
          <RegionMap regions={outage.regions} />
        </div>
      </div>

      {/* Timeline */}
      <div className="mt-6 rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-900">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          Outage Timeline
        </h2>
        <OutageTimeline events={outage.timeline} />
      </div>
    </div>
  );
}
