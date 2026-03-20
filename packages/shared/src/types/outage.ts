/**
 * Outage-related types for OpenPulse.
 * Core domain types for detected and tracked outages.
 */

import type { ServiceRegion } from './service.js';

export type OutageState =
  | 'suspected'
  | 'confirmed'
  | 'monitoring'
  | 'resolving'
  | 'resolved';

export type OutageSeverity = 'minor' | 'moderate' | 'major' | 'critical';

export interface ConfidenceScore {
  readonly value: number;
  readonly probeWeight: number;
  readonly reportWeight: number;
  readonly mlWeight: number;
  readonly calculatedAt: Date;
}

export interface DetectionEvent {
  readonly id: string;
  readonly outageId: string;
  readonly source: 'probe' | 'report' | 'ml' | 'status_page';
  readonly detail: string;
  readonly confidence: number;
  readonly occurredAt: Date;
}

export interface OutageTimeline {
  readonly events: readonly DetectionEvent[];
  readonly firstDetectedAt: Date;
  readonly lastUpdatedAt: Date;
  readonly confirmedAt: Date | null;
  readonly resolvedAt: Date | null;
}

export interface Outage {
  readonly id: string;
  readonly serviceId: string;
  readonly state: OutageState;
  readonly severity: OutageSeverity;
  readonly title: string;
  readonly summary: string | null;
  readonly affectedRegions: readonly ServiceRegion[];
  readonly confidence: ConfidenceScore;
  readonly timeline: OutageTimeline;
  readonly reportCount: number;
  readonly isConfirmedByProvider: boolean;
  readonly startedAt: Date;
  readonly resolvedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface OutageSummary {
  readonly id: string;
  readonly serviceId: string;
  readonly serviceName: string;
  readonly state: OutageState;
  readonly severity: OutageSeverity;
  readonly title: string;
  readonly affectedRegions: readonly ServiceRegion[];
  readonly confidence: number;
  readonly reportCount: number;
  readonly startedAt: Date;
  readonly resolvedAt: Date | null;
}
