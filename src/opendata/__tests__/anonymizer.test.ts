/**
 * Tests for the DataAnonymizer (Sprint 19).
 * Validates PII stripping, geographic aggregation to city level,
 * time aggregation to 5-minute windows, compliance validation,
 * and batch processing.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { DataAnonymizer } from '../anonymizer.js';
import type { RawOutageRecord } from '../types.js';

function createRawOutage(overrides: Partial<RawOutageRecord> = {}): RawOutageRecord {
  return {
    outageId: `outage-${Math.random().toString(36).slice(2, 8)}`,
    serviceId: 'svc-001',
    serviceSlug: 'github',
    serviceName: 'GitHub',
    category: 'devtools',
    state: 'RESOLVED',
    confidence: 0.9523,
    startedAt: new Date('2025-06-15T10:03:22Z'),
    resolvedAt: new Date('2025-06-15T10:32:45Z'),
    durationMs: 1763000,
    peakReportsPerMin: 150,
    reporterEmail: 'user@example.com',
    reporterIp: '192.168.1.42',
    deviceId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    latitude: 40.7128,
    longitude: -74.006,
    city: 'New York',
    region: 'NY',
    country: 'US',
    detectionSignals: ['statistical', 'social'],
    rawReportData: { someField: 'sensitive data' },
    ...overrides,
  };
}

describe('DataAnonymizer', () => {
  let anonymizer: DataAnonymizer;

  beforeEach(() => {
    anonymizer = new DataAnonymizer();
  });

  describe('anonymizeOutage', () => {
    it('should strip reporter email from output', () => {
      const raw = createRawOutage({ reporterEmail: 'alice@company.com' });
      const result = anonymizer.anonymizeOutage(raw);

      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain('alice@company.com');
      expect(serialized).not.toContain('reporterEmail');
    });

    it('should strip reporter IP address from output', () => {
      const raw = createRawOutage({ reporterIp: '10.0.0.1' });
      const result = anonymizer.anonymizeOutage(raw);

      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain('10.0.0.1');
      expect(serialized).not.toContain('reporterIp');
    });

    it('should strip device ID from output', () => {
      const raw = createRawOutage({
        deviceId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
      });
      const result = anonymizer.anonymizeOutage(raw);

      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain('f47ac10b-58cc-4372-a567-0e02b2c3d479');
      expect(serialized).not.toContain('deviceId');
    });

    it('should strip latitude and longitude from output', () => {
      const raw = createRawOutage({ latitude: 51.5074, longitude: -0.1278 });
      const result = anonymizer.anonymizeOutage(raw);

      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain('51.5074');
      expect(serialized).not.toContain('-0.1278');
      expect(serialized).not.toContain('latitude');
      expect(serialized).not.toContain('longitude');
    });

    it('should strip raw report data from output', () => {
      const raw = createRawOutage({
        rawReportData: { secretKey: 'abc123', userAgent: 'Mozilla/5.0' },
      });
      const result = anonymizer.anonymizeOutage(raw);

      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain('secretKey');
      expect(serialized).not.toContain('abc123');
      expect(serialized).not.toContain('rawReportData');
    });

    it('should aggregate start time to 5-minute window', () => {
      // 10:03:22 should round down to 10:00:00
      const raw = createRawOutage({
        startedAt: new Date('2025-06-15T10:03:22Z'),
      });
      const result = anonymizer.anonymizeOutage(raw);

      expect(result.windowStart).toEqual(new Date('2025-06-15T10:00:00Z'));
    });

    it('should aggregate end time to 5-minute window', () => {
      // 10:32:45 should round down to 10:30:00
      const raw = createRawOutage({
        resolvedAt: new Date('2025-06-15T10:32:45Z'),
      });
      const result = anonymizer.anonymizeOutage(raw);

      expect(result.windowEnd).toEqual(new Date('2025-06-15T10:30:00Z'));
    });

    it('should handle null resolvedAt for ongoing outages', () => {
      const raw = createRawOutage({
        resolvedAt: null,
        durationMs: 600000,
      });
      const result = anonymizer.anonymizeOutage(raw);

      expect(result.windowEnd).toBeNull();
      expect(result.durationMs).toBe(600000);
    });

    it('should preserve city-level geography only', () => {
      const raw = createRawOutage({
        city: 'San Francisco',
        region: 'CA',
        country: 'US',
      });
      const result = anonymizer.anonymizeOutage(raw);

      expect(result.city).toBe('San Francisco');
      expect(result.region).toBe('CA');
      expect(result.country).toBe('US');
    });

    it('should default missing city/region/country to Unknown', () => {
      const raw = createRawOutage({
        city: undefined,
        region: undefined,
        country: undefined,
      });
      const result = anonymizer.anonymizeOutage(raw);

      expect(result.city).toBe('Unknown');
      expect(result.region).toBe('Unknown');
      expect(result.country).toBe('Unknown');
    });

    it('should generate deterministic anonymized ID', () => {
      const raw = createRawOutage({ outageId: 'outage-fixed-id' });
      const result1 = anonymizer.anonymizeOutage(raw);
      const result2 = anonymizer.anonymizeOutage(raw);

      expect(result1.id).toBe(result2.id);
      expect(result1.id).toMatch(/^anon-/);
      expect(result1.id).not.toBe('outage-fixed-id');
    });

    it('should round confidence to 2 decimal places', () => {
      const raw = createRawOutage({ confidence: 0.87654321 });
      const result = anonymizer.anonymizeOutage(raw);

      expect(result.confidence).toBe(0.88);
    });

    it('should preserve detection signals as a copy', () => {
      const signals = ['statistical', 'social'];
      const raw = createRawOutage({ detectionSignals: signals });
      const result = anonymizer.anonymizeOutage(raw);

      expect(result.detectionSignals).toEqual(['statistical', 'social']);
      expect(result.detectionSignals).not.toBe(signals); // must be a copy
    });
  });

  describe('anonymizeReports', () => {
    it('should aggregate reports by service, city, and 5-min window', () => {
      const reports = [
        {
          serviceSlug: 'github',
          category: 'devtools',
          city: 'NYC',
          region: 'NY',
          country: 'US',
          timestamp: new Date('2025-06-15T10:01:00Z'),
          reporterEmail: 'a@test.com',
        },
        {
          serviceSlug: 'github',
          category: 'devtools',
          city: 'NYC',
          region: 'NY',
          country: 'US',
          timestamp: new Date('2025-06-15T10:02:30Z'),
          reporterEmail: 'b@test.com',
        },
        {
          serviceSlug: 'github',
          category: 'devtools',
          city: 'LA',
          region: 'CA',
          country: 'US',
          timestamp: new Date('2025-06-15T10:01:00Z'),
          reporterEmail: 'c@test.com',
        },
      ];

      const result = anonymizer.anonymizeReports(reports);

      // NYC reports in same window should be aggregated
      const nycBucket = result.find(r => r.city === 'NYC');
      expect(nycBucket).toBeDefined();
      expect(nycBucket!.count).toBe(2);

      // LA reports in separate bucket
      const laBucket = result.find(r => r.city === 'LA');
      expect(laBucket).toBeDefined();
      expect(laBucket!.count).toBe(1);

      // No emails in output
      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain('@test.com');
    });

    it('should strip all PII fields from aggregated reports', () => {
      const reports = [
        {
          serviceSlug: 'aws',
          category: 'cloud',
          timestamp: new Date('2025-06-15T10:01:00Z'),
          reporterEmail: 'user@corp.com',
          reporterIp: '172.16.0.1',
          deviceId: 'abc-123-def',
        },
      ];

      const result = anonymizer.anonymizeReports(reports);

      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain('user@corp.com');
      expect(serialized).not.toContain('172.16.0.1');
      expect(serialized).not.toContain('abc-123-def');
    });
  });

  describe('validateCompliance', () => {
    it('should detect email addresses in data', () => {
      const data = {
        name: 'Test Outage',
        contact: 'admin@example.com',
      };

      const violations = anonymizer.validateCompliance(data);

      expect(violations.length).toBeGreaterThanOrEqual(1);
      expect(violations.some(v => v.pattern === 'email')).toBe(true);
    });

    it('should detect IPv4 addresses in data', () => {
      const data = {
        source: 'Report from 192.168.1.100',
      };

      const violations = anonymizer.validateCompliance(data);

      expect(violations.some(v => v.pattern === 'ipv4')).toBe(true);
    });

    it('should detect device IDs (UUIDs) in data', () => {
      const data = {
        device: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
      };

      const violations = anonymizer.validateCompliance(data);

      expect(violations.some(v => v.pattern === 'deviceId')).toBe(true);
    });

    it('should return empty array for compliant data', () => {
      const data = {
        serviceSlug: 'github',
        category: 'devtools',
        city: 'New York',
        count: 42,
      };

      const violations = anonymizer.validateCompliance(data);

      expect(violations).toEqual([]);
    });

    it('should scan nested objects and arrays', () => {
      const data = {
        records: [
          { info: 'clean data' },
          { info: 'contains user@leak.com in nested' },
        ],
      };

      const violations = anonymizer.validateCompliance(data);

      expect(violations.length).toBeGreaterThanOrEqual(1);
      expect(violations[0]!.field).toContain('records[1]');
    });
  });

  describe('batchAnonymize', () => {
    it('should anonymize all records in a batch', () => {
      const records = [
        createRawOutage({ outageId: 'o1', serviceSlug: 'github' }),
        createRawOutage({ outageId: 'o2', serviceSlug: 'aws' }),
        createRawOutage({ outageId: 'o3', serviceSlug: 'slack' }),
      ];

      const results = anonymizer.batchAnonymize(records);

      expect(results).toHaveLength(3);
      expect(results.every(r => r.id.startsWith('anon-'))).toBe(true);
    });

    it('should handle empty batch', () => {
      const results = anonymizer.batchAnonymize([]);
      expect(results).toEqual([]);
    });

    it('should throw on PII leakage in batch output', () => {
      // Create a record where city contains an email (simulating a bug)
      const records = [
        createRawOutage({
          outageId: 'o1',
          city: 'leaked-user@example.com',
        }),
      ];

      expect(() => anonymizer.batchAnonymize(records)).toThrow(
        /PII leakage detected/,
      );
    });
  });
});
