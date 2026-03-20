/**
 * Enterprise module barrel export.
 * Sprints 17-18: OAuth, organizations, SLA, API keys, team dashboards.
 */

// ── Types ───────────────────────────────────────────────────────
export type {
  AlertChannel,
  AlertPolicy,
  ApiKeyRecord,
  ApiKeyTier,
  ApiKeyTierName,
  AuthSession,
  CustomMonitor,
  DashboardData,
  DashboardWidget,
  MeasurementWindow,
  MemberRole,
  OAuthProvider,
  OAuthProviderConfig,
  Organization,
  OrgPlan,
  PKCEPair,
  ProbeType,
  SLAReport,
  SLATarget,
  SLAViolation,
  ServiceStatus,
  TeamDashboard,
  TeamMember,
  WidgetType,
} from './types.js';

// ── Auth ────────────────────────────────────────────────────────
export { OAuthHandler, InMemoryOAuthUserStore } from './auth/oauth-handler.js';
export type { OAuthUserStore, FetchFn } from './auth/oauth-handler.js';
export { SessionManager } from './auth/session-manager.js';
export type { SessionTokens, AccessTokenPayload } from './auth/session-manager.js';
export { ApiKeyManager } from './auth/api-key-manager.js';

// ── Organization ────────────────────────────────────────────────
export { OrganizationService } from './org/organization-service.js';

// ── Monitoring ──────────────────────────────────────────────────
export { CustomMonitorService } from './monitoring/custom-monitor-service.js';
export type { MonitorStatus, MonitorCreateInput } from './monitoring/custom-monitor-service.js';

// ── SLA ─────────────────────────────────────────────────────────
export { SLATracker } from './sla/sla-tracker.js';

// ── Dashboard ───────────────────────────────────────────────────
export {
  TeamDashboardService,
  InMemoryStatusProvider,
} from './dashboard/team-dashboard-service.js';
export type { ServiceStatusProvider } from './dashboard/team-dashboard-service.js';
