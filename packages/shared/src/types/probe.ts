/**
 * Probe-related types for OpenPulse.
 * Represents health check probes and their results.
 */

import type { ServiceRegion } from './service.js';

export type ProbeType = 'http' | 'tcp' | 'icmp' | 'dns' | 'tls';

export type ProbeStatus = 'healthy' | 'degraded' | 'unhealthy' | 'timeout' | 'error';

export interface VantagePoint {
  readonly id: string;
  readonly name: string;
  readonly region: ServiceRegion;
  readonly provider: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly isActive: boolean;
}

export interface Probe {
  readonly id: string;
  readonly serviceId: string;
  readonly endpointUrl: string;
  readonly type: ProbeType;
  readonly intervalMs: number;
  readonly timeoutMs: number;
  readonly retries: number;
  readonly vantagePointId: string;
  readonly isActive: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface ProbeResult {
  readonly id: string;
  readonly probeId: string;
  readonly serviceId: string;
  readonly vantagePointId: string;
  readonly status: ProbeStatus;
  readonly responseTimeMs: number | null;
  readonly statusCode: number | null;
  readonly errorMessage: string | null;
  readonly tlsCertExpiresAt: Date | null;
  readonly dnsResolvedIps: readonly string[] | null;
  readonly checkedAt: Date;
}

export interface ProbeResultAggregation {
  readonly probeId: string;
  readonly serviceId: string;
  readonly region: ServiceRegion;
  readonly totalChecks: number;
  readonly healthyCount: number;
  readonly degradedCount: number;
  readonly unhealthyCount: number;
  readonly avgResponseTimeMs: number;
  readonly p95ResponseTimeMs: number;
  readonly p99ResponseTimeMs: number;
  readonly uptimePercent: number;
  readonly windowStart: Date;
  readonly windowEnd: Date;
}
