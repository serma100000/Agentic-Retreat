import { describe, expect, it, beforeEach } from 'vitest';
import { OpenAPIGenerator } from '../openapi-generator.js';
import type { OpenAPISpec } from '../types.js';

describe('OpenAPIGenerator', () => {
  let generator: OpenAPIGenerator;
  let spec: OpenAPISpec;

  beforeEach(() => {
    generator = new OpenAPIGenerator();
    spec = generator.generate();
  });

  it('produces a valid OpenAPI 3.1 spec', () => {
    expect(spec.openapi).toBe('3.1.0');
    expect(spec.info).toBeDefined();
    expect(spec.info.title).toBe('OpenPulse API');
    expect(spec.info.version).toBe('1.0.0');
  });

  it('includes all required info fields', () => {
    expect(spec.info.description).toContain('outage detection');
    expect(spec.info.contact).toBeDefined();
    expect(spec.info.license).toBeDefined();
    expect(spec.info.license!.name).toBe('MIT');
  });

  it('includes server definitions', () => {
    expect(spec.servers.length).toBeGreaterThanOrEqual(2);
    expect(spec.servers.some(s => s.url.includes('localhost'))).toBe(true);
    expect(spec.servers.some(s => s.description === 'Production')).toBe(true);
  });

  it('includes service endpoints', () => {
    expect(spec.paths['/api/v1/services']).toBeDefined();
    expect(spec.paths['/api/v1/services/{slug}']).toBeDefined();
    expect(spec.paths['/api/v1/services/{slug}/status']).toBeDefined();
    expect(spec.paths['/api/v1/services']!['get']).toBeDefined();
  });

  it('includes report endpoints', () => {
    expect(spec.paths['/api/v1/reports']).toBeDefined();
    const postReports = spec.paths['/api/v1/reports']!['post'];
    expect(postReports).toBeDefined();
    expect(postReports!.operationId).toBe('submitReport');
    expect(postReports!.requestBody).toBeDefined();
  });

  it('includes outage endpoints', () => {
    expect(spec.paths['/api/v1/outages']).toBeDefined();
    expect(spec.paths['/api/v1/outages/{id}']).toBeDefined();
    expect(spec.paths['/api/v1/services/{slug}/outages']).toBeDefined();
  });

  it('includes analytics endpoints', () => {
    expect(spec.paths['/api/v1/analytics/services/{slug}/history']).toBeDefined();
    expect(spec.paths['/api/v1/analytics/services/{slug}/reliability']).toBeDefined();
    expect(spec.paths['/api/v1/analytics/services/{slug}/correlations']).toBeDefined();
    expect(spec.paths['/api/v1/analytics/categories/{category}/summary']).toBeDefined();
    expect(spec.paths['/api/v1/analytics/trends']).toBeDefined();
    expect(spec.paths['/api/v1/analytics/leaderboard']).toBeDefined();
  });

  it('includes open data endpoints', () => {
    expect(spec.paths['/api/v1/open-data/outages']).toBeDefined();
    expect(spec.paths['/api/v1/open-data/reliability']).toBeDefined();
    expect(spec.paths['/api/v1/open-data/trends']).toBeDefined();
    expect(spec.paths['/api/v1/open-data/export']).toBeDefined();
    expect(spec.paths['/api/v1/open-data/license']).toBeDefined();
  });

  it('includes enterprise endpoints', () => {
    expect(spec.paths['/api/v1/enterprise/orgs']).toBeDefined();
    expect(spec.paths['/api/v1/enterprise/orgs/{orgId}/sla']).toBeDefined();
    expect(spec.paths['/api/v1/enterprise/orgs/{orgId}/monitors']).toBeDefined();
    expect(spec.paths['/api/v1/enterprise/orgs/{orgId}/dashboards']).toBeDefined();
  });

  it('includes notification and auth endpoints', () => {
    expect(spec.paths['/api/v1/notifications/preferences']).toBeDefined();
    expect(spec.paths['/api/v1/auth/api-keys']).toBeDefined();
    expect(spec.paths['/api/v1/auth/oauth/{provider}']).toBeDefined();
  });

  it('defines all referenced schemas', () => {
    const schemas = spec.components.schemas;
    expect(schemas['Service']).toBeDefined();
    expect(schemas['Report']).toBeDefined();
    expect(schemas['Outage']).toBeDefined();
    expect(schemas['OutageHistory']).toBeDefined();
    expect(schemas['ServiceReliability']).toBeDefined();
    expect(schemas['TrendData']).toBeDefined();
    expect(schemas['CorrelationResult']).toBeDefined();
    expect(schemas['CategorySummary']).toBeDefined();
    expect(schemas['AnonymizedOutage']).toBeDefined();
    expect(schemas['ReliabilityStats']).toBeDefined();
    expect(schemas['Organization']).toBeDefined();
    expect(schemas['SLAReport']).toBeDefined();
    expect(schemas['CustomMonitor']).toBeDefined();
    expect(schemas['NotificationPreference']).toBeDefined();
    expect(schemas['ApiKeyRecord']).toBeDefined();
    expect(schemas['Error']).toBeDefined();
  });

  it('all schema $ref references resolve to defined schemas', () => {
    const schemaNames = new Set(Object.keys(spec.components.schemas));
    const refs: string[] = [];

    function collectRefs(obj: unknown): void {
      if (obj === null || obj === undefined || typeof obj !== 'object') return;
      if (Array.isArray(obj)) {
        for (const item of obj) collectRefs(item);
        return;
      }
      const record = obj as Record<string, unknown>;
      if (typeof record['$ref'] === 'string') {
        refs.push(record['$ref']);
      }
      for (const val of Object.values(record)) {
        collectRefs(val);
      }
    }

    collectRefs(spec.paths);
    collectRefs(spec.components);

    for (const ref of refs) {
      const name = ref.replace('#/components/schemas/', '');
      expect(schemaNames.has(name)).toBe(true);
    }
    expect(refs.length).toBeGreaterThan(0);
  });

  it('documents response codes for all endpoints', () => {
    for (const [path, methods] of Object.entries(spec.paths)) {
      for (const [method, operation] of Object.entries(methods!)) {
        expect(Object.keys(operation.responses).length).toBeGreaterThan(0);
      }
    }
  });

  it('includes tags on all operations', () => {
    for (const [, methods] of Object.entries(spec.paths)) {
      for (const [, operation] of Object.entries(methods!)) {
        expect(operation.tags).toBeDefined();
        expect(operation.tags.length).toBeGreaterThan(0);
      }
    }
  });

  it('defines security schemes', () => {
    expect(spec.components.securitySchemes).toBeDefined();
    expect(spec.components.securitySchemes!['bearerAuth']).toBeDefined();
    expect(spec.components.securitySchemes!['apiKeyAuth']).toBeDefined();
  });

  it('produces valid JSON output', () => {
    const json = generator.toJSON();
    expect(() => JSON.parse(json)).not.toThrow();
    const parsed = JSON.parse(json);
    expect(parsed.openapi).toBe('3.1.0');
  });

  it('produces YAML output', () => {
    const yaml = generator.toYAML();
    expect(yaml).toContain('openapi: 3.1.0');
    expect(yaml).toContain('OpenPulse API');
    expect(yaml.length).toBeGreaterThan(100);
  });

  it('allows adding custom paths', () => {
    generator.addPath('get', '/custom/endpoint', {
      summary: 'Custom endpoint',
      description: 'A test endpoint',
      operationId: 'customEndpoint',
      tags: ['Custom'],
      responses: {
        '200': { description: 'OK' },
      },
    });
    const customSpec = generator.generate();
    expect(customSpec.paths['/custom/endpoint']).toBeDefined();
  });

  it('allows adding custom schemas', () => {
    generator.addSchema('CustomType', {
      type: 'object',
      properties: {
        value: { type: 'string' },
      },
    });
    const json = generator.toJSON();
    const parsed = JSON.parse(json);
    expect(parsed.components.schemas['CustomType']).toBeDefined();
  });

  it('includes all expected tags', () => {
    expect(spec.tags).toBeDefined();
    const tagNames = spec.tags!.map(t => t.name);
    expect(tagNames).toContain('Services');
    expect(tagNames).toContain('Reports');
    expect(tagNames).toContain('Outages');
    expect(tagNames).toContain('Analytics');
    expect(tagNames).toContain('OpenData');
    expect(tagNames).toContain('Enterprise');
    expect(tagNames).toContain('Notifications');
    expect(tagNames).toContain('Auth');
  });
});
