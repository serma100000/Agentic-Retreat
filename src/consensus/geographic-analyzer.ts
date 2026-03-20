/**
 * Geographic spread analysis for outage detection.
 *
 * Determines whether an outage is localized, regional, or global
 * based on the number of affected regions, spread rate, and anomaly scores.
 */

import type { OutageClassification, RegionStatus } from './types.js';
import { GeographicScope } from './types.js';

/** Predefined region codes recognized by the system. */
export const PREDEFINED_REGIONS = [
  'us-east',
  'us-west',
  'eu-west',
  'eu-central',
  'ap-southeast',
  'ap-northeast',
  'ap-south',
  'sa-east',
  'af-south',
  'oc-east',
] as const;

export type PredefinedRegion = (typeof PREDEFINED_REGIONS)[number];

/** Default anomaly score threshold for considering a region affected. */
const DEFAULT_ANOMALY_THRESHOLD = 0.5;

export class GeographicAnalyzer {
  /**
   * Analyze the geographic spread of an outage based on region data.
   *
   * - localized: 1 region affected
   * - regional: 2-3 regions affected
   * - global: 4+ regions affected
   */
  analyzeSpread(serviceId: string, regionData: RegionStatus[]): OutageClassification {
    const affectedRegions = this.getAffectedRegions(serviceId, regionData);
    const primaryRegion = this.identifyPrimaryRegion(regionData);
    const count = affectedRegions.length;

    let scope: OutageClassification['scope'];
    if (count <= 1) {
      scope = GeographicScope.LOCALIZED;
    } else if (count <= 3) {
      scope = GeographicScope.REGIONAL;
    } else {
      scope = GeographicScope.GLOBAL;
    }

    return {
      scope,
      affectedRegions,
      primaryRegion,
      spreadRate: 0,
    };
  }

  /**
   * Compute how fast an outage is spreading across regions.
   * Returns the rate in regions per minute.
   */
  computeSpreadRate(
    serviceId: string,
    regionTimeline: Array<{ region: string; firstReportAt: Date }>,
  ): number {
    if (regionTimeline.length <= 1) return 0;

    // Sort by time
    const sorted = [...regionTimeline].sort(
      (a, b) => a.firstReportAt.getTime() - b.firstReportAt.getTime(),
    );

    const firstTime = sorted[0]!.firstReportAt.getTime();
    const lastTime = sorted[sorted.length - 1]!.firstReportAt.getTime();
    const durationMs = lastTime - firstTime;

    if (durationMs === 0) return Infinity;

    const durationMinutes = durationMs / 60_000;
    // Number of new regions after the first (the first region doesn't count as "spread")
    const newRegions = sorted.length - 1;

    return newRegions / durationMinutes;
  }

  /**
   * Identify the primary region: the one with the highest report density
   * and, as a tiebreaker, the earliest activity implied by highest report count.
   */
  identifyPrimaryRegion(regionData: RegionStatus[]): string | null {
    if (regionData.length === 0) return null;

    const affected = regionData.filter((r) => this.isRegionAffected(r));
    if (affected.length === 0) return null;

    // Sort by report count descending, then by lowest probe success rate (more affected)
    const sorted = [...affected].sort((a, b) => {
      const reportDiff = b.reportCount - a.reportCount;
      if (reportDiff !== 0) return reportDiff;
      return a.probeSuccessRate - b.probeSuccessRate;
    });

    return sorted[0]!.regionCode;
  }

  /**
   * Get all regions where the anomaly score exceeds the threshold.
   * Anomaly score is derived from report count, probe failure rate, and social mentions.
   */
  getAffectedRegions(
    serviceId: string,
    regionData: RegionStatus[],
    threshold: number = DEFAULT_ANOMALY_THRESHOLD,
  ): string[] {
    return regionData
      .filter((r) => this.computeRegionAnomalyScore(r) > threshold)
      .map((r) => r.regionCode);
  }

  /**
   * Compute a composite anomaly score for a region.
   * Combines report count, probe failure rate, and social mentions.
   */
  private computeRegionAnomalyScore(region: RegionStatus): number {
    // Normalize each component to [0, 1] range
    const reportScore = Math.min(region.reportCount / 10, 1.0);
    const probeFailureScore = 1.0 - region.probeSuccessRate;
    const socialScore = Math.min(region.socialMentions / 20, 1.0);

    // Weighted combination
    return reportScore * 0.4 + probeFailureScore * 0.4 + socialScore * 0.2;
  }

  /**
   * Check if a single region is affected (anomaly score above default threshold).
   */
  private isRegionAffected(region: RegionStatus): boolean {
    return this.computeRegionAnomalyScore(region) > DEFAULT_ANOMALY_THRESHOLD;
  }
}
