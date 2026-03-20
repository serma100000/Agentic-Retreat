/**
 * User report types for OpenPulse.
 * Represents outage reports submitted by users.
 */

export type ReportType = 'outage' | 'degraded' | 'intermittent' | 'resolved';

export interface ReportSubmission {
  readonly serviceId: string;
  readonly type: ReportType;
  readonly region?: string;
  readonly description?: string;
  readonly evidenceUrl?: string;
  readonly fingerprint: string;
}

export interface OutageReport {
  readonly id: string;
  readonly serviceId: string;
  readonly type: ReportType;
  readonly region: string | null;
  readonly description: string | null;
  readonly evidenceUrl: string | null;
  readonly fingerprint: string;
  readonly ipHash: string;
  readonly submittedAt: Date;
  readonly verifiedAt: Date | null;
  readonly isVerified: boolean;
}

export interface ReportAggregation {
  readonly serviceId: string;
  readonly totalReports: number;
  readonly reportsByType: Readonly<Record<ReportType, number>>;
  readonly reportsByRegion: Readonly<Record<string, number>>;
  readonly windowStart: Date;
  readonly windowEnd: Date;
}
