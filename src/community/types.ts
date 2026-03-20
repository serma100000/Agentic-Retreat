/**
 * Types for the OpenPulse community contribution system.
 *
 * Covers service contributions, review workflows,
 * community profiles, public outage database, and historical queries.
 */

export const ContributionStatus = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
} as const;

export type ContributionStatusType =
  (typeof ContributionStatus)[keyof typeof ContributionStatus];

export const ServiceCategory = {
  CLOUD: 'cloud',
  SOCIAL_MEDIA: 'social_media',
  DEVELOPER_TOOLS: 'developer_tools',
  COMMUNICATION: 'communication',
  FINANCE: 'finance',
  GAMING: 'gaming',
  STREAMING: 'streaming',
  ECOMMERCE: 'ecommerce',
  PRODUCTIVITY: 'productivity',
  SECURITY: 'security',
  CDN: 'cdn',
  DNS: 'dns',
  OTHER: 'other',
} as const;

export type ServiceCategoryType =
  (typeof ServiceCategory)[keyof typeof ServiceCategory];

export const ALLOWED_CATEGORIES: ServiceCategoryType[] = Object.values(ServiceCategory);

export interface ServiceContribution {
  id: string;
  name: string;
  slug: string;
  url: string;
  statusPageUrl?: string;
  category: ServiceCategoryType;
  description: string;
  submittedBy: string;
  submittedAt: Date;
  status: ContributionStatusType;
  reviewedBy?: string;
  reviewedAt?: Date;
  reviewComment?: string;
  tags?: string[];
}

export interface CommunityUser {
  id: string;
  username: string;
  displayName: string;
  email: string;
  contributions: number;
  approvedContributions: number;
  joinedAt: Date;
  reputation: number;
}

export interface ContributionReview {
  contributionId: string;
  reviewerId: string;
  decision: 'approved' | 'rejected';
  comment: string;
  validationResults: ServiceValidation;
  reviewedAt: Date;
}

export interface ServiceValidation {
  valid: boolean;
  errors: ValidationMessage[];
  warnings: ValidationMessage[];
}

export interface ValidationMessage {
  field: string;
  message: string;
  code: string;
}

export const OutageSeverity = {
  MINOR: 'minor',
  MAJOR: 'major',
  CRITICAL: 'critical',
} as const;

export type OutageSeverityType =
  (typeof OutageSeverity)[keyof typeof OutageSeverity];

export interface OutageReport {
  id: string;
  serviceSlug: string;
  serviceName: string;
  title: string;
  severity: OutageSeverityType;
  startedAt: Date;
  resolvedAt: Date | null;
  durationMs: number | null;
  affectedRegions: string[];
  peakAnomalyScore: number;
  peakConfidence: number;
  timeline: OutageTimelineEvent[];
  tags?: string[];
}

export interface OutageTimelineEvent {
  timestamp: Date;
  state: string;
  description: string;
  score: number;
  confidence: number;
}

export interface HistoricalQuery {
  serviceSlug?: string;
  severity?: OutageSeverityType;
  startDate?: Date;
  endDate?: Date;
  region?: string;
  limit?: number;
  offset?: number;
}

export interface OutageStatistics {
  serviceSlug: string;
  totalOutages: number;
  averageDurationMs: number;
  mttr: number; // Mean Time to Recovery
  longestOutageMs: number;
  mostAffectedRegion: string | null;
  outageBySeverity: Record<OutageSeverityType, number>;
  uptimePercentage: number;
}

export type ExportFormat = 'json' | 'csv';
