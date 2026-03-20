/**
 * Service-related types for OpenPulse.
 * Represents monitored cloud services and their metadata.
 */

export type ServiceCategory =
  | 'cloud'
  | 'cdn'
  | 'dns'
  | 'email'
  | 'messaging'
  | 'payments'
  | 'social'
  | 'streaming'
  | 'storage'
  | 'other';

export type ServiceRegion =
  | 'us-east'
  | 'us-west'
  | 'eu-west'
  | 'eu-central'
  | 'ap-southeast'
  | 'ap-northeast'
  | 'sa-east'
  | 'global';

export interface ServiceEndpoint {
  readonly url: string;
  readonly region: ServiceRegion;
  readonly protocol: 'http' | 'https' | 'tcp' | 'icmp';
  readonly port?: number;
}

export interface Service {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly category: ServiceCategory;
  readonly homepageUrl: string;
  readonly statusPageUrl?: string;
  readonly iconUrl?: string;
  readonly endpoints: readonly ServiceEndpoint[];
  readonly regions: readonly ServiceRegion[];
  readonly isActive: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface ServiceSummary {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly category: ServiceCategory;
  readonly currentStatus: 'operational' | 'degraded' | 'partial_outage' | 'major_outage';
  readonly regions: readonly ServiceRegion[];
}
