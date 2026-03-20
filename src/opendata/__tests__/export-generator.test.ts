/**
 * Tests for the ExportGenerator (Sprint 19).
 * Validates JSON export with license, CSV escaping and headers,
 * Parquet columnar structure, and streaming for large datasets.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ExportGenerator } from '../export-generator.js';
import type { AnonymizedOutage } from '../types.js';

function createAnonymizedOutage(
  overrides: Partial<AnonymizedOutage> = {},
): AnonymizedOutage {
  return {
    id: 'anon-abc12345',
    serviceSlug: 'github',
    serviceName: 'GitHub',
    category: 'devtools',
    state: 'RESOLVED',
    confidence: 0.95,
    windowStart: new Date('2025-06-15T10:00:00Z'),
    windowEnd: new Date('2025-06-15T10:30:00Z'),
    durationMs: 1800000,
    city: 'New York',
    region: 'NY',
    country: 'US',
    reportCount: 150,
    detectionSignals: ['statistical', 'social'],
    ...overrides,
  };
}

describe('ExportGenerator', () => {
  let generator: ExportGenerator;

  beforeEach(() => {
    generator = new ExportGenerator();
  });

  describe('toJSON', () => {
    it('should include CC-BY-4.0 license in output', () => {
      const data = [createAnonymizedOutage()];
      const result = generator.toJSON(data);
      const parsed = JSON.parse(result);

      expect(parsed.license.identifier).toBe('CC-BY-4.0');
      expect(parsed.license.name).toContain('Creative Commons');
      expect(parsed.license.url).toContain('creativecommons.org');
    });

    it('should include record count and exported timestamp', () => {
      const data = [createAnonymizedOutage(), createAnonymizedOutage({ id: 'anon-2' })];
      const result = generator.toJSON(data);
      const parsed = JSON.parse(result);

      expect(parsed.recordCount).toBe(2);
      expect(parsed.exportedAt).toBeDefined();
    });

    it('should serialize all outage fields correctly', () => {
      const data = [createAnonymizedOutage()];
      const result = generator.toJSON(data);
      const parsed = JSON.parse(result);
      const record = parsed.data[0];

      expect(record.id).toBe('anon-abc12345');
      expect(record.serviceSlug).toBe('github');
      expect(record.windowStart).toBe('2025-06-15T10:00:00.000Z');
      expect(record.durationMs).toBe(1800000);
      expect(record.detectionSignals).toEqual(['statistical', 'social']);
    });

    it('should handle null windowEnd', () => {
      const data = [createAnonymizedOutage({ windowEnd: null })];
      const result = generator.toJSON(data);
      const parsed = JSON.parse(result);

      expect(parsed.data[0].windowEnd).toBeNull();
    });
  });

  describe('toCSV', () => {
    it('should include license comment as first line', () => {
      const data = [createAnonymizedOutage()];
      const result = generator.toCSV(data);
      const lines = result.split('\n');

      expect(lines[0]).toMatch(/^# License: CC-BY-4.0/);
    });

    it('should include header row as second line', () => {
      const data = [createAnonymizedOutage()];
      const result = generator.toCSV(data);
      const lines = result.split('\n');
      const headers = lines[1]!.split(',');

      expect(headers).toContain('id');
      expect(headers).toContain('serviceSlug');
      expect(headers).toContain('serviceName');
      expect(headers).toContain('windowStart');
      expect(headers).toContain('durationMs');
      expect(headers).toContain('detectionSignals');
    });

    it('should escape values containing commas', () => {
      const data = [
        createAnonymizedOutage({ serviceName: 'Service, Inc.' }),
      ];
      const result = generator.toCSV(data);

      expect(result).toContain('"Service, Inc."');
    });

    it('should escape values containing double quotes', () => {
      const data = [
        createAnonymizedOutage({ serviceName: 'Say "Hello"' }),
      ];
      const result = generator.toCSV(data);

      expect(result).toContain('"Say ""Hello"""');
    });

    it('should produce correct number of data rows', () => {
      const data = [
        createAnonymizedOutage({ id: 'a1' }),
        createAnonymizedOutage({ id: 'a2' }),
        createAnonymizedOutage({ id: 'a3' }),
      ];
      const result = generator.toCSV(data);
      const lines = result.split('\n');

      // 1 license line + 1 header + 3 data rows
      expect(lines).toHaveLength(5);
    });
  });

  describe('toParquet', () => {
    it('should produce columnar format', () => {
      const data = [createAnonymizedOutage()];
      const result = generator.toParquet(data);
      const parsed = JSON.parse(result);

      expect(parsed.format).toBe('columnar');
      expect(parsed.version).toBe('1.0');
    });

    it('should include license in output', () => {
      const data = [createAnonymizedOutage()];
      const result = generator.toParquet(data);
      const parsed = JSON.parse(result);

      expect(parsed.license).toBe('CC-BY-4.0');
    });

    it('should organize data by columns', () => {
      const data = [
        createAnonymizedOutage({ id: 'a1', city: 'NYC' }),
        createAnonymizedOutage({ id: 'a2', city: 'LA' }),
      ];
      const result = generator.toParquet(data);
      const parsed = JSON.parse(result);

      expect(parsed.columns.id).toEqual(['a1', 'a2']);
      expect(parsed.columns.city).toEqual(['NYC', 'LA']);
      expect(parsed.rowCount).toBe(2);
    });

    it('should include schema with column types', () => {
      const data = [createAnonymizedOutage()];
      const result = generator.toParquet(data);
      const parsed = JSON.parse(result);

      const idSchema = parsed.schema.find((s: { name: string }) => s.name === 'id');
      expect(idSchema.type).toBe('string');

      const durSchema = parsed.schema.find((s: { name: string }) => s.name === 'durationMs');
      expect(durSchema.type).toBe('int64');

      const confSchema = parsed.schema.find((s: { name: string }) => s.name === 'confidence');
      expect(confSchema.type).toBe('float64');
    });
  });

  describe('streamExport', () => {
    it('should stream small datasets in a single chunk', async () => {
      const data = [createAnonymizedOutage()];
      const chunks: string[] = [];

      for await (const chunk of generator.streamExport(data, 'json')) {
        chunks.push(chunk);
      }

      expect(chunks).toHaveLength(1);
      const parsed = JSON.parse(chunks[0]!);
      expect(parsed.license.identifier).toBe('CC-BY-4.0');
    });

    it('should stream large datasets in multiple chunks', async () => {
      // Create 1200 records to exceed 500 chunk size
      const data = Array.from({ length: 1200 }, (_, i) =>
        createAnonymizedOutage({ id: `anon-${i}` }),
      );

      const chunks: string[] = [];
      for await (const chunk of generator.streamExport(data, 'csv')) {
        chunks.push(chunk);
      }

      expect(chunks.length).toBeGreaterThan(1);
      // First chunk should have headers
      expect(chunks[0]).toContain('id,serviceSlug');
    });

    it('should stream CSV format correctly', async () => {
      const data = [
        createAnonymizedOutage({ id: 'a1' }),
        createAnonymizedOutage({ id: 'a2' }),
      ];

      const chunks: string[] = [];
      for await (const chunk of generator.streamExport(data, 'csv')) {
        chunks.push(chunk);
      }

      const combined = chunks.join('\n');
      expect(combined).toContain('License: CC-BY-4.0');
      expect(combined).toContain('a1');
      expect(combined).toContain('a2');
    });

    it('should stream Parquet format', async () => {
      const data = [createAnonymizedOutage()];

      const chunks: string[] = [];
      for await (const chunk of generator.streamExport(data, 'parquet')) {
        chunks.push(chunk);
      }

      expect(chunks).toHaveLength(1);
      const parsed = JSON.parse(chunks[0]!);
      expect(parsed.format).toBe('columnar');
    });
  });
});
