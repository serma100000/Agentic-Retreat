/**
 * Aggregates social signals per service into sliding time windows
 * for the detection engine.
 *
 * Maintains per-service sliding window counters and computes baselines
 * from rolling averages. Detects surge conditions when the current
 * mention rate exceeds a multiplier of the baseline.
 */

import { Sentiment } from './types.js';
import type {
  OutageMention,
  SocialSignalAggregate,
  SentimentType,
  PlatformType,
} from './types.js';

interface MentionRecord {
  timestamp: number;
  mention: OutageMention;
}

interface ServiceState {
  mentions: MentionRecord[];
  baselineRates: number[];
  baselineUpdatedAt: number;
}

const DEFAULT_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const BASELINE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const BASELINE_BUCKET_MS = 5 * 60 * 1000; // 5-min buckets for baseline
const DEFAULT_SURGE_THRESHOLD = 5.0; // 5x baseline
const MAX_MENTION_AGE_MS = 24 * 60 * 60 * 1000; // keep 24 hours of raw data

export class SignalAggregator {
  private services: Map<string, ServiceState>;
  private windowMs: number;
  private defaultSurgeThreshold: number;

  constructor(windowMs: number = DEFAULT_WINDOW_MS, surgeThreshold: number = DEFAULT_SURGE_THRESHOLD) {
    this.services = new Map();
    this.windowMs = windowMs;
    this.defaultSurgeThreshold = surgeThreshold;
  }

  /**
   * Record a new outage mention for a service.
   */
  recordMention(serviceId: string, mention: OutageMention): void {
    const state = this.getOrCreateState(serviceId);
    const now = Date.now();

    state.mentions.push({ timestamp: now, mention });

    // Prune old mentions beyond retention
    this.pruneOldMentions(state, now);

    // Update baseline periodically
    if (now - state.baselineUpdatedAt > BASELINE_BUCKET_MS) {
      this.updateBaseline(state, now);
    }
  }

  /**
   * Get the current mention rate (mentions per minute) for a service
   * within the active window.
   */
  getRate(serviceId: string): number {
    const state = this.services.get(serviceId);
    if (!state) return 0;

    const now = Date.now();
    const windowStart = now - this.windowMs;
    const recentCount = state.mentions.filter((m) => m.timestamp >= windowStart).length;
    const windowMinutes = this.windowMs / 60_000;

    return recentCount / windowMinutes;
  }

  /**
   * Get the surge multiplier: current rate divided by baseline rate.
   * Returns 1.0 if no baseline exists yet.
   */
  getSurgeMultiplier(serviceId: string): number {
    const currentRate = this.getRate(serviceId);
    const baselineRate = this.getBaselineRate(serviceId);

    if (baselineRate <= 0) {
      // No baseline yet — if there are any mentions, treat as potential surge
      return currentRate > 0 ? currentRate * 10 : 1.0;
    }

    return currentRate / baselineRate;
  }

  /**
   * Check if a service is experiencing a mention surge.
   */
  isSurge(serviceId: string, threshold: number = this.defaultSurgeThreshold): boolean {
    return this.getSurgeMultiplier(serviceId) >= threshold;
  }

  /**
   * Get the full signal aggregate for a service.
   */
  getAggregates(serviceId: string, windowMinutes?: number): SocialSignalAggregate {
    const state = this.services.get(serviceId);
    const now = Date.now();
    const windowMs = windowMinutes ? windowMinutes * 60_000 : this.windowMs;
    const windowStart = now - windowMs;

    if (!state) {
      return this.emptyAggregate(serviceId, new Date(windowStart), new Date(now));
    }

    const recentMentions = state.mentions.filter((m) => m.timestamp >= windowStart);

    const sentimentBreakdown: Record<SentimentType, number> = {
      [Sentiment.OUTAGE_COMPLAINT]: 0,
      [Sentiment.QUESTION]: 0,
      [Sentiment.HUMOR_MEME]: 0,
      [Sentiment.UNRELATED]: 0,
      [Sentiment.SERVICE_ANNOUNCEMENT]: 0,
    };

    let totalUrgency = 0;

    for (const record of recentMentions) {
      const cat = record.mention.sentiment.category;
      sentimentBreakdown[cat] = (sentimentBreakdown[cat] ?? 0) + 1;
      totalUrgency += record.mention.urgencyScore;
    }

    const mentionCount = recentMentions.length;
    const avgUrgency = mentionCount > 0 ? totalUrgency / mentionCount : 0;

    return {
      serviceId,
      platform: 'all' as PlatformType | 'all',
      mentionCount,
      avgUrgency: Math.round(avgUrgency * 100) / 100,
      sentimentBreakdown,
      windowStart: new Date(windowStart),
      windowEnd: new Date(now),
    };
  }

  /**
   * Get all tracked service IDs.
   */
  getTrackedServices(): string[] {
    return [...this.services.keys()];
  }

  /**
   * Clear all data for a service.
   */
  clearService(serviceId: string): void {
    this.services.delete(serviceId);
  }

  /**
   * Clear all aggregation state.
   */
  reset(): void {
    this.services.clear();
  }

  /**
   * Manually set a baseline rate for testing.
   */
  setBaseline(serviceId: string, ratesPerMinute: number[]): void {
    const state = this.getOrCreateState(serviceId);
    state.baselineRates = ratesPerMinute;
    state.baselineUpdatedAt = Date.now();
  }

  private getBaselineRate(serviceId: string): number {
    const state = this.services.get(serviceId);
    if (!state || state.baselineRates.length === 0) return 0;

    const sum = state.baselineRates.reduce((a, b) => a + b, 0);
    return sum / state.baselineRates.length;
  }

  private getOrCreateState(serviceId: string): ServiceState {
    let state = this.services.get(serviceId);
    if (!state) {
      state = {
        mentions: [],
        baselineRates: [],
        baselineUpdatedAt: 0,
      };
      this.services.set(serviceId, state);
    }
    return state;
  }

  private pruneOldMentions(state: ServiceState, now: number): void {
    const cutoff = now - MAX_MENTION_AGE_MS;
    state.mentions = state.mentions.filter((m) => m.timestamp >= cutoff);
  }

  private updateBaseline(state: ServiceState, now: number): void {
    // Compute rate for the just-completed bucket
    const bucketEnd = now;
    const bucketStart = bucketEnd - BASELINE_BUCKET_MS;
    const bucketCount = state.mentions.filter(
      (m) => m.timestamp >= bucketStart && m.timestamp < bucketEnd,
    ).length;
    const bucketRate = bucketCount / (BASELINE_BUCKET_MS / 60_000);

    state.baselineRates.push(bucketRate);

    // Keep only 7 days worth of buckets
    const maxBuckets = Math.floor(BASELINE_WINDOW_MS / BASELINE_BUCKET_MS);
    if (state.baselineRates.length > maxBuckets) {
      state.baselineRates = state.baselineRates.slice(-maxBuckets);
    }

    state.baselineUpdatedAt = now;
  }

  private emptyAggregate(
    serviceId: string,
    windowStart: Date,
    windowEnd: Date,
  ): SocialSignalAggregate {
    return {
      serviceId,
      platform: 'all',
      mentionCount: 0,
      avgUrgency: 0,
      sentimentBreakdown: {
        [Sentiment.OUTAGE_COMPLAINT]: 0,
        [Sentiment.QUESTION]: 0,
        [Sentiment.HUMOR_MEME]: 0,
        [Sentiment.UNRELATED]: 0,
        [Sentiment.SERVICE_ANNOUNCEMENT]: 0,
      },
      windowStart,
      windowEnd,
    };
  }
}
