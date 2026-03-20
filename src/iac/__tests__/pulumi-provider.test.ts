/**
 * Tests for the OpenPulse Pulumi provider SDK generator.
 */

import { describe, it, expect } from 'vitest';
import { PulumiProvider } from '../pulumi-provider.js';
import type { ServiceMonitorConfig } from '../types.js';

describe('PulumiProvider', () => {
  const provider = new PulumiProvider();

  describe('generateTypeScriptSDK', () => {
    it('should produce valid TypeScript with imports and classes', () => {
      const code = provider.generateTypeScriptSDK();
      expect(code).toContain("import * as pulumi from '@pulumi/pulumi'");
      expect(code).toContain('export class OpenPulseProvider extends pulumi.ProviderResource');
      expect(code).toContain('export class ServiceMonitor extends pulumi.CustomResource');
      expect(code).toContain('export class NotificationRule extends pulumi.CustomResource');
      expect(code).toContain('export class TeamDashboard extends pulumi.CustomResource');
    });

    it('should include typed interfaces for all resources', () => {
      const code = provider.generateTypeScriptSDK();
      expect(code).toContain('export interface OpenPulseProviderArgs');
      expect(code).toContain('export interface ServiceMonitorArgs');
      expect(code).toContain('export interface NotificationRuleArgs');
      expect(code).toContain('export interface TeamDashboardArgs');
      expect(code).toContain('export interface NotificationConditionArgs');
      expect(code).toContain('export interface DashboardWidgetArgs');
    });

    it('should use correct Pulumi resource type URNs', () => {
      const code = provider.generateTypeScriptSDK();
      expect(code).toContain("'openpulse:index:ServiceMonitor'");
      expect(code).toContain("'openpulse:index:NotificationRule'");
      expect(code).toContain("'openpulse:index:TeamDashboard'");
    });

    it('should use custom API URL when provided', () => {
      const code = provider.generateTypeScriptSDK({
        apiUrl: 'https://custom.api.io',
        apiKey: 'key',
      });
      expect(code).toContain("'https://custom.api.io'");
    });

    it('should default to the standard OpenPulse API URL', () => {
      const code = provider.generateTypeScriptSDK();
      expect(code).toContain("'https://api.openpulse.io'");
    });
  });

  describe('generatePythonSDK', () => {
    it('should produce valid Python with classes and type annotations', () => {
      const code = provider.generatePythonSDK();
      expect(code).toContain('import pulumi');
      expect(code).toContain('class OpenPulseProvider(pulumi.ProviderResource)');
      expect(code).toContain('class ServiceMonitor(pulumi.CustomResource)');
      expect(code).toContain('class NotificationRule(pulumi.CustomResource)');
      expect(code).toContain('class TeamDashboard(pulumi.CustomResource)');
    });

    it('should use correct Pulumi resource type URNs in Python', () => {
      const code = provider.generatePythonSDK();
      expect(code).toContain("'openpulse:index:ServiceMonitor'");
      expect(code).toContain("'openpulse:index:NotificationRule'");
      expect(code).toContain("'openpulse:index:TeamDashboard'");
    });

    it('should include type annotations for all resource outputs', () => {
      const code = provider.generatePythonSDK();
      expect(code).toContain('api_url: pulumi.Output[str]');
      expect(code).toContain('status: pulumi.Output[str]');
      expect(code).toContain('enabled: pulumi.Output[bool]');
      expect(code).toContain('dashboard_url: pulumi.Output[str]');
    });

    it('should use custom API URL in Python SDK when provided', () => {
      const code = provider.generatePythonSDK({
        apiUrl: 'https://staging.openpulse.io',
        apiKey: 'key',
      });
      expect(code).toContain("'https://staging.openpulse.io'");
    });
  });

  describe('generateServiceMonitor', () => {
    const config: ServiceMonitorConfig = {
      name: 'Stripe API',
      slug: 'stripe-api',
      url: 'https://api.stripe.com/v1',
      checkIntervalSeconds: 60,
      regions: ['us-east-1', 'eu-central-1'],
      alertThreshold: 0.85,
      tags: { tier: 'critical' },
      expectedStatusCode: 200,
    };

    it('should produce a PulumiResource with correct type and name', () => {
      const resource = provider.generateServiceMonitor(config);
      expect(resource.resourceType).toBe('openpulse:index:ServiceMonitor');
      expect(resource.resourceName).toBe('stripe-api');
    });

    it('should map all config fields into inputs', () => {
      const resource = provider.generateServiceMonitor(config);
      expect(resource.inputs['name']).toBe('Stripe API');
      expect(resource.inputs['slug']).toBe('stripe-api');
      expect(resource.inputs['url']).toBe('https://api.stripe.com/v1');
      expect(resource.inputs['checkIntervalSeconds']).toBe(60);
      expect(resource.inputs['regions']).toEqual(['us-east-1', 'eu-central-1']);
      expect(resource.inputs['alertThreshold']).toBe(0.85);
      expect(resource.inputs['tags']).toEqual({ tier: 'critical' });
      expect(resource.inputs['expectedStatusCode']).toBe(200);
    });
  });
});
