/**
 * Application metrics collection for OpenPulse.
 *
 * Provides in-process counters, gauges, and histograms
 * with Prometheus text format export.
 */

import type { SystemMetrics } from './types.js';

const HISTOGRAM_BUCKETS = [1, 5, 10, 25, 50, 100, 250, 500, 1000, 5000];

interface HistogramData {
  sum: number;
  count: number;
  buckets: Map<number, number>;
}

export class MetricsCollector {
  // Counters
  private requestsTotal = 0;
  private errorsTotal = 0;
  private cacheHitsL1 = 0;
  private cacheHitsL2 = 0;
  private cacheMissesL1 = 0;
  private cacheMissesL2 = 0;

  // Gauges
  private activeConnections = 0;
  private kafkaLagByTopic = new Map<string, number>();

  // Histograms
  private requestDuration: HistogramData;
  private detectionLatency = new Map<string, HistogramData>();

  // Request tracking for rate computation
  private requestTimestamps: number[] = [];
  private errorTimestamps: number[] = [];

  // Method + path + status tracking
  private requestsByRoute = new Map<string, number>();

  constructor() {
    this.requestDuration = this.createHistogram();
  }

  recordRequest(
    method: string,
    path: string,
    statusCode: number,
    durationMs: number,
  ): void {
    this.requestsTotal++;
    const now = Date.now();
    this.requestTimestamps.push(now);

    if (statusCode >= 400) {
      this.errorsTotal++;
      this.errorTimestamps.push(now);
    }

    this.recordHistogramValue(this.requestDuration, durationMs);

    const routeKey = `${method}:${path}:${statusCode}`;
    this.requestsByRoute.set(
      routeKey,
      (this.requestsByRoute.get(routeKey) ?? 0) + 1,
    );
  }

  recordKafkaLag(topic: string, lag: number): void {
    this.kafkaLagByTopic.set(topic, lag);
  }

  recordDetectionLatency(layer: string, durationMs: number): void {
    let histogram = this.detectionLatency.get(layer);
    if (!histogram) {
      histogram = this.createHistogram();
      this.detectionLatency.set(layer, histogram);
    }
    this.recordHistogramValue(histogram, durationMs);
  }

  recordCacheHit(layer: 'l1' | 'l2', hit: boolean): void {
    if (layer === 'l1') {
      if (hit) this.cacheHitsL1++;
      else this.cacheMissesL1++;
    } else {
      if (hit) this.cacheHitsL2++;
      else this.cacheMissesL2++;
    }
  }

  setActiveConnections(count: number): void {
    this.activeConnections = count;
  }

  getMetrics(): SystemMetrics {
    const now = Date.now();
    const oneSecondAgo = now - 1000;

    // Clean old timestamps (keep last 60s for rate calculation)
    const sixtySecondsAgo = now - 60_000;
    this.requestTimestamps = this.requestTimestamps.filter(
      (ts) => ts > sixtySecondsAgo,
    );
    this.errorTimestamps = this.errorTimestamps.filter(
      (ts) => ts > sixtySecondsAgo,
    );

    const recentRequests = this.requestTimestamps.filter(
      (ts) => ts > oneSecondAgo,
    ).length;
    const recentErrors = this.errorTimestamps.filter(
      (ts) => ts > oneSecondAgo,
    ).length;

    let totalKafkaLag = 0;
    for (const lag of this.kafkaLagByTopic.values()) {
      totalKafkaLag += lag;
    }

    return {
      cpu: 0, // Must be collected from OS-level metrics
      memory: 0,
      diskUsage: 0,
      activeConnections: this.activeConnections,
      requestsPerSec: recentRequests,
      errorRate: recentRequests > 0 ? recentErrors / recentRequests : 0,
      kafkaLag: totalKafkaLag,
    };
  }

