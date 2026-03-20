/**
 * Data anonymization for the OpenPulse Open Data API (Sprint 19).
 *
 * Strips all PII from outage records, aggregates timestamps to 5-minute
 * windows, and reduces geographic precision to city level. Includes
 * compliance validation to detect PII leakage in output data.
 */

import type { AnonymizedOutage, RawOutageRecord } from './types.js';

/** 5-minute window in milliseconds. */
const FIVE_MINUTES_MS = 5 * 60 * 1000;

/** Patterns that indicate PII leakage. */
const PII_PATTERNS = {
  email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/,
  ipv4: /\b(?:\d{1,3}\.){3}\d{1,3}\b/,
  ipv6: /\b(?:[0-9a-fA-F]{1,4}:){2,7}[0-9a-fA-F]{1,4}\b/,
  deviceId: /\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b/,
  phoneNumber: /\b\+?1?\s*\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}\b/,
};

export interface ComplianceViolation {
  field: string;
  pattern: string;
  value: string;
}

/**
 * Anonymizes outage data by removing PII, aggregating time to 5-minute
 * windows, and reducing geographic precision to city level.
 */
export class DataAnonymizer {
  /**
   * Round a timestamp down to the nearest 5-minute window boundary.
   */
  private roundToWindow(date: Date): Date {
    const ms = date.getTime();
    const rounded = Math.floor(ms / FIVE_MINUTES_MS) * FIVE_MINUTES_MS;
    return new Date(rounded);
  }

  /**
   * Generate a deterministic anonymized ID from an outage ID.
   * Uses a simple hash to avoid exposing internal identifiers.
   */
  private anonymizeId(outageId: string): string {
    let hash = 0;
    for (let i = 0; i < outageId.length; i++) {
      const char = outageId.charCodeAt(i);
      hash = ((hash << 5) - hash + char) | 0;
    }
    const positiveHash = Math.abs(hash);
    return `anon-${positiveHash.toString(36).padStart(8, '0')}`;
  }

  /**
   * Anonymize a single raw outage record.
   *
   * Strips: reporterEmail, reporterIp, deviceId, latitude, longitude, rawReportData
   * Aggregates: timestamps to 5-min windows, geo to city level
   */
  anonymizeOutage(raw: RawOutageRecord): AnonymizedOutage {
    const windowStart = this.roundToWindow(raw.startedAt);
    const windowEnd = raw.resolvedAt ? this.roundToWindow(raw.resolvedAt) : null;

    // Compute aggregated duration from window boundaries
    const durationMs = windowEnd
      ? windowEnd.getTime() - windowStart.getTime()
      : raw.durationMs;

    return {
      id: this.anonymizeId(raw.outageId),
      serviceSlug: raw.serviceSlug,
      serviceName: raw.serviceName,
      category: raw.category,
      state: raw.state,
      confidence: Math.round(raw.confidence * 100) / 100,
      windowStart,
      windowEnd,
      durationMs: Math.max(0, durationMs),
      city: raw.city ?? 'Unknown',
      region: raw.region ?? 'Unknown',
      country: raw.country ?? 'Unknown',
      reportCount: raw.peakReportsPerMin,
      detectionSignals: [...raw.detectionSignals],
    };
  }

  /**
   * Anonymize an array of report records, returning only aggregate counts.
   * No individual report data is exposed.
   */
  anonymizeReports(
    reports: Array<{
      serviceSlug: string;
      category: string;
      city?: string;
      region?: string;
      country?: string;
      timestamp: Date;
      reporterEmail?: string;
      reporterIp?: string;
      deviceId?: string;
    }>,
  ): Array<{
    serviceSlug: string;
    category: string;
    city: string;
    region: string;
    country: string;
    windowStart: Date;
    count: number;
  }> {
    const buckets = new Map<string, {
      serviceSlug: string;
      category: string;
      city: string;
      region: string;
      country: string;
      windowStart: Date;
      count: number;
    }>();

    for (const report of reports) {
      const windowStart = this.roundToWindow(report.timestamp);
      const city = report.city ?? 'Unknown';
      const region = report.region ?? 'Unknown';
      const country = report.country ?? 'Unknown';
      const key = `${report.serviceSlug}:${city}:${windowStart.getTime()}`;

      const existing = buckets.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        buckets.set(key, {
          serviceSlug: report.serviceSlug,
          category: report.category,
          city,
          region,
          country,
          windowStart,
          count: 1,
        });
      }
    }

    return Array.from(buckets.values());
  }

  /**
   * Validate that anonymized data does not contain PII.
   * Scans all string values recursively for known PII patterns.
   *
   * Returns an array of violations found. Empty array means compliant.
   */
  validateCompliance(data: unknown): ComplianceViolation[] {
    const violations: ComplianceViolation[] = [];
    this.scanForPii(data, '', violations);
    return violations;
  }

  private scanForPii(
    value: unknown,
    path: string,
    violations: ComplianceViolation[],
  ): void {
    if (typeof value === 'string') {
      for (const [patternName, regex] of Object.entries(PII_PATTERNS)) {
        if (regex.test(value)) {
          violations.push({
            field: path || '(root)',
            pattern: patternName,
            value: value.slice(0, 50),
          });
        }
      }
    } else if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        this.scanForPii(value[i], `${path}[${i}]`, violations);
      }
    } else if (value !== null && typeof value === 'object') {
      if (value instanceof Date) return;
      for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
        this.scanForPii(val, path ? `${path}.${key}` : key, violations);
      }
    }
  }

  /**
   * Process an array of raw outage records through anonymization.
   * More efficient than calling anonymizeOutage individually due to
   * batch ID generation and validation.
   */
  batchAnonymize(records: RawOutageRecord[]): AnonymizedOutage[] {
    const results: AnonymizedOutage[] = [];

    for (const record of records) {
      const anonymized = this.anonymizeOutage(record);
      results.push(anonymized);
    }

    // Post-batch compliance check
    const violations = this.validateCompliance(results);
    if (violations.length > 0) {
      throw new Error(
        `PII leakage detected in batch output: ${violations.length} violation(s) found. ` +
        `First violation: ${violations[0]!.pattern} in field ${violations[0]!.field}`,
      );
    }

    return results;
  }
}
