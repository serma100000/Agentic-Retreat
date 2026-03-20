/**
 * Pulumi SDK generator for the OpenPulse provider.
 *
 * Produces complete TypeScript and Python provider code,
 * and individual resource definitions compatible with the
 * Pulumi resource model.
 */

import type {
  ProviderConfig,
  ServiceMonitorConfig,
  PulumiResource,
} from './types.js';

function toSnakeCase(str: string): string {
  return str.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '');
}

function toPascalCase(str: string): string {
  return str
    .split(/[-_\s]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join('');
}

function escapeTs(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/`/g, '\\`');
}

function escapePy(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

export class PulumiProvider {
  generateTypeScriptSDK(config?: ProviderConfig): string {
    const apiUrl = config?.apiUrl ?? 'https://api.openpulse.io';
    const lines: string[] = [];

    lines.push(`import * as pulumi from '@pulumi/pulumi';`);
    lines.push('');
    lines.push('// --- Provider ---');
    lines.push('');
    lines.push('export interface OpenPulseProviderArgs {');
    lines.push('  apiUrl?: pulumi.Input<string>;');
    lines.push('  apiKey: pulumi.Input<string>;');
    lines.push('  organizationId?: pulumi.Input<string>;');
    lines.push('  environment?: pulumi.Input<string>;');
    lines.push('}');
    lines.push('');
    lines.push('export class OpenPulseProvider extends pulumi.ProviderResource {');
    lines.push('  public readonly apiUrl!: pulumi.Output<string>;');
    lines.push('  public readonly organizationId!: pulumi.Output<string | undefined>;');
    lines.push('');
    lines.push('  constructor(');
    lines.push('    name: string,');
    lines.push('    args: OpenPulseProviderArgs,');
    lines.push('    opts?: pulumi.ResourceOptions,');
    lines.push('  ) {');
    lines.push(`    super('openpulse', name, {`);
    lines.push(`      apiUrl: args.apiUrl ?? '${escapeTs(apiUrl)}',`);
    lines.push('      apiKey: args.apiKey,');
    lines.push('      organizationId: args.organizationId,');
    lines.push('      environment: args.environment,');
    lines.push('    }, opts);');
    lines.push('  }');
    lines.push('}');
    lines.push('');
    lines.push('// --- Service Monitor ---');
    lines.push('');
    lines.push('export interface ServiceMonitorArgs {');
    lines.push('  name: pulumi.Input<string>;');
    lines.push('  slug: pulumi.Input<string>;');
    lines.push('  url: pulumi.Input<string>;');
    lines.push('  checkIntervalSeconds: pulumi.Input<number>;');
    lines.push('  regions: pulumi.Input<pulumi.Input<string>[]>;');
    lines.push('  alertThreshold: pulumi.Input<number>;');
    lines.push('  tags?: pulumi.Input<Record<string, pulumi.Input<string>>>;');
    lines.push('  expectedStatusCode?: pulumi.Input<number>;');
    lines.push('  timeout?: pulumi.Input<number>;');
    lines.push('  headers?: pulumi.Input<Record<string, pulumi.Input<string>>>;');
    lines.push('}');
    lines.push('');
    lines.push('export class ServiceMonitor extends pulumi.CustomResource {');
    lines.push('  public readonly name!: pulumi.Output<string>;');
    lines.push('  public readonly slug!: pulumi.Output<string>;');
    lines.push('  public readonly url!: pulumi.Output<string>;');
    lines.push('  public readonly checkIntervalSeconds!: pulumi.Output<number>;');
    lines.push('  public readonly regions!: pulumi.Output<string[]>;');
    lines.push('  public readonly alertThreshold!: pulumi.Output<number>;');
    lines.push('  public readonly status!: pulumi.Output<string>;');
    lines.push('');
    lines.push('  constructor(');
    lines.push('    name: string,');
    lines.push('    args: ServiceMonitorArgs,');
    lines.push('    opts?: pulumi.CustomResourceOptions,');
    lines.push('  ) {');
    lines.push(`    super('openpulse:index:ServiceMonitor', name, {`);
    lines.push('      ...args,');
    lines.push("      status: undefined, // computed by provider");
    lines.push('    }, opts);');
    lines.push('  }');
    lines.push('}');
    lines.push('');
    lines.push('// --- Notification Rule ---');
    lines.push('');
    lines.push('export interface NotificationConditionArgs {');
    lines.push("  metric: pulumi.Input<'status' | 'latency' | 'error_rate' | 'confidence'>;");
    lines.push("  operator: pulumi.Input<'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'neq'>;");
    lines.push('  value: pulumi.Input<number>;');
    lines.push('}');
    lines.push('');
    lines.push('export interface NotificationRuleArgs {');
    lines.push('  name: pulumi.Input<string>;');
    lines.push('  serviceMonitorId: pulumi.Input<string>;');
    lines.push("  channel: pulumi.Input<'email' | 'slack' | 'pagerduty' | 'webhook' | 'teams'>;");
    lines.push('  destination: pulumi.Input<string>;');
    lines.push("  severity: pulumi.Input<'info' | 'warning' | 'critical'>;");
    lines.push('  conditions: pulumi.Input<pulumi.Input<NotificationConditionArgs>[]>;');
    lines.push('  enabled?: pulumi.Input<boolean>;');
    lines.push('  cooldownMinutes?: pulumi.Input<number>;');
    lines.push('}');
    lines.push('');
    lines.push('export class NotificationRule extends pulumi.CustomResource {');
    lines.push('  public readonly name!: pulumi.Output<string>;');
    lines.push('  public readonly serviceMonitorId!: pulumi.Output<string>;');
    lines.push("  public readonly channel!: pulumi.Output<string>;");
    lines.push('  public readonly enabled!: pulumi.Output<boolean>;');
    lines.push('');
    lines.push('  constructor(');
    lines.push('    name: string,');
    lines.push('    args: NotificationRuleArgs,');
    lines.push('    opts?: pulumi.CustomResourceOptions,');
    lines.push('  ) {');
    lines.push(`    super('openpulse:index:NotificationRule', name, {`);
    lines.push('      ...args,');
    lines.push('      enabled: args.enabled ?? true,');
    lines.push('    }, opts);');
    lines.push('  }');
    lines.push('}');
    lines.push('');
    lines.push('// --- Team Dashboard ---');
    lines.push('');
    lines.push('export interface DashboardWidgetArgs {');
    lines.push("  type: pulumi.Input<'status_grid' | 'uptime_chart' | 'latency_graph' | 'outage_timeline' | 'metric_counter'>;");
    lines.push('  title: pulumi.Input<string>;');
    lines.push('  serviceMonitorIds: pulumi.Input<pulumi.Input<string>[]>;');
    lines.push('  position: pulumi.Input<{ row: number; col: number; width: number; height: number }>;');
    lines.push('}');
    lines.push('');
    lines.push('export interface TeamDashboardArgs {');
    lines.push('  name: pulumi.Input<string>;');
    lines.push('  teamId: pulumi.Input<string>;');
    lines.push('  description?: pulumi.Input<string>;');
    lines.push('  widgets: pulumi.Input<pulumi.Input<DashboardWidgetArgs>[]>;');
    lines.push('  isPublic?: pulumi.Input<boolean>;');
    lines.push('  refreshIntervalSeconds?: pulumi.Input<number>;');
    lines.push('}');
    lines.push('');
    lines.push('export class TeamDashboard extends pulumi.CustomResource {');
    lines.push('  public readonly name!: pulumi.Output<string>;');
    lines.push('  public readonly teamId!: pulumi.Output<string>;');
    lines.push('  public readonly isPublic!: pulumi.Output<boolean>;');
    lines.push('  public readonly dashboardUrl!: pulumi.Output<string>;');
    lines.push('');
    lines.push('  constructor(');
    lines.push('    name: string,');
    lines.push('    args: TeamDashboardArgs,');
    lines.push('    opts?: pulumi.CustomResourceOptions,');
    lines.push('  ) {');
    lines.push(`    super('openpulse:index:TeamDashboard', name, {`);
    lines.push('      ...args,');
    lines.push('      isPublic: args.isPublic ?? false,');
    lines.push("      dashboardUrl: undefined, // computed by provider");
    lines.push('    }, opts);');
    lines.push('  }');
    lines.push('}');
    lines.push('');

    return lines.join('\n');
  }

  generatePythonSDK(config?: ProviderConfig): string {
    const apiUrl = config?.apiUrl ?? 'https://api.openpulse.io';
    const lines: string[] = [];

    lines.push('"""OpenPulse Pulumi Provider SDK for Python."""');
    lines.push('');
    lines.push('from typing import Any, Mapping, Optional, Sequence');
    lines.push('');
    lines.push('import pulumi');
    lines.push('import pulumi.runtime');
    lines.push('');
    lines.push('');
    lines.push('class OpenPulseProvider(pulumi.ProviderResource):');
    lines.push('    """OpenPulse provider configuration."""');
    lines.push('');
    lines.push('    api_url: pulumi.Output[str]');
    lines.push('    organization_id: pulumi.Output[Optional[str]]');
    lines.push('');
    lines.push('    def __init__(');
    lines.push('        self,');
    lines.push('        resource_name: str,');
    lines.push('        api_key: pulumi.Input[str],');
    lines.push('        api_url: Optional[pulumi.Input[str]] = None,');
    lines.push('        organization_id: Optional[pulumi.Input[str]] = None,');
    lines.push('        environment: Optional[pulumi.Input[str]] = None,');
    lines.push('        opts: Optional[pulumi.ResourceOptions] = None,');
    lines.push('    ) -> None:');
    lines.push(`        super().__init__(`);
    lines.push(`            'openpulse',`);
    lines.push('            resource_name,');
    lines.push('            {');
    lines.push(`                'api_url': api_url or '${escapePy(apiUrl)}',`);
    lines.push(`                'api_key': api_key,`);
    lines.push(`                'organization_id': organization_id,`);
    lines.push(`                'environment': environment,`);
    lines.push('            },');
    lines.push('            opts,');
    lines.push('        )');
    lines.push('');
    lines.push('');
    lines.push('class ServiceMonitor(pulumi.CustomResource):');
    lines.push('    """Monitor a service for outages."""');
    lines.push('');
    lines.push('    name: pulumi.Output[str]');
    lines.push('    slug: pulumi.Output[str]');
    lines.push('    url: pulumi.Output[str]');
    lines.push('    check_interval_seconds: pulumi.Output[int]');
    lines.push('    regions: pulumi.Output[Sequence[str]]');
    lines.push('    alert_threshold: pulumi.Output[float]');
    lines.push('    status: pulumi.Output[str]');
    lines.push('');
    lines.push('    def __init__(');
    lines.push('        self,');
    lines.push('        resource_name: str,');
    lines.push('        name: pulumi.Input[str],');
    lines.push('        slug: pulumi.Input[str],');
    lines.push('        url: pulumi.Input[str],');
    lines.push('        check_interval_seconds: pulumi.Input[int],');
    lines.push('        regions: pulumi.Input[Sequence[pulumi.Input[str]]],');
    lines.push('        alert_threshold: pulumi.Input[float],');
    lines.push('        tags: Optional[pulumi.Input[Mapping[str, pulumi.Input[str]]]] = None,');
    lines.push('        expected_status_code: Optional[pulumi.Input[int]] = None,');
    lines.push('        timeout: Optional[pulumi.Input[int]] = None,');
    lines.push('        headers: Optional[pulumi.Input[Mapping[str, pulumi.Input[str]]]] = None,');
    lines.push('        opts: Optional[pulumi.CustomResourceOptions] = None,');
    lines.push('    ) -> None:');
    lines.push(`        super().__init__(`);
    lines.push(`            'openpulse:index:ServiceMonitor',`);
    lines.push('            resource_name,');
    lines.push('            {');
    lines.push(`                'name': name,`);
    lines.push(`                'slug': slug,`);
    lines.push(`                'url': url,`);
    lines.push(`                'check_interval_seconds': check_interval_seconds,`);
    lines.push(`                'regions': regions,`);
    lines.push(`                'alert_threshold': alert_threshold,`);
    lines.push(`                'tags': tags,`);
    lines.push(`                'expected_status_code': expected_status_code,`);
    lines.push(`                'timeout': timeout,`);
    lines.push(`                'headers': headers,`);
    lines.push(`                'status': None,`);
    lines.push('            },');
    lines.push('            opts,');
    lines.push('        )');
    lines.push('');
    lines.push('');
    lines.push('class NotificationRule(pulumi.CustomResource):');
    lines.push('    """Notification rule for service outages."""');
    lines.push('');
    lines.push('    name: pulumi.Output[str]');
    lines.push('    service_monitor_id: pulumi.Output[str]');
    lines.push('    channel: pulumi.Output[str]');
    lines.push('    enabled: pulumi.Output[bool]');
    lines.push('');
    lines.push('    def __init__(');
    lines.push('        self,');
    lines.push('        resource_name: str,');
    lines.push('        name: pulumi.Input[str],');
    lines.push('        service_monitor_id: pulumi.Input[str],');
    lines.push('        channel: pulumi.Input[str],');
    lines.push('        destination: pulumi.Input[str],');
    lines.push('        severity: pulumi.Input[str],');
    lines.push('        conditions: pulumi.Input[Sequence[Mapping[str, Any]]],');
    lines.push('        enabled: Optional[pulumi.Input[bool]] = True,');
    lines.push('        cooldown_minutes: Optional[pulumi.Input[int]] = None,');
    lines.push('        opts: Optional[pulumi.CustomResourceOptions] = None,');
    lines.push('    ) -> None:');
    lines.push(`        super().__init__(`);
    lines.push(`            'openpulse:index:NotificationRule',`);
    lines.push('            resource_name,');
    lines.push('            {');
    lines.push(`                'name': name,`);
    lines.push(`                'service_monitor_id': service_monitor_id,`);
    lines.push(`                'channel': channel,`);
    lines.push(`                'destination': destination,`);
    lines.push(`                'severity': severity,`);
    lines.push(`                'conditions': conditions,`);
    lines.push(`                'enabled': enabled,`);
    lines.push(`                'cooldown_minutes': cooldown_minutes,`);
    lines.push('            },');
    lines.push('            opts,');
    lines.push('        )');
    lines.push('');
    lines.push('');
    lines.push('class TeamDashboard(pulumi.CustomResource):');
    lines.push('    """Team dashboard for monitoring services."""');
    lines.push('');
    lines.push('    name: pulumi.Output[str]');
    lines.push('    team_id: pulumi.Output[str]');
    lines.push('    is_public: pulumi.Output[bool]');
    lines.push('    dashboard_url: pulumi.Output[str]');
    lines.push('');
    lines.push('    def __init__(');
    lines.push('        self,');
    lines.push('        resource_name: str,');
    lines.push('        name: pulumi.Input[str],');
    lines.push('        team_id: pulumi.Input[str],');
    lines.push('        widgets: pulumi.Input[Sequence[Mapping[str, Any]]],');
    lines.push('        description: Optional[pulumi.Input[str]] = None,');
    lines.push('        is_public: Optional[pulumi.Input[bool]] = False,');
    lines.push('        refresh_interval_seconds: Optional[pulumi.Input[int]] = None,');
    lines.push('        opts: Optional[pulumi.CustomResourceOptions] = None,');
    lines.push('    ) -> None:');
    lines.push(`        super().__init__(`);
    lines.push(`            'openpulse:index:TeamDashboard',`);
    lines.push('            resource_name,');
    lines.push('            {');
    lines.push(`                'name': name,`);
    lines.push(`                'team_id': team_id,`);
    lines.push(`                'description': description,`);
    lines.push(`                'widgets': widgets,`);
    lines.push(`                'is_public': is_public,`);
    lines.push(`                'refresh_interval_seconds': refresh_interval_seconds,`);
    lines.push(`                'dashboard_url': None,`);
    lines.push('            },');
    lines.push('            opts,');
    lines.push('        )');
    lines.push('');

    return lines.join('\n');
  }

  generateServiceMonitor(config: ServiceMonitorConfig): PulumiResource {
    return {
      resourceType: 'openpulse:index:ServiceMonitor',
      resourceName: config.slug.replace(/[^a-zA-Z0-9_-]/g, '_'),
      inputs: {
        name: config.name,
        slug: config.slug,
        url: config.url,
        checkIntervalSeconds: config.checkIntervalSeconds,
        regions: config.regions,
        alertThreshold: config.alertThreshold,
        tags: config.tags,
        expectedStatusCode: config.expectedStatusCode,
        timeout: config.timeout,
        headers: config.headers,
      },
    };
  }
}
