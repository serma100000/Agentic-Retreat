import { describe, expect, it } from 'vitest';
import { GeographicAnalyzer } from '../geographic-analyzer.js';
import type { RegionStatus } from '../types.js';
import { GeographicScope } from '../types.js';

function makeRegion(overrides: Partial<RegionStatus> = {}): RegionStatus {
  return {
    regionCode: 'us-east',
    reportCount: 15,
    probeSuccessRate: 0.3,
    socialMentions: 10,
    status: 'degraded',
    ...overrides,
  };
}

function makeHealthyRegion(regionCode: string): RegionStatus {
  return {
    regionCode,
    reportCount: 0,
    probeSuccessRate: 1.0,
    socialMentions: 0,
    status: 'operational',
  };
}

function makeAffectedRegion(regionCode: string): RegionStatus {
  return {
    regionCode,
    reportCount: 15,
    probeSuccessRate: 0.2,
    socialMentions: 10,
    status: 'degraded',
  };
}

describe('GeographicAnalyzer', () => {
  const analyzer = new GeographicAnalyzer();

  describe('analyzeSpread', () => {
    it('classifies single affected region as localized', () => {
      const regions = [
        makeAffectedRegion('us-east'),
        makeHealthyRegion('us-west'),
        makeHealthyRegion('eu-west'),
      ];

      const result = analyzer.analyzeSpread('svc-1', regions);
      expect(result.scope).toBe(GeographicScope.LOCALIZED);
      expect(result.affectedRegions).toHaveLength(1);
      expect(result.affectedRegions).toContain('us-east');
    });

    it('classifies two affected regions as regional', () => {
      const regions = [
        makeAffectedRegion('us-east'),
        makeAffectedRegion('us-west'),
        makeHealthyRegion('eu-west'),
      ];

      const result = analyzer.analyzeSpread('svc-1', regions);
      expect(result.scope).toBe(GeographicScope.REGIONAL);
      expect(result.affectedRegions).toHaveLength(2);
    });

    it('classifies three affected regions as regional', () => {
      const regions = [
        makeAffectedRegion('us-east'),
        makeAffectedRegion('us-west'),
        makeAffectedRegion('eu-west'),
        makeHealthyRegion('eu-central'),
      ];

      const result = analyzer.analyzeSpread('svc-1', regions);
      expect(result.scope).toBe(GeographicScope.REGIONAL);
      expect(result.affectedRegions).toHaveLength(3);
    });

    it('classifies five affected regions as global', () => {
      const regions = [
        makeAffectedRegion('us-east'),
        makeAffectedRegion('us-west'),
        makeAffectedRegion('eu-west'),
        makeAffectedRegion('eu-central'),
        makeAffectedRegion('ap-southeast'),
      ];

      const result = analyzer.analyzeSpread('svc-1', regions);
      expect(result.scope).toBe(GeographicScope.GLOBAL);
      expect(result.affectedRegions).toHaveLength(5);
    });

    it('returns localized with zero affected regions', () => {
      const regions = [
        makeHealthyRegion('us-east'),
        makeHealthyRegion('us-west'),
      ];

      const result = analyzer.analyzeSpread('svc-1', regions);
      expect(result.scope).toBe(GeographicScope.LOCALIZED);
      expect(result.affectedRegions).toHaveLength(0);
    });

    it('includes primary region in classification', () => {
      const regions = [
        makeAffectedRegion('us-east'),
        makeAffectedRegion('eu-west'),
      ];

      const result = analyzer.analyzeSpread('svc-1', regions);
      expect(result.primaryRegion).not.toBeNull();
    });
  });

  describe('computeSpreadRate', () => {
    it('returns 0 for single region', () => {
      const timeline = [{ region: 'us-east', firstReportAt: new Date('2024-06-01T12:00:00Z') }];
      const rate = analyzer.computeSpreadRate('svc-1', timeline);
      expect(rate).toBe(0);
    });

    it('computes correct rate for fast spread', () => {
      const t0 = new Date('2024-06-01T12:00:00Z');
      const timeline = [
        { region: 'us-east', firstReportAt: t0 },
        { region: 'us-west', firstReportAt: new Date(t0.getTime() + 60_000) },     // +1 min
        { region: 'eu-west', firstReportAt: new Date(t0.getTime() + 120_000) },    // +2 min
      ];

      const rate = analyzer.computeSpreadRate('svc-1', timeline);
      // 2 new regions in 2 minutes = 1 region/minute
      expect(rate).toBeCloseTo(1.0);
    });

    it('computes correct rate for slow spread', () => {
      const t0 = new Date('2024-06-01T12:00:00Z');
      const timeline = [
        { region: 'us-east', firstReportAt: t0 },
        { region: 'us-west', firstReportAt: new Date(t0.getTime() + 600_000) },   // +10 min
      ];

      const rate = analyzer.computeSpreadRate('svc-1', timeline);
      // 1 new region in 10 minutes = 0.1 regions/minute
      expect(rate).toBeCloseTo(0.1);
    });

    it('returns Infinity when all reports are simultaneous', () => {
      const t0 = new Date('2024-06-01T12:00:00Z');
      const timeline = [
        { region: 'us-east', firstReportAt: t0 },
        { region: 'us-west', firstReportAt: t0 },
        { region: 'eu-west', firstReportAt: t0 },
      ];

      const rate = analyzer.computeSpreadRate('svc-1', timeline);
      expect(rate).toBe(Infinity);
    });

    it('returns 0 for empty timeline', () => {
      const rate = analyzer.computeSpreadRate('svc-1', []);
      expect(rate).toBe(0);
    });
  });

  describe('identifyPrimaryRegion', () => {
    it('returns null for empty region data', () => {
      const result = analyzer.identifyPrimaryRegion([]);
      expect(result).toBeNull();
    });

    it('returns null when no regions are affected', () => {
      const regions = [makeHealthyRegion('us-east'), makeHealthyRegion('us-west')];
      const result = analyzer.identifyPrimaryRegion(regions);
      expect(result).toBeNull();
    });

    it('identifies region with highest report count', () => {
      const regions = [
        makeRegion({ regionCode: 'us-east', reportCount: 50, probeSuccessRate: 0.3 }),
        makeRegion({ regionCode: 'us-west', reportCount: 10, probeSuccessRate: 0.3 }),
        makeRegion({ regionCode: 'eu-west', reportCount: 25, probeSuccessRate: 0.3 }),
      ];

      const result = analyzer.identifyPrimaryRegion(regions);
      expect(result).toBe('us-east');
    });

    it('uses probe success rate as tiebreaker', () => {
      const regions = [
        makeRegion({ regionCode: 'us-east', reportCount: 20, probeSuccessRate: 0.5 }),
        makeRegion({ regionCode: 'us-west', reportCount: 20, probeSuccessRate: 0.1 }),
      ];

      const result = analyzer.identifyPrimaryRegion(regions);
      expect(result).toBe('us-west'); // lower probe success = more affected
    });
  });

  describe('getAffectedRegions', () => {
    it('returns only regions above default threshold', () => {
      const regions = [
        makeAffectedRegion('us-east'),
        makeHealthyRegion('us-west'),
        makeAffectedRegion('eu-west'),
      ];

      const affected = analyzer.getAffectedRegions('svc-1', regions);
      expect(affected).toHaveLength(2);
      expect(affected).toContain('us-east');
      expect(affected).toContain('eu-west');
    });

    it('respects custom threshold', () => {
      const regions = [
        makeRegion({ regionCode: 'us-east', reportCount: 5, probeSuccessRate: 0.7, socialMentions: 2 }),
        makeRegion({ regionCode: 'us-west', reportCount: 2, probeSuccessRate: 0.9, socialMentions: 1 }),
      ];

      const strictResult = analyzer.getAffectedRegions('svc-1', regions, 0.3);
      const lenientResult = analyzer.getAffectedRegions('svc-1', regions, 0.1);

      expect(lenientResult.length).toBeGreaterThanOrEqual(strictResult.length);
    });

    it('returns empty array when no regions are affected', () => {
      const regions = [makeHealthyRegion('us-east'), makeHealthyRegion('us-west')];
      const affected = analyzer.getAffectedRegions('svc-1', regions);
      expect(affected).toHaveLength(0);
    });
  });
});
