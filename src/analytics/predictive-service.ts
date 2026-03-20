/**
 * Predictive detection integration for OpenPulse analytics.
 *
 * Computes real-time features from feature store and analytics data,
 * runs XGBoost-based predictions, and determines alerting thresholds.
 */

import type { ClickHouseClient } from './clickhouse-client.js';

interface FeatureStoreAdapter {
  getFeatures(serviceId: string): Promise<{ reportRate: number; probeLatency: number; probeSuccessRate: number; socialMentionRate: number; timestamp: number } | null>;
  getWindow(serviceId: string, windowSize?: number): Promise<{ reportRate: number; probeLatency: number; probeSuccessRate: number; socialMentionRate: number; timestamp: number }[]>;
  getAllServiceFeatures(): Promise<Map<string, { reportRate: number; probeLatency: number; timestamp: number }>>;
}

interface XGBoostAdapter {
  predict(features: Record<string, number>): { probability5min: number; probability15min: number; probability60min: number; features: Record<string, number> };
}

interface PredictionResult {
  predict5min: number;
  predict15min: number;
  predict60min: number;
  shouldAlert: boolean;
}

interface ScheduledEvaluationResult {
  serviceId: string;
  predictions: PredictionResult;
}

const ALERT_THRESHOLD = 0.7;
const DEFAULT_WINDOW_SIZE = 30;

export class PredictiveService {
  private readonly client: ClickHouseClient;
  private readonly featureStore: FeatureStoreAdapter;
  private readonly predictor: XGBoostAdapter;

  constructor(
    client: ClickHouseClient,
    featureStore: FeatureStoreAdapter,
    predictor: XGBoostAdapter,
  ) {
    this.client = client;
    this.featureStore = featureStore;
    this.predictor = predictor;
  }

  /**
   * Compute real-time features for a service from feature store and analytics.
   *
   * Features:
   * - reportRateAcceleration: rate of change of report velocity
   * - probeLatencyTrend: slope of latency over last 30 min
   * - socialSentimentShift: change in sentiment over last hour
   * - dnsResolutionAnomaly: deviation from baseline DNS time
   * - tlsCertExpiryDays: days until TLS cert expires
   * - historicalPattern: time-of-day/day-of-week outage likelihood
   * - categoryBaselineDeviation: how far from category average
   */
  async computeFeatures(serviceId: string): Promise<Record<string, number>> {
    const features: Record<string, number> = {};

    // Get current feature vector and sliding window
    const currentFeatures = await this.featureStore.getFeatures(serviceId);
    const window = await this.featureStore.getWindow(serviceId, DEFAULT_WINDOW_SIZE);

    // Report rate acceleration
    features['reportRateAcceleration'] = this.computeReportRateAcceleration(window);

    // Probe latency trend (slope)
    features['probeLatencyTrend'] = this.computeProbeLatencyTrend(window);

    // Social sentiment shift
    features['socialSentimentShift'] = await this.computeSocialSentimentShift(serviceId);

    // DNS resolution anomaly
    features['dnsResolutionAnomaly'] = await this.computeDnsAnomaly(serviceId);

    // TLS cert expiry
    features['tlsCertExpiryDays'] = await this.computeTlsCertExpiry(serviceId);

    // Historical outage pattern
    features['historicalPattern'] = await this.computeHistoricalPattern(serviceId);

    // Category baseline deviation
    features['categoryBaselineDeviation'] = await this.computeCategoryDeviation(
      serviceId,
      currentFeatures,
    );

    return features;
  }

  /**
   * Evaluate a service: compute features, run XGBoost, return predictions.
   * shouldAlert is true when P(15min) > 0.7.
   */
  async evaluate(serviceId: string): Promise<PredictionResult> {
    const features = await this.computeFeatures(serviceId);
    const prediction = this.predictor.predict(features);

    return {
      predict5min: prediction.probability5min,
      predict15min: prediction.probability15min,
      predict60min: prediction.probability60min,
      shouldAlert: prediction.probability15min > ALERT_THRESHOLD,
    };
  }

