import { describe, expect, it } from 'vitest';
import { BaselineComputer } from '../baseline-computer.js';
import type { ReportHistoryEntry } from '../types.js';

/**
 * Generate report history entries spanning the given number of days.
 * Creates one entry per hour with the given base count plus optional
 * day-of-week and hour-of-day modifiers.
 */
function generateHistory(
  days: number,
  baseCount: number,
  options: {
    weekendMultiplier?: number;
    peakHourStart?: number;
    peakHourEnd?: number;
    peakMultiplier?: number;
  } = {},
): ReportHistoryEntry[] {
  const {
    weekendMultiplier = 1.0,
    peakHourStart = 9,
    peakHourEnd = 17,
    peakMultiplier = 1.0,
  } = options;

  const entries: ReportHistoryEntry[] = [];
  const startDate = new Date('2024-06-01T00:00:00Z'); // Saturday

  for (let d = 0; d < days; d++) {
    for (let h = 0; h < 24; h++) {
      const ts = new Date(startDate.getTime() + d * 86400000 + h * 3600000);
      const dayOfWeek = ts.getUTCDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      const isPeak = h >= peakHourStart && h < peakHourEnd;

      let count = baseCount;
      if (isWeekend) count *= weekendMultiplier;
      if (isPeak) count *= peakMultiplier;

      // Add small random-ish variation based on position
      count += (d * 7 + h * 3) % 5 - 2;

      entries.push({ timestamp: ts, count: Math.max(0, Math.round(count)) });
    }
  }

  return entries;
}

