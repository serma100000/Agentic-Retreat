/**
 * Baseline computation service.
 *
 * Computes hourly baselines with day-of-week seasonality
 * (7 days x 24 hours = 168 buckets) using an exponential
 * moving average for gradual adaptation.
 */

import type { BaselineData, ReportHistoryEntry } from './types.js';

const HOURS_PER_DAY = 24;
const DAYS_PER_WEEK = 7;
const TOTAL_BUCKETS = HOURS_PER_DAY * DAYS_PER_WEEK;
const COLD_START_THRESHOLD_DAYS = 7;
const EMA_ALPHA = 0.3;

/** Default category baseline used during cold-start. */
const CATEGORY_DEFAULT_MEAN = 10;
const CATEGORY_DEFAULT_STD_DEV = 5;

export interface BaselineComputerConfig {
  /** EMA smoothing factor (0-1). Higher = more weight on recent data. */
  emaAlpha?: number;
  /** Minimum days of data before using computed baselines. */
  coldStartDays?: number;
  /** Fallback mean rate during cold-start. */
  categoryDefaultMean?: number;
  /** Fallback std dev during cold-start. */
  categoryDefaultStdDev?: number;
}

export class BaselineComputer {
  private readonly emaAlpha: number;
  private readonly coldStartDays: number;
  private readonly categoryDefaultMean: number;
  private readonly categoryDefaultStdDev: number;

  constructor(config: BaselineComputerConfig = {}) {
    this.emaAlpha = config.emaAlpha ?? EMA_ALPHA;
    this.coldStartDays = config.coldStartDays ?? COLD_START_THRESHOLD_DAYS;
    this.categoryDefaultMean = config.categoryDefaultMean ?? CATEGORY_DEFAULT_MEAN;
    this.categoryDefaultStdDev = config.categoryDefaultStdDev ?? CATEGORY_DEFAULT_STD_DEV;
  }

  /**
   * Compute baselines from raw report history.
   *
   * Groups reports into 168 hourly/day-of-week buckets and
   * computes mean and standard deviation for each.
   *
   * If insufficient data (< coldStartDays), returns category default baselines.
   */
  computeBaseline(
    serviceId: string,
    reportHistory: ReportHistoryEntry[],
  ): BaselineData[] {
    if (reportHistory.length === 0) {
      return this.coldStartBaselines(serviceId);
    }

    const dataSpanMs = this.computeDataSpan(reportHistory);
    const dataSpanDays = dataSpanMs / (1000 * 60 * 60 * 24);

    if (dataSpanDays < this.coldStartDays) {
      return this.coldStartBaselines(serviceId);
    }

    // Group into buckets
    const buckets = new Map<number, number[]>();
    for (let i = 0; i < TOTAL_BUCKETS; i++) {
      buckets.set(i, []);
    }

    for (const entry of reportHistory) {
      const ts = new Date(entry.timestamp);
      const bucketKey = this.getBucketKey(ts);
      buckets.get(bucketKey)!.push(entry.count);
    }

    const now = new Date();
    const baselines: BaselineData[] = [];

    for (let dayOfWeek = 0; dayOfWeek < DAYS_PER_WEEK; dayOfWeek++) {
      for (let hour = 0; hour < HOURS_PER_DAY; hour++) {
        const key = dayOfWeek * HOURS_PER_DAY + hour;
        const values = buckets.get(key)!;

        let meanRate: number;
        let stdDev: number;
        let sampleCount: number;

        if (values.length === 0) {
          // Fill gaps with neighboring bucket averages or category default
          const neighborMean = this.getNeighborAverage(buckets, key);
          meanRate = neighborMean ?? this.categoryDefaultMean;
          stdDev = this.categoryDefaultStdDev;
          sampleCount = 0;
        } else {
          meanRate = this.computeEma(values);
          stdDev = this.computeStdDev(values, meanRate);
          sampleCount = values.length;
        }

        baselines.push({
          service_id: serviceId,
          hour_of_day: hour,
          day_of_week: dayOfWeek,
          mean_rate: meanRate,
          std_dev: stdDev,
          sample_count: sampleCount,
          updated_at: now,
        });
      }
    }

    return baselines;
  }

  /**
   * Look up the expected rate for a given timestamp from pre-computed baselines.
   */
  getExpectedRate(
    serviceId: string,
    timestamp: Date,
    baselines: BaselineData[],
  ): { expected_rate: number; std_dev: number } {
    const hour = timestamp.getUTCHours();
    const dayOfWeek = timestamp.getUTCDay();

    const match = baselines.find(
      (b) =>
        b.service_id === serviceId &&
        b.hour_of_day === hour &&
        b.day_of_week === dayOfWeek,
    );

    if (match) {
      return { expected_rate: match.mean_rate, std_dev: match.std_dev };
    }

    return {
      expected_rate: this.categoryDefaultMean,
      std_dev: this.categoryDefaultStdDev,
    };
  }

  /**
   * Generate cold-start baselines using category defaults.
   */
  private coldStartBaselines(serviceId: string): BaselineData[] {
    const now = new Date();
    const baselines: BaselineData[] = [];

    for (let dayOfWeek = 0; dayOfWeek < DAYS_PER_WEEK; dayOfWeek++) {
      for (let hour = 0; hour < HOURS_PER_DAY; hour++) {
        baselines.push({
          service_id: serviceId,
          hour_of_day: hour,
          day_of_week: dayOfWeek,
          mean_rate: this.categoryDefaultMean,
          std_dev: this.categoryDefaultStdDev,
          sample_count: 0,
          updated_at: now,
        });
      }
    }

    return baselines;
  }

  /**
   * Exponential moving average over the values array.
   * More recent values (later in the array) get higher weight.
   */
  private computeEma(values: number[]): number {
    if (values.length === 0) return 0;
    if (values.length === 1) return values[0]!;

    let ema = values[0]!;
    for (let i = 1; i < values.length; i++) {
      ema = this.emaAlpha * values[i]! + (1 - this.emaAlpha) * ema;
    }
    return ema;
  }

  /**
   * Standard deviation of values around a given mean.
   */
  private computeStdDev(values: number[], mean: number): number {
    if (values.length < 2) return this.categoryDefaultStdDev;

    const variance =
      values.reduce((sum, v) => sum + (v - mean) ** 2, 0) /
      (values.length - 1);
    return Math.sqrt(variance);
  }

  /**
   * Compute time span of the data in milliseconds.
   */
  private computeDataSpan(entries: ReportHistoryEntry[]): number {
    let min = Infinity;
    let max = -Infinity;
    for (const e of entries) {
      const t = new Date(e.timestamp).getTime();
      if (t < min) min = t;
      if (t > max) max = t;
    }
    return max - min;
  }

  /**
   * Bucket key: dayOfWeek * 24 + hourOfDay.
   */
  private getBucketKey(ts: Date): number {
    return ts.getUTCDay() * HOURS_PER_DAY + ts.getUTCHours();
  }

  /**
   * Average of adjacent buckets for gap-filling.
   */
  private getNeighborAverage(
    buckets: Map<number, number[]>,
    key: number,
  ): number | null {
    const prevKey = (key - 1 + TOTAL_BUCKETS) % TOTAL_BUCKETS;
    const nextKey = (key + 1) % TOTAL_BUCKETS;

    const prevValues = buckets.get(prevKey) ?? [];
    const nextValues = buckets.get(nextKey) ?? [];

    const allNeighbors = [...prevValues, ...nextValues];
    if (allNeighbors.length === 0) return null;

    return allNeighbors.reduce((a, b) => a + b, 0) / allNeighbors.length;
  }
}