  /**
   * Run scheduled evaluation across all monitored services.
   * Returns a list of services with their predictions.
   */
  async runScheduledEvaluation(): Promise<ScheduledEvaluationResult[]> {
    const allFeatures = await this.featureStore.getAllServiceFeatures();
    const results: ScheduledEvaluationResult[] = [];

    for (const [serviceId] of allFeatures) {
      try {
        const predictions = await this.evaluate(serviceId);
        results.push({ serviceId, predictions });
      } catch {
        // Skip services that fail evaluation; log in production
      }
    }

    return results;
  }

  // --- Feature computation helpers ---

  private computeReportRateAcceleration(
    window: { reportRate: number; timestamp: number }[],
  ): number {
    if (window.length < 3) return 0;

    // Compute first derivative (velocity) at two recent points
    const recent = window.slice(-5);
    if (recent.length < 3) return 0;

    const midIdx = Math.floor(recent.length / 2);
    const earlySlice = recent.slice(0, midIdx);
    const lateSlice = recent.slice(midIdx);

    const earlyAvgRate = this.avg(earlySlice.map(f => f.reportRate));
    const lateAvgRate = this.avg(lateSlice.map(f => f.reportRate));

    const earlyAvgTime = this.avg(earlySlice.map(f => f.timestamp));
    const lateAvgTime = this.avg(lateSlice.map(f => f.timestamp));

    const timeDiff = lateAvgTime - earlyAvgTime;
    if (timeDiff === 0) return 0;

    // Acceleration = change in rate / time
    return (lateAvgRate - earlyAvgRate) / (timeDiff / 60000); // per minute
  }

  private computeProbeLatencyTrend(
    window: { probeLatency: number; timestamp: number }[],
  ): number {
    if (window.length < 2) return 0;

    // Linear regression slope
    const n = window.length;
    const xValues = window.map(f => f.timestamp);
    const yValues = window.map(f => f.probeLatency);

    const xMean = this.avg(xValues);
    const yMean = this.avg(yValues);

    let numerator = 0;
    let denominator = 0;

    for (let i = 0; i < n; i++) {
      const xDiff = xValues[i]! - xMean;
      const yDiff = yValues[i]! - yMean;
      numerator += xDiff * yDiff;
      denominator += xDiff * xDiff;
    }

    if (denominator === 0) return 0;

    // Scale slope to per-minute units
    const slope = numerator / denominator;
    return slope * 60000; // change per minute
  }

  private async computeSocialSentimentShift(serviceId: string): Promise<number> {
    // Query recent social aggregates from ClickHouse
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000);

    const sql = `
      SELECT * FROM social_aggregates
      WHERE service_id = '${serviceId}'
      AND minute >= '${oneHourAgo.toISOString()}'
      ORDER BY minute ASC
    `.trim();

