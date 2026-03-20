/**
 * Types for the OpenPulse infrastructure layer.
 *
 * Covers health checks, system metrics, benchmarking,
 * caching, rate limiting, and circuit breaker configuration.
 */

export const HealthStatus = {
  HEALTHY: 'healthy',
  DEGRADED: 'degraded',
  DOWN: 'down',
} as const;

export type HealthStatusType = (typeof HealthStatus)[keyof typeof HealthStatus];

export interface HealthCheck {
  service: string;
  status: HealthStatusType;
  latencyMs: number;
  lastCheckedAt: Date;
  details?: Record<string, unknown>;
}

export interface SystemMetrics {
  cpu: number;
  memory: number;
  diskUsage: number;
  activeConnections: number;
  requestsPerSec: number;
  errorRate: number;
  kafkaLag: number;
}

export interface BenchmarkResult {
  name: string;
  operation: string;
  opsPerSec: number;
  avgLatencyMs: number;
  p50: number;
  p95: number;
  p99: number;
  maxLatency: number;
  samples: number;
}

export interface CacheConfig {
  maxSize: number;
  ttlMs: number;
  strategy: 'lru' | 'lfu';
}

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  keyPrefix: string;
}

export interface CircuitBreakerConfig {
  failureThreshold: number;
  resetTimeoutMs: number;
  halfOpenMaxCalls: number;
}

export type CircuitBreakerState = 'closed' | 'open' | 'half-open';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
}

export interface CircuitBreakerStats {
  state: CircuitBreakerState;
  failures: number;
  successes: number;
  lastFailure: Date | null;
  lastSuccess: Date | null;
}

export interface CacheStats {
  l1Hits: number;
  l1Misses: number;
  l2Hits: number;
  l2Misses: number;
  hitRate: number;
}

export interface HealthCheckReport {
  status: HealthStatusType;
  services: HealthCheck[];
  uptime: number;
  version: string;
}

export interface BenchmarkOptions {
  iterations: number;
  warmup: number;
}

export interface BenchmarkComparison {
  regression: boolean;
  improvement: boolean;
  delta: number;
}