describe('BaselineComputer', () => {
  const computer = new BaselineComputer();

  describe('computeBaseline with sufficient data', () => {
    it('computes 168 baselines (7 days x 24 hours)', () => {
      const history = generateHistory(14, 100);
      const baselines = computer.computeBaseline('svc-1', history);

      expect(baselines).toHaveLength(168);
    });

    it('each baseline has correct service ID', () => {
      const history = generateHistory(14, 100);
      const baselines = computer.computeBaseline('svc-1', history);

      for (const b of baselines) {
        expect(b.service_id).toBe('svc-1');
      }
    });

    it('covers all hour/day combinations', () => {
      const history = generateHistory(14, 100);
      const baselines = computer.computeBaseline('svc-1', history);

      const keys = new Set(baselines.map((b) => `${b.day_of_week}-${b.hour_of_day}`));
      expect(keys.size).toBe(168);

      // Verify ranges
      for (const b of baselines) {
        expect(b.hour_of_day).toBeGreaterThanOrEqual(0);
        expect(b.hour_of_day).toBeLessThan(24);
        expect(b.day_of_week).toBeGreaterThanOrEqual(0);
        expect(b.day_of_week).toBeLessThan(7);
      }
    });

    it('mean rates are positive for populated buckets', () => {
      const history = generateHistory(14, 100);
      const baselines = computer.computeBaseline('svc-1', history);

      const populatedBaselines = baselines.filter((b) => b.sample_count > 0);
      expect(populatedBaselines.length).toBeGreaterThan(0);

      for (const b of populatedBaselines) {
        expect(b.mean_rate).toBeGreaterThan(0);
      }
    });
  });

  describe('day-of-week seasonality', () => {
    it('weekend baselines differ from weekday baselines when multiplier applied', () => {
      const history = generateHistory(14, 100, {
        weekendMultiplier: 0.5,
      });
      const baselines = computer.computeBaseline('svc-1', history);

      // Saturday = 6, Sunday = 0; Monday = 1
      const saturdayNoon = baselines.find(
        (b) => b.day_of_week === 6 && b.hour_of_day === 12,
      );
      const mondayNoon = baselines.find(
        (b) => b.day_of_week === 1 && b.hour_of_day === 12,
      );

      expect(saturdayNoon).toBeDefined();
      expect(mondayNoon).toBeDefined();

      // Weekend rate should be roughly half of weekday
      if (saturdayNoon!.sample_count > 0 && mondayNoon!.sample_count > 0) {
        expect(saturdayNoon!.mean_rate).toBeLessThan(mondayNoon!.mean_rate);
      }
    });

    it('peak hours have higher rates than off-peak', () => {
      const history = generateHistory(14, 50, {
        peakHourStart: 9,
        peakHourEnd: 17,
        peakMultiplier: 3.0,
      });
      const baselines = computer.computeBaseline('svc-1', history);

      // Compare a weekday peak hour vs a weekday off-peak hour
      const wednesdayPeak = baselines.find(
        (b) => b.day_of_week === 3 && b.hour_of_day === 12,
      );
      const wednesdayOffPeak = baselines.find(
        (b) => b.day_of_week === 3 && b.hour_of_day === 3,
      );

      expect(wednesdayPeak).toBeDefined();
      expect(wednesdayOffPeak).toBeDefined();

      if (wednesdayPeak!.sample_count > 0 && wednesdayOffPeak!.sample_count > 0) {
        expect(wednesdayPeak!.mean_rate).toBeGreaterThan(wednesdayOffPeak!.mean_rate);
      }
    });
  });

  describe('cold-start handling', () => {
    it('returns category defaults with empty history', () => {
      const baselines = computer.computeBaseline('svc-new', []);
      expect(baselines).toHaveLength(168);

      for (const b of baselines) {
        expect(b.mean_rate).toBe(10); // category default
        expect(b.std_dev).toBe(5);
        expect(b.sample_count).toBe(0);
      }
    });

    it('returns category defaults with fewer than 7 days of data', () => {
      const history = generateHistory(3, 100); // only 3 days
      const baselines = computer.computeBaseline('svc-1', history);

      expect(baselines).toHaveLength(168);
      for (const b of baselines) {
        expect(b.sample_count).toBe(0); // cold-start defaults
      }
    });

    it('uses custom cold-start defaults when configured', () => {
      const customComputer = new BaselineComputer({
        categoryDefaultMean: 20,
        categoryDefaultStdDev: 8,
      });

      const baselines = customComputer.computeBaseline('svc-1', []);
      for (const b of baselines) {
        expect(b.mean_rate).toBe(20);
        expect(b.std_dev).toBe(8);
      }
    });
  });

  describe('getExpectedRate', () => {
    it('returns correct rate for a given timestamp', () => {
      const history = generateHistory(14, 100);
      const baselines = computer.computeBaseline('svc-1', history);

      // Wednesday 14:00 UTC
      const ts = new Date('2024-06-12T14:00:00Z');
      const result = computer.getExpectedRate('svc-1', ts, baselines);

      expect(result.expected_rate).toBeGreaterThan(0);
      expect(result.std_dev).toBeGreaterThan(0);
    });

    it('returns category default when no matching baseline', () => {
      const result = computer.getExpectedRate('svc-unknown', new Date(), []);
      expect(result.expected_rate).toBe(10);
      expect(result.std_dev).toBe(5);
    });
  });

  describe('handles missing data gracefully', () => {
    it('fills gaps using neighbor averages', () => {
      // Create sparse data: only entries for a few hours
      const entries: ReportHistoryEntry[] = [];
      const start = new Date('2024-06-01T00:00:00Z');

      // Add data for 10 days but only for hours 10-12
      for (let d = 0; d < 10; d++) {
        for (let h = 10; h <= 12; h++) {
          entries.push({
            timestamp: new Date(start.getTime() + d * 86400000 + h * 3600000),
            count: 100,
          });
        }
      }

      const baselines = computer.computeBaseline('svc-1', entries);
      expect(baselines).toHaveLength(168);

      // Even gaps should have some value (neighbor average or category default)
      for (const b of baselines) {
        expect(b.mean_rate).toBeGreaterThanOrEqual(0);
      }
    });
  });
});