    try {
      const rows = await this.client.query<Record<string, unknown>>(sql);

      if (rows.length < 2) return 0;

      // Split into early and late halves
      const earlyRows = rows.filter(r => {
        const minute = new Date(String(r['minute'] ?? ''));
        return minute < thirtyMinAgo;
      });
      const lateRows = rows.filter(r => {
        const minute = new Date(String(r['minute'] ?? ''));
        return minute >= thirtyMinAgo;
      });

      const earlyAvg = this.avg(earlyRows.map(r => Number(r['avg_sentiment'] ?? 0)));
      const lateAvg = this.avg(lateRows.map(r => Number(r['avg_sentiment'] ?? 0)));

      return lateAvg - earlyAvg;
    } catch {
      return 0;
    }
  }

  private async computeDnsAnomaly(serviceId: string): Promise<number> {
    // Query probe aggregates looking for DNS-related latency deviations
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000);

    const sql = `
      SELECT * FROM probe_aggregates
      WHERE service_id = '${serviceId}'
      AND minute >= '${thirtyMinAgo.toISOString()}'
      ORDER BY minute ASC
    `.trim();

    try {
      const rows = await this.client.query<Record<string, unknown>>(sql);

      if (rows.length < 2) return 0;

      const latencies = rows.map(r => Number(r['avg_latency_ms'] ?? 0));
      const mean = this.avg(latencies);
      const stdDev = this.stdDev(latencies);

      if (stdDev === 0) return 0;

      // Latest latency deviation from mean in standard deviations
      const latest = latencies[latencies.length - 1]!;
      return Math.max(0, (latest - mean) / stdDev);
    } catch {
      return 0;
    }
  }

  private async computeTlsCertExpiry(serviceId: string): Promise<number> {
    // Query probe aggregates for TLS cert info
    // In a real system this would check a certificate monitoring store.
    // Default to a safe value when no data is available.
    const sql = `
      SELECT * FROM probe_aggregates
      WHERE service_id = '${serviceId}'
      ORDER BY minute DESC
      LIMIT 1
    `.trim();

    try {
      const rows = await this.client.query<Record<string, unknown>>(sql);

      if (rows.length === 0) return 365;

      // Check if TLS data is present in the row
      const tlsExpiry = rows[0]?.['tls_cert_expiry_days'];
      if (tlsExpiry !== undefined && tlsExpiry !== null) {
        return Number(tlsExpiry);
      }

      return 365; // Default safe value
    } catch {
      return 365;
    }
  }

  private async computeHistoricalPattern(serviceId: string): Promise<number> {
    // Compute time-of-day/day-of-week outage likelihood from historical data
    const now = new Date();
    const currentHour = now.getHours();
    const currentDow = now.getDay();

    const sql = `
      SELECT * FROM outage_events
      WHERE service_id = '${serviceId}'
      ORDER BY started_at DESC
    `.trim();

    try {
      const rows = await this.client.query<Record<string, unknown>>(sql);

      if (rows.length === 0) return 0;

      // Count outages at this hour and day of week
      let matchingOutages = 0;
      for (const row of rows) {
        const startedAt = new Date(String(row['started_at'] ?? ''));
        const hour = startedAt.getHours();
        const dow = startedAt.getDay();

        // Allow +/- 2 hour window and same day of week
        if (Math.abs(hour - currentHour) <= 2 && dow === currentDow) {
          matchingOutages++;
        }
      }

      // Normalize: proportion of outages that occurred at similar times
      return Math.min(1, matchingOutages / Math.max(1, rows.length));
    } catch {
      return 0;
    }
  }

  private async computeCategoryDeviation(
    serviceId: string,
    currentFeatures: { reportRate: number; probeLatency: number } | null,
  ): Promise<number> {
    if (!currentFeatures) return 0;

    // Get category for this service from outage history
    const sql = `
      SELECT * FROM outage_events
      WHERE service_id = '${serviceId}'
      ORDER BY started_at DESC
      LIMIT 1
    `.trim();

    try {
      const rows = await this.client.query<Record<string, unknown>>(sql);

      if (rows.length === 0) return 0;

      const category = String(rows[0]?.['category'] ?? '');
      if (!category) return 0;

      // Get all services in the same category
      const categorySql = `
        SELECT * FROM outage_events
        WHERE category = '${category}'
        ORDER BY started_at DESC
      `.trim();

      const categoryRows = await this.client.query<Record<string, unknown>>(categorySql);

      if (categoryRows.length === 0) return 0;

      // Compare current report rate to category average duration (as proxy)
      const avgDuration = this.avg(categoryRows.map(r => Number(r['duration_ms'] ?? 0)));
      const currentLatency = currentFeatures.probeLatency;

      if (avgDuration === 0) return 0;

      // Deviation score: how far current metrics deviate from category normal
      return Math.min(2, currentLatency / Math.max(1, avgDuration / 60000));
    } catch {
      return 0;
    }
  }

  // --- Utility helpers ---

  private avg(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((sum, v) => sum + v, 0) / values.length;
  }

  private stdDev(values: number[]): number {
    if (values.length < 2) return 0;
    const mean = this.avg(values);
    const squaredDiffs = values.map(v => (v - mean) ** 2);
    return Math.sqrt(this.avg(squaredDiffs));
  }
}
