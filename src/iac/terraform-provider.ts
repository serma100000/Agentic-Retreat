/**
 * Terraform HCL generator for the OpenPulse provider.
 *
 * Produces valid HCL strings for provider configuration,
 * service monitors, notification rules, dashboards, and
 * data sources.
 */

import type {
  ProviderConfig,
  ServiceMonitorConfig,
  NotificationRuleConfig,
  DashboardConfig,
  TerraformResource,
  TerraformDataSource,
} from './types.js';

function indent(text: string, level: number): string {
  const prefix = '  '.repeat(level);
  return text
    .split('\n')
    .map((line) => (line.trim() ? `${prefix}${line}` : line))
    .join('\n');
}

function escapeHcl(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\t/g, '\\t');
}

function hclValue(value: unknown, depth: number = 1): string {
  if (value === null || value === undefined) return '""';
  if (typeof value === 'string') return `"${escapeHcl(value)}"`;
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';

  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    const items = value.map((v) => hclValue(v, depth + 1)).join(', ');
    return `[${items}]`;
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return '{}';
    const lines = entries.map(
      ([k, v]) => `${indent('', depth)}${k} = ${hclValue(v, depth + 1)}`,
    );
    return `{\n${lines.join('\n')}\n${indent('', depth - 1)}}`;
  }

  return `"${escapeHcl(String(value))}"`;
}

function renderBlock(
  type: string,
  labels: string[],
  body: Record<string, unknown>,
  nestedBlocks?: Array<{ blockType: string; body: Record<string, unknown> }>,
): string {
  const labelStr = labels.map((l) => `"${escapeHcl(l)}"`).join(' ');
  const header = labelStr ? `${type} ${labelStr}` : type;

  const lines: string[] = [];
  lines.push(`${header} {`);

  for (const [key, value] of Object.entries(body)) {
    if (value === undefined) continue;
    lines.push(`  ${key} = ${hclValue(value)}`);
  }

  if (nestedBlocks) {
    for (const nested of nestedBlocks) {
      lines.push('');
      lines.push(`  ${nested.blockType} {`);
      for (const [key, value] of Object.entries(nested.body)) {
        if (value === undefined) continue;
        lines.push(`    ${key} = ${hclValue(value, 2)}`);
      }
      lines.push('  }');
    }
  }

  lines.push('}');
  return lines.join('\n');
}

export class TerraformProvider {
  generateProvider(config: ProviderConfig): string {
    const terraformBlock = [
      'terraform {',
      '  required_providers {',
      '    openpulse = {',
      '      source  = "openpulse/openpulse"',
      '      version = "~> 1.0"',
      '    }',
      '  }',
      '}',
    ].join('\n');

    const body: Record<string, unknown> = {
      api_url: config.apiUrl,
      api_key: config.apiKey,
    };
    if (config.organizationId) body['organization_id'] = config.organizationId;
    if (config.environment) body['environment'] = config.environment;

    const providerBlock = renderBlock('provider', ['openpulse'], body);

    return `${terraformBlock}\n\n${providerBlock}\n`;
  }

  generateServiceMonitor(config: ServiceMonitorConfig): string {
    const resourceName = config.slug.replace(/[^a-zA-Z0-9_]/g, '_');

    const body: Record<string, unknown> = {
      name: config.name,
      slug: config.slug,
      url: config.url,
      check_interval_seconds: config.checkIntervalSeconds,
      regions: config.regions,
      alert_threshold: config.alertThreshold,
    };

    if (config.expectedStatusCode !== undefined) {
      body['expected_status_code'] = config.expectedStatusCode;
    }
    if (config.timeout !== undefined) {
      body['timeout'] = config.timeout;
    }
    if (config.tags) {
      body['tags'] = config.tags;
    }

    const nestedBlocks: Array<{ blockType: string; body: Record<string, unknown> }> = [];

    if (config.headers && Object.keys(config.headers).length > 0) {
      nestedBlocks.push({
        blockType: 'headers',
        body: config.headers,
      });
    }

    return renderBlock(
      'resource',
      ['openpulse_service_monitor', resourceName],
      body,
      nestedBlocks.length > 0 ? nestedBlocks : undefined,
    ) + '\n';
  }

  generateNotificationRule(config: NotificationRuleConfig): string {
    const resourceName = config.name.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase();

    const body: Record<string, unknown> = {
      name: config.name,
      service_monitor_id: config.serviceMonitorId,
      channel: config.channel,
      destination: config.destination,
      severity: config.severity,
      enabled: config.enabled ?? true,
    };

    if (config.cooldownMinutes !== undefined) {
      body['cooldown_minutes'] = config.cooldownMinutes;
    }

    const nestedBlocks = config.conditions.map((condition) => ({
      blockType: 'condition',
      body: {
        metric: condition.metric,
        operator: condition.operator,
        value: condition.value,
      } as Record<string, unknown>,
    }));

    return renderBlock(
      'resource',
      ['openpulse_notification_rule', resourceName],
      body,
      nestedBlocks,
    ) + '\n';
  }

  generateDashboard(config: DashboardConfig): string {
    const resourceName = config.name.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase();

    const body: Record<string, unknown> = {
      name: config.name,
      team_id: config.teamId,
      is_public: config.isPublic ?? false,
    };

    if (config.description) body['description'] = config.description;
    if (config.refreshIntervalSeconds !== undefined) {
      body['refresh_interval_seconds'] = config.refreshIntervalSeconds;
    }

    const nestedBlocks = config.widgets.map((widget) => ({
      blockType: 'widget',
      body: {
        type: widget.type,
        title: widget.title,
        service_monitor_ids: widget.serviceMonitorIds,
        row: widget.position.row,
        col: widget.position.col,
        width: widget.position.width,
        height: widget.position.height,
      } as Record<string, unknown>,
    }));

    return renderBlock(
      'resource',
      ['openpulse_team_dashboard', resourceName],
      body,
      nestedBlocks,
    ) + '\n';
  }

  generateDataSource(
    type: 'service_monitor' | 'team' | 'notification_channel',
    config: Record<string, unknown>,
  ): string {
    const dataType = `openpulse_${type}`;
    const dataName = (config['name'] as string ?? type).replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase();

    return renderBlock('data', [dataType, dataName], config) + '\n';
  }

  generateResource(resource: TerraformResource): string {
    const body = { ...resource.attributes };

    const nestedBlocks: Array<{ blockType: string; body: Record<string, unknown> }> = [];

    if (resource.dependsOn && resource.dependsOn.length > 0) {
      body['depends_on'] = resource.dependsOn;
    }

    if (resource.lifecycle) {
      nestedBlocks.push({
        blockType: 'lifecycle',
        body: {
          create_before_destroy: resource.lifecycle.createBeforeDestroy,
          prevent_destroy: resource.lifecycle.preventDestroy,
          ignore_changes: resource.lifecycle.ignoreChanges,
        },
      });
    }

    return renderBlock(
      'resource',
      [resource.resourceType, resource.resourceName],
      body,
      nestedBlocks.length > 0 ? nestedBlocks : undefined,
    ) + '\n';
  }

  generateDataSourceGeneric(dataSource: TerraformDataSource): string {
    return renderBlock('data', [dataSource.dataType, dataSource.dataName], dataSource.filters) + '\n';
  }
}
