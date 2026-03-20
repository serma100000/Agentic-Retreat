/**
 * Tests for the OpenPulse Terraform HCL provider.
 */

import { describe, it, expect } from 'vitest';
import { TerraformProvider } from '../terraform-provider.js';
import type {
  ProviderConfig,
  ServiceMonitorConfig,
  NotificationRuleConfig,
  DashboardConfig,
} from '../types.js';

describe('TerraformProvider', () => {
  const provider = new TerraformProvider();

  const defaultProviderConfig: ProviderConfig = {
    apiUrl: 'https://api.openpulse.io',
    apiKey: 'op_test_key_12345',
  };

  describe('generateProvider', () => {
    it('should produce valid HCL with required_providers and provider block', () => {
      const hcl = provider.generateProvider(defaultProviderConfig);
      expect(hcl).toContain('terraform {');
      expect(hcl).toContain('required_providers {');
      expect(hcl).toContain('source  = "openpulse/openpulse"');
      expect(hcl).toContain('version = "~> 1.0"');
      expect(hcl).toContain('provider "openpulse" {');
      expect(hcl).toContain('api_url = "https://api.openpulse.io"');
      expect(hcl).toContain('api_key = "op_test_key_12345"');
    });

    it('should include optional organization_id when provided', () => {
      const hcl = provider.generateProvider({
        ...defaultProviderConfig,
        organizationId: 'org-abc',
      });
      expect(hcl).toContain('organization_id = "org-abc"');
    });

    it('should include optional environment when provided', () => {
      const hcl = provider.generateProvider({
        ...defaultProviderConfig,
        environment: 'production',
      });
      expect(hcl).toContain('environment = "production"');
    });
  });

  describe('generateServiceMonitor', () => {
    const monitorConfig: ServiceMonitorConfig = {
      name: 'GitHub API',
      slug: 'github-api',
      url: 'https://api.github.com',
      checkIntervalSeconds: 30,
      regions: ['us-east-1', 'eu-west-1'],
      alertThreshold: 0.8,
    };

    it('should produce a valid openpulse_service_monitor resource', () => {
      const hcl = provider.generateServiceMonitor(monitorConfig);
      expect(hcl).toContain('resource "openpulse_service_monitor" "github_api"');
      expect(hcl).toContain('name = "GitHub API"');
      expect(hcl).toContain('slug = "github-api"');
      expect(hcl).toContain('url = "https://api.github.com"');
      expect(hcl).toContain('check_interval_seconds = 30');
      expect(hcl).toContain('regions = ["us-east-1", "eu-west-1"]');
      expect(hcl).toContain('alert_threshold = 0.8');
    });

    it('should include optional expected_status_code', () => {
      const hcl = provider.generateServiceMonitor({
        ...monitorConfig,
        expectedStatusCode: 200,
      });
      expect(hcl).toContain('expected_status_code = 200');
    });

    it('should include optional timeout', () => {
      const hcl = provider.generateServiceMonitor({
        ...monitorConfig,
        timeout: 5000,
      });
      expect(hcl).toContain('timeout = 5000');
    });

    it('should include tags as a map', () => {
      const hcl = provider.generateServiceMonitor({
        ...monitorConfig,
        tags: { env: 'production', team: 'platform' },
      });
      expect(hcl).toContain('tags = {');
      expect(hcl).toContain('env = "production"');
      expect(hcl).toContain('team = "platform"');
    });

    it('should include a headers block when headers are provided', () => {
      const hcl = provider.generateServiceMonitor({
        ...monitorConfig,
        headers: { 'X-Custom': 'value' },
      });
      expect(hcl).toContain('headers {');
      expect(hcl).toContain('X-Custom = "value"');
    });
  });

  describe('generateNotificationRule', () => {
    const ruleConfig: NotificationRuleConfig = {
      name: 'Slack Critical Alert',
      serviceMonitorId: 'openpulse_service_monitor.github_api.id',
      channel: 'slack',
      destination: '#ops-alerts',
      severity: 'critical',
      conditions: [
        { metric: 'confidence', operator: 'gte', value: 0.9 },
      ],
    };

    it('should produce a valid openpulse_notification_rule resource', () => {
      const hcl = provider.generateNotificationRule(ruleConfig);
      expect(hcl).toContain('resource "openpulse_notification_rule"');
      expect(hcl).toContain('name = "Slack Critical Alert"');
      expect(hcl).toContain('channel = "slack"');
      expect(hcl).toContain('destination = "#ops-alerts"');
      expect(hcl).toContain('severity = "critical"');
      expect(hcl).toContain('enabled = true');
    });

    it('should generate condition blocks', () => {
      const hcl = provider.generateNotificationRule(ruleConfig);
      expect(hcl).toContain('condition {');
      expect(hcl).toContain('metric = "confidence"');
      expect(hcl).toContain('operator = "gte"');
      expect(hcl).toContain('value = 0.9');
    });

    it('should handle multiple conditions', () => {
      const hcl = provider.generateNotificationRule({
        ...ruleConfig,
        conditions: [
          { metric: 'confidence', operator: 'gte', value: 0.9 },
          { metric: 'latency', operator: 'gt', value: 5000 },
        ],
      });
      const conditionCount = (hcl.match(/condition \{/g) ?? []).length;
      expect(conditionCount).toBe(2);
    });

    it('should include optional cooldown_minutes', () => {
      const hcl = provider.generateNotificationRule({
        ...ruleConfig,
        cooldownMinutes: 15,
      });
      expect(hcl).toContain('cooldown_minutes = 15');
    });
  });

  describe('generateDashboard', () => {
    const dashConfig: DashboardConfig = {
      name: 'Platform Overview',
      teamId: 'team-platform',
      description: 'Main platform monitoring dashboard',
      widgets: [
        {
          type: 'status_grid',
          title: 'Service Status',
          serviceMonitorIds: ['monitor-1', 'monitor-2'],
          position: { row: 0, col: 0, width: 12, height: 4 },
        },
      ],
    };

    it('should produce a valid openpulse_team_dashboard resource', () => {
      const hcl = provider.generateDashboard(dashConfig);
      expect(hcl).toContain('resource "openpulse_team_dashboard"');
      expect(hcl).toContain('name = "Platform Overview"');
      expect(hcl).toContain('team_id = "team-platform"');
      expect(hcl).toContain('description = "Main platform monitoring dashboard"');
    });

    it('should generate widget blocks', () => {
      const hcl = provider.generateDashboard(dashConfig);
      expect(hcl).toContain('widget {');
      expect(hcl).toContain('type = "status_grid"');
      expect(hcl).toContain('title = "Service Status"');
      expect(hcl).toContain('row = 0');
      expect(hcl).toContain('col = 0');
      expect(hcl).toContain('width = 12');
      expect(hcl).toContain('height = 4');
    });

    it('should set is_public to false by default', () => {
      const hcl = provider.generateDashboard(dashConfig);
      expect(hcl).toContain('is_public = false');
    });

    it('should include refresh_interval_seconds when provided', () => {
      const hcl = provider.generateDashboard({
        ...dashConfig,
        refreshIntervalSeconds: 30,
      });
      expect(hcl).toContain('refresh_interval_seconds = 30');
    });
  });

  describe('generateDataSource', () => {
    it('should produce a valid data block for service_monitor', () => {
      const hcl = provider.generateDataSource('service_monitor', {
        name: 'github',
        slug: 'github-api',
      });
      expect(hcl).toContain('data "openpulse_service_monitor" "github"');
      expect(hcl).toContain('slug = "github-api"');
    });

    it('should produce a valid data block for team', () => {
      const hcl = provider.generateDataSource('team', {
        name: 'platform',
      });
      expect(hcl).toContain('data "openpulse_team" "platform"');
      expect(hcl).toContain('name = "platform"');
    });

    it('should produce a valid data block for notification_channel', () => {
      const hcl = provider.generateDataSource('notification_channel', {
        name: 'slack_ops',
        channel: 'slack',
      });
      expect(hcl).toContain('data "openpulse_notification_channel" "slack_ops"');
      expect(hcl).toContain('channel = "slack"');
    });
  });

  describe('special characters', () => {
    it('should escape double quotes in string values', () => {
      const hcl = provider.generateServiceMonitor({
        name: 'Service "Alpha"',
        slug: 'service-alpha',
        url: 'https://alpha.example.com',
        checkIntervalSeconds: 60,
        regions: ['us-east-1'],
        alertThreshold: 0.7,
      });
      expect(hcl).toContain('name = "Service \\"Alpha\\""');
    });

    it('should escape backslashes in string values', () => {
      const hcl = provider.generateServiceMonitor({
        name: 'Path\\Test',
        slug: 'path-test',
        url: 'https://test.example.com',
        checkIntervalSeconds: 60,
        regions: ['us-east-1'],
        alertThreshold: 0.7,
      });
      expect(hcl).toContain('name = "Path\\\\Test"');
    });
  });
});
