/**
 * Types for OpenPulse Infrastructure-as-Code providers.
 *
 * Covers Terraform resources and data sources, Pulumi resources,
 * and shared configuration shapes for service monitors, notification
 * rules, and dashboards.
 */

export interface ProviderConfig {
  apiUrl: string;
  apiKey: string;
  organizationId?: string;
  environment?: string;
}

export interface ServiceMonitorConfig {
  name: string;
  slug: string;
  url: string;
  checkIntervalSeconds: number;
  regions: string[];
  alertThreshold: number;
  tags?: Record<string, string>;
  expectedStatusCode?: number;
  timeout?: number;
  headers?: Record<string, string>;
}

export interface NotificationRuleConfig {
  name: string;
  serviceMonitorId: string;
  channel: 'email' | 'slack' | 'pagerduty' | 'webhook' | 'teams';
  destination: string;
  severity: 'info' | 'warning' | 'critical';
  conditions: NotificationCondition[];
  enabled?: boolean;
  cooldownMinutes?: number;
}

export interface NotificationCondition {
  metric: 'status' | 'latency' | 'error_rate' | 'confidence';
  operator: 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'neq';
  value: number;
}

export interface DashboardConfig {
  name: string;
  teamId: string;
  description?: string;
  widgets: DashboardWidget[];
  isPublic?: boolean;
  refreshIntervalSeconds?: number;
}

export interface DashboardWidget {
  type: 'status_grid' | 'uptime_chart' | 'latency_graph' | 'outage_timeline' | 'metric_counter';
  title: string;
  serviceMonitorIds: string[];
  position: { row: number; col: number; width: number; height: number };
}

export interface TerraformResource {
  resourceType: string;
  resourceName: string;
  attributes: Record<string, unknown>;
  dependsOn?: string[];
  lifecycle?: {
    createBeforeDestroy?: boolean;
    preventDestroy?: boolean;
    ignoreChanges?: string[];
  };
}

export interface TerraformDataSource {
  dataType: string;
  dataName: string;
  filters: Record<string, unknown>;
}

export interface PulumiResource {
  resourceType: string;
  resourceName: string;
  inputs: Record<string, unknown>;
  options?: {
    dependsOn?: string[];
    protect?: boolean;
    parent?: string;
  };
}