  getPrometheusMetrics(): string {
    const lines: string[] = [];

    // Counters
    lines.push('# HELP openpulse_requests_total Total HTTP requests');
    lines.push('# TYPE openpulse_requests_total counter');
    lines.push(`openpulse_requests_total ${this.requestsTotal}`);

    lines.push('# HELP openpulse_errors_total Total HTTP errors');
    lines.push('# TYPE openpulse_errors_total counter');
    lines.push(`openpulse_errors_total ${this.errorsTotal}`);

    lines.push('# HELP openpulse_cache_hits_total Cache hits by layer');
    lines.push('# TYPE openpulse_cache_hits_total counter');
    lines.push(`openpulse_cache_hits_total{layer="l1"} ${this.cacheHitsL1}`);
    lines.push(`openpulse_cache_hits_total{layer="l2"} ${this.cacheHitsL2}`);

    lines.push('# HELP openpulse_cache_misses_total Cache misses by layer');
    lines.push('# TYPE openpulse_cache_misses_total counter');
    lines.push(`openpulse_cache_misses_total{layer="l1"} ${this.cacheMissesL1}`);
    lines.push(`openpulse_cache_misses_total{layer="l2"} ${this.cacheMissesL2}`);

    // Gauges
    lines.push('# HELP openpulse_active_connections Current active connections');
    lines.push('# TYPE openpulse_active_connections gauge');
    lines.push(`openpulse_active_connections ${this.activeConnections}`);

    lines.push('# HELP openpulse_kafka_consumer_lag Kafka consumer lag by topic');
    lines.push('# TYPE openpulse_kafka_consumer_lag gauge');
    for (const [topic, lag] of this.kafkaLagByTopic) {
      lines.push(`openpulse_kafka_consumer_lag{topic="${topic}"} ${lag}`);
    }

    // Request duration histogram
    lines.push('# HELP openpulse_request_duration_ms HTTP request duration');
    lines.push('# TYPE openpulse_request_duration_ms histogram');
    for (const bucket of HISTOGRAM_BUCKETS) {
      const count = this.requestDuration.buckets.get(bucket) ?? 0;
      lines.push(`openpulse_request_duration_ms_bucket{le="${bucket}"} ${count}`);
    }
    lines.push(`openpulse_request_duration_ms_bucket{le="+Inf"} ${this.requestDuration.count}`);
    lines.push(`openpulse_request_duration_ms_sum ${this.requestDuration.sum}`);
    lines.push(`openpulse_request_duration_ms_count ${this.requestDuration.count}`);

    // Detection latency histograms
    lines.push('# HELP openpulse_detection_latency_ms Detection latency by layer');
    lines.push('# TYPE openpulse_detection_latency_ms histogram');
    for (const [layer, histogram] of this.detectionLatency) {
      for (const bucket of HISTOGRAM_BUCKETS) {
        const count = histogram.buckets.get(bucket) ?? 0;
        lines.push(
          `openpulse_detection_latency_ms_bucket{layer="${layer}",le="${bucket}"} ${count}`,
        );
      }
      lines.push(
        `openpulse_detection_latency_ms_bucket{layer="${layer}",le="+Inf"} ${histogram.count}`,
      );
      lines.push(`openpulse_detection_latency_ms_sum{layer="${layer}"} ${histogram.sum}`);
      lines.push(`openpulse_detection_latency_ms_count{layer="${layer}"} ${histogram.count}`);
    }

    // Per-route request counts
    lines.push('# HELP openpulse_requests_by_route Requests by method/path/status');
    lines.push('# TYPE openpulse_requests_by_route counter');
    for (const [routeKey, count] of this.requestsByRoute) {
      const [method, path, status] = routeKey.split(':');
      lines.push(
        `openpulse_requests_by_route{method="${method}",path="${path}",status="${status}"} ${count}`,
      );
    }

    return lines.join('\n') + '\n';
  }

  private createHistogram(): HistogramData {
    const buckets = new Map<number, number>();
    for (const b of HISTOGRAM_BUCKETS) {
      buckets.set(b, 0);
    }
    return { sum: 0, count: 0, buckets };
  }

  private recordHistogramValue(histogram: HistogramData, value: number): void {
    histogram.sum += value;
    histogram.count++;
    for (const bucket of HISTOGRAM_BUCKETS) {
      if (value <= bucket) {
        histogram.buckets.set(bucket, (histogram.buckets.get(bucket) ?? 0) + 1);
      }
    }
  }
}
