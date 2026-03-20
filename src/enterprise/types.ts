/**
 * Enterprise feature types for OpenPulse Sprints 17-18.
 * Covers OAuth, organizations, SLA tracking, API key tiers,
 * custom monitors, and team dashboards.
 */

// ── Organization ────────────────────────────────────────────────

export type OrgPlan = 'free' | 'team' | 'enterprise';

export interface Organization {
  id: string;
  name: string;
  slug: string;
  plan: OrgPlan;
  maxMembers: number;
  maxMonitors: number;
  createdAt: Date;
}

// ── Team Members ────────────────────────────────────────────────

export type MemberRole = 'owner' | 'admin' | 'member' | 'viewer';

export interface TeamMember {
  userId: string;
  orgId: string;
  role: MemberRole;
  invitedBy: string;
  joinedAt: Date;
}

// ── Custom Monitors ─────────────────────────────────────────────

export type ProbeType = 'http' | 'tcp' | 'ping' | 'dns' | 'tls';
export type AlertChannel = 'email' | 'webhook' | 'slack';

export interface AlertPolicy {
  channels: AlertChannel[];
  threshold: number;       // consecutive failures before alerting
  cooldownMinutes: number; // min gap between repeated alerts
}

export interface CustomMonitor {
  id: string;
  orgId: string;
  name: string;
  url: string;
  probeTypes: ProbeType[];
  interval: number;        // seconds, minimum 30
  regions: string[];
  alertPolicy: AlertPolicy;
  createdAt: Date;
}

// ── SLA ─────────────────────────────────────────────────────────

export type MeasurementWindow = 'monthly' | 'quarterly' | 'yearly';

export interface SLATarget {
  id: string;
  orgId: string;
  serviceId: string;
  uptimeTarget: number;          // e.g. 99.9
  responseTimeTarget: number;    // milliseconds
  measurementWindow: MeasurementWindow;
}

export interface SLAViolation {
  startedAt: Date;
  resolvedAt: Date;
  duration: number;   // milliseconds
  impactLevel: 'minor' | 'major' | 'critical';
}

export interface SLAReport {
  slaId: string;
  period: { start: Date; end: Date };
  actualUptime: number;   // percentage
  targetUptime: number;   // percentage
  met: boolean;
  violations: SLAViolation[];
  generatedAt: Date;
}

// ── OAuth ───────────────────────────────────────────────────────

export type OAuthProvider = 'google' | 'github' | 'discord';

export interface AuthSession {
  userId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  provider: OAuthProvider;
}

export interface OAuthProviderConfig {
  clientId: string;
  clientSecret: string;
  authorizationUrl: string;
  tokenUrl: string;
  userInfoUrl: string;
  scopes: string[];
  redirectUri: string;
}

export interface PKCEPair {
  codeVerifier: string;
  codeChallenge: string;
}

// ── API Keys ────────────────────────────────────────────────────

export type ApiKeyTierName = 'free' | 'pro' | 'enterprise';

export interface ApiKeyTier {
  name: ApiKeyTierName;
  rateLimit: number;   // requests per minute
  maxKeys: number;
  features: string[];
}

export interface ApiKeyRecord {
  id: string;
  userId: string;
  name: string;
  keyHash: string;
  prefix: string;
  scopes: string[];
  tier: ApiKeyTierName;
  createdAt: Date;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  revoked: boolean;
}

// ── Team Dashboard ──────────────────────────────────────────────

export type WidgetType =
  | 'status-grid'
  | 'uptime-chart'
  | 'latency-graph'
  | 'sla-gauge'
  | 'incident-timeline';

export interface DashboardWidget {
  id: string;
  type: WidgetType;
  serviceId?: string;
  position: { x: number; y: number; w: number; h: number };
}

export interface TeamDashboard {
  id: string;
  orgId: string;
  name: string;
  services: string[];
  layout: 'grid' | 'list' | 'freeform';
  widgets: DashboardWidget[];
  createdAt: Date;
}

// ── Service status (used by dashboard aggregation) ──────────────

export interface ServiceStatus {
  slug: string;
  status: 'operational' | 'degraded' | 'partial_outage' | 'major_outage';
  confidence: number;
  sla?: { target: number; actual: number; met: boolean };
}

export interface DashboardData {
  services: ServiceStatus[];
  summary: {
    total: number;
    operational: number;
    degraded: number;
    outage: number;
  };
}
