/**
 * OpenAPI 3.1 specification generator for the OpenPulse API.
 *
 * Produces a complete specification covering services, reports,
 * outages, analytics, open data, and enterprise endpoints.
 */

import type {
  OpenAPIOperation,
  OpenAPIParameter,
  OpenAPIResponse,
  OpenAPISchema,
  OpenAPISpec,
} from './types.js';

interface PathConfig {
  summary: string;
  description: string;
  operationId: string;
  tags: string[];
  parameters?: OpenAPIParameter[];
  requestBody?: { required: boolean; content: Record<string, { schema: OpenAPISchema }> };
  responses: Record<string, OpenAPIResponse>;
  security?: Array<Record<string, string[]>>;
}

export class OpenAPIGenerator {
  private readonly spec: OpenAPISpec;

  constructor() {
    this.spec = {
      openapi: '3.1.0',
      info: {
        title: 'OpenPulse API',
        description:
          'Real-time service outage detection, reporting, and analytics platform. ' +
          'Provides endpoints for monitoring service status, submitting outage reports, ' +
          'querying analytics, and managing notifications.',
        version: '1.0.0',
        contact: { name: 'OpenPulse Team', url: 'https://openpulse.dev' },
        license: { name: 'MIT', url: 'https://opensource.org/licenses/MIT' },
      },
      servers: [
        { url: 'https://api.openpulse.dev', description: 'Production' },
        { url: 'https://staging-api.openpulse.dev', description: 'Staging' },
        { url: 'http://localhost:3000', description: 'Local development' },
      ],
      paths: {},
      components: {
        schemas: {},
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
          apiKeyAuth: {
            type: 'apiKey',
            name: 'X-API-Key',
            in: 'header',
          },
        },
      },
      tags: [
        { name: 'Services', description: 'Service management and status' },
        { name: 'Reports', description: 'User-submitted outage reports' },
        { name: 'Outages', description: 'Detected outage events' },
        { name: 'Analytics', description: 'Historical analytics and trends' },
        { name: 'OpenData', description: 'Anonymized open data API (CC-BY-4.0)' },
        { name: 'Enterprise', description: 'Enterprise features (orgs, SLA, monitors)' },
        { name: 'Notifications', description: 'Notification preferences and delivery' },
        { name: 'Auth', description: 'Authentication and API keys' },
        { name: 'WebSocket', description: 'Real-time WebSocket subscriptions' },
      ],
    };
  }

  /**
   * Generate the complete OpenAPI spec with all OpenPulse endpoints.
   */
  generate(): OpenAPISpec {
    this.addAllSchemas();
    this.addServicePaths();
    this.addReportPaths();
    this.addOutagePaths();
    this.addAnalyticsPaths();
    this.addOpenDataPaths();
    this.addEnterprisePaths();
    this.addNotificationPaths();
    this.addAuthPaths();
    return structuredClone(this.spec);
  }

  /**
   * Add a path to the spec manually.
   */
  addPath(method: string, path: string, config: PathConfig): void {
    if (!this.spec.paths[path]) {
      this.spec.paths[path] = {};
    }
    this.spec.paths[path]![method.toLowerCase()] = config as OpenAPIOperation;
  }

  /**
   * Add a schema component.
   */
  addSchema(name: string, schema: OpenAPISchema): void {
    this.spec.components.schemas[name] = schema;
  }

  /**
   * Return the spec as a formatted JSON string.
   */
  toJSON(): string {
    return JSON.stringify(this.spec, null, 2);
  }

  /**
   * Return the spec as a YAML string.
   */
  toYAML(): string {
    return jsonToYaml(this.spec);
  }

  // ── Schema Definitions ──────────────────────────────────────────

  private addAllSchemas(): void {
    this.addSchema('Service', {
      type: 'object',
      properties: {
        id: { type: 'string', format: 'uuid' },
        name: { type: 'string', example: 'GitHub' },
        slug: { type: 'string', example: 'github' },
        url: { type: 'string', format: 'uri' },
        category: { type: 'string', example: 'devtools' },
        status: {
          type: 'string',
          enum: ['operational', 'degraded', 'partial_outage', 'major_outage'],
        },
        createdAt: { type: 'string', format: 'date-time' },
      },
      required: ['id', 'name', 'slug', 'url', 'category', 'status'],
    });

    this.addSchema('Report', {
      type: 'object',
      properties: {
        id: { type: 'string', format: 'uuid' },
        serviceId: { type: 'string', format: 'uuid' },
        serviceSlug: { type: 'string' },
        type: { type: 'string', enum: ['down', 'slow', 'partial', 'dns', 'other'] },
        description: { type: 'string' },
        region: { type: 'string' },
        createdAt: { type: 'string', format: 'date-time' },
      },
      required: ['id', 'serviceId', 'type'],
    });

    this.addSchema('Outage', {
      type: 'object',
      properties: {
        id: { type: 'string', format: 'uuid' },
        serviceId: { type: 'string', format: 'uuid' },
        serviceSlug: { type: 'string' },
        serviceName: { type: 'string' },
        state: {
          type: 'string',
          enum: [
            'OPERATIONAL',
            'INVESTIGATING',
            'DEGRADED',
            'MAJOR_OUTAGE',
            'RECOVERING',
            'RESOLVED',
          ],
        },
        confidence: { type: 'number', description: 'Detection confidence 0-1' },
        startedAt: { type: 'string', format: 'date-time' },
        resolvedAt: { type: 'string', format: 'date-time', nullable: true },
        durationMs: { type: 'integer' },
        affectedRegions: { type: 'array', items: { type: 'string' } },
        detectionSignals: { type: 'array', items: { type: 'string' } },
      },
      required: ['id', 'serviceId', 'state', 'confidence', 'startedAt'],
    });

    this.addSchema('OutageHistory', {
      type: 'object',
      properties: {
        outageId: { type: 'string' },
        serviceId: { type: 'string' },
        serviceSlug: { type: 'string' },
        serviceName: { type: 'string' },
        category: { type: 'string' },
        state: { type: 'string' },
        confidence: { type: 'number' },
        startedAt: { type: 'string', format: 'date-time' },
        resolvedAt: { type: 'string', format: 'date-time', nullable: true },
        durationMs: { type: 'integer' },
        peakReportsPerMin: { type: 'integer' },
        affectedRegions: { type: 'array', items: { type: 'string' } },
        mttr: { type: 'number' },
        mttd: { type: 'number' },
      },
    });

    this.addSchema('ServiceReliability', {
      type: 'object',
      properties: {
        serviceSlug: { type: 'string' },
        serviceName: { type: 'string' },
        uptimePercent: { type: 'number' },
        totalOutages: { type: 'integer' },
        avgDuration: { type: 'number' },
        mttr: { type: 'number' },
        mttd: { type: 'number' },
        rank: { type: 'integer' },
      },
    });

    this.addSchema('TrendData', {
      type: 'object',
      properties: {
        period: { type: 'string' },
        totalOutages: { type: 'integer' },
        avgDuration: { type: 'number' },
        serviceCount: { type: 'integer' },
        byCategory: { type: 'object' },
        bySeverity: { type: 'object' },
      },
    });

    this.addSchema('CorrelationResult', {
      type: 'object',
      properties: {
        serviceA: { type: 'string' },
        serviceB: { type: 'string' },
        correlationScore: { type: 'number' },
        coOccurrences: { type: 'integer' },
        timeWindowMs: { type: 'integer' },
      },
    });

    this.addSchema('CategorySummary', {
      type: 'object',
      properties: {
        category: { type: 'string' },
        totalOutages: { type: 'integer' },
        avgDurationMs: { type: 'number' },
        avgMttd: { type: 'number' },
        avgMttr: { type: 'number' },
        topAffectedServices: { type: 'array', items: { type: 'object' } },
        outagesByMonth: { type: 'array', items: { type: 'object' } },
      },
    });

    this.addSchema('AnonymizedOutage', {
      type: 'object',
      properties: {
        id: { type: 'string' },
        serviceSlug: { type: 'string' },
        serviceName: { type: 'string' },
        category: { type: 'string' },
        state: { type: 'string' },
        confidence: { type: 'number' },
        windowStart: { type: 'string', format: 'date-time' },
        windowEnd: { type: 'string', format: 'date-time', nullable: true },
        durationMs: { type: 'integer' },
        city: { type: 'string' },
        region: { type: 'string' },
        country: { type: 'string' },
        reportCount: { type: 'integer' },
        detectionSignals: { type: 'array', items: { type: 'string' } },
      },
    });

    this.addSchema('ReliabilityStats', {
      type: 'object',
      properties: {
        serviceSlug: { type: 'string' },
        serviceName: { type: 'string' },
        uptimePercent: { type: 'number' },
        totalOutages: { type: 'integer' },
        mttrMs: { type: 'number' },
        outagesPerMonth: { type: 'number' },
        periodStart: { type: 'string', format: 'date-time' },
        periodEnd: { type: 'string', format: 'date-time' },
      },
    });

    this.addSchema('Organization', {
      type: 'object',
      properties: {
        id: { type: 'string', format: 'uuid' },
        name: { type: 'string' },
        slug: { type: 'string' },
        plan: { type: 'string', enum: ['free', 'team', 'enterprise'] },
        maxMembers: { type: 'integer' },
        maxMonitors: { type: 'integer' },
        createdAt: { type: 'string', format: 'date-time' },
      },
    });

    this.addSchema('SLAReport', {
      type: 'object',
      properties: {
        slaId: { type: 'string' },
        period: {
          type: 'object',
          properties: {
            start: { type: 'string', format: 'date-time' },
            end: { type: 'string', format: 'date-time' },
          },
        },
        actualUptime: { type: 'number' },
        targetUptime: { type: 'number' },
        met: { type: 'boolean' },
        violations: { type: 'array', items: { type: 'object' } },
        generatedAt: { type: 'string', format: 'date-time' },
      },
    });

    this.addSchema('CustomMonitor', {
      type: 'object',
      properties: {
        id: { type: 'string', format: 'uuid' },
        orgId: { type: 'string', format: 'uuid' },
        name: { type: 'string' },
        url: { type: 'string', format: 'uri' },
        probeTypes: { type: 'array', items: { type: 'string', enum: ['http', 'tcp', 'ping', 'dns', 'tls'] } },
        interval: { type: 'integer', description: 'Probe interval in seconds (minimum 30)' },
        regions: { type: 'array', items: { type: 'string' } },
        alertPolicy: {
          type: 'object',
          properties: {
            channels: { type: 'array', items: { type: 'string' } },
            threshold: { type: 'integer' },
            cooldownMinutes: { type: 'integer' },
          },
        },
        createdAt: { type: 'string', format: 'date-time' },
      },
    });

    this.addSchema('NotificationPreference', {
      type: 'object',
      properties: {
        userId: { type: 'string' },
        channel: {
          type: 'string',
          enum: ['email', 'webhook', 'slack', 'discord', 'teams', 'pagerduty', 'sms', 'push'],
        },
        config: { type: 'object' },
        enabled: { type: 'boolean' },
        serviceFilters: { type: 'array', items: { type: 'string' } },
        minSeverity: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
      },
    });

    this.addSchema('ApiKeyRecord', {
      type: 'object',
      properties: {
        id: { type: 'string', format: 'uuid' },
        name: { type: 'string' },
        prefix: { type: 'string' },
        scopes: { type: 'array', items: { type: 'string' } },
        tier: { type: 'string', enum: ['free', 'pro', 'enterprise'] },
        createdAt: { type: 'string', format: 'date-time' },
        lastUsedAt: { type: 'string', format: 'date-time', nullable: true },
        expiresAt: { type: 'string', format: 'date-time', nullable: true },
        revoked: { type: 'boolean' },
      },
    });

    this.addSchema('Error', {
      type: 'object',
      properties: {
        error: { type: 'string' },
        message: { type: 'string' },
        statusCode: { type: 'integer' },
      },
      required: ['error', 'message'],
    });

    this.addSchema('PaginatedResponse', {
      type: 'object',
      properties: {
        data: { type: 'array', items: { type: 'object' } },
        total: { type: 'integer' },
        limit: { type: 'integer' },
        offset: { type: 'integer' },
      },
    });

    this.addSchema('DataLicense', {
      type: 'object',
      properties: {
        identifier: { type: 'string', example: 'CC-BY-4.0' },
        name: { type: 'string' },
        url: { type: 'string', format: 'uri' },
        attribution: { type: 'string' },
      },
    });

    this.addSchema('TeamDashboard', {
      type: 'object',
      properties: {
        id: { type: 'string', format: 'uuid' },
        orgId: { type: 'string', format: 'uuid' },
        name: { type: 'string' },
        services: { type: 'array', items: { type: 'string' } },
        layout: { type: 'string', enum: ['grid', 'list', 'freeform'] },
        widgets: { type: 'array', items: { type: 'object' } },
        createdAt: { type: 'string', format: 'date-time' },
      },
    });
  }

  // ── Service Endpoints ───────────────────────────────────────────

  private addServicePaths(): void {
    this.addPath('get', '/api/v1/services', {
      summary: 'List all services',
      description: 'Returns a paginated list of all monitored services with their current status.',
      operationId: 'listServices',
      tags: ['Services'],
      parameters: [
        queryParam('category', 'Filter by service category'),
        queryParam('status', 'Filter by current status'),
        queryParam('limit', 'Max results to return', 'integer'),
        queryParam('offset', 'Number of results to skip', 'integer'),
      ],
      responses: {
        '200': jsonResponse('List of services', {
          $ref: '#/components/schemas/PaginatedResponse',
        }),
        '500': errorResponse('Server error'),
      },
    });

    this.addPath('get', '/api/v1/services/{slug}', {
      summary: 'Get service by slug',
      description: 'Returns detailed information about a single service.',
      operationId: 'getService',
      tags: ['Services'],
      parameters: [pathParam('slug', 'The service slug (e.g. "github")')],
      responses: {
        '200': jsonResponse('Service details', { $ref: '#/components/schemas/Service' }),
        '404': errorResponse('Service not found'),
      },
    });

    this.addPath('get', '/api/v1/services/{slug}/status', {
      summary: 'Get service current status',
      description: 'Returns the current operational status and confidence score for a service.',
      operationId: 'getServiceStatus',
      tags: ['Services'],
      parameters: [pathParam('slug', 'The service slug')],
      responses: {
        '200': jsonResponse('Current service status', {
          type: 'object',
          properties: {
            slug: { type: 'string' },
            status: { type: 'string' },
            confidence: { type: 'number' },
          },
        }),
        '404': errorResponse('Service not found'),
      },
    });
  }

  // ── Report Endpoints ────────────────────────────────────────────

  private addReportPaths(): void {
    this.addPath('post', '/api/v1/reports', {
      summary: 'Submit an outage report',
      description: 'Submit a user report of a service disruption. Reports feed into the anomaly detection pipeline.',
      operationId: 'submitReport',
      tags: ['Reports'],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                serviceSlug: { type: 'string', description: 'Service slug to report against' },
                type: { type: 'string', enum: ['down', 'slow', 'partial', 'dns', 'other'] },
                description: { type: 'string', description: 'Optional description of the issue' },
                region: { type: 'string', description: 'Geographic region of the reporter' },
              },
              required: ['serviceSlug', 'type'],
            },
          },
        },
      },
      responses: {
        '201': jsonResponse('Report created', { $ref: '#/components/schemas/Report' }),
        '400': errorResponse('Invalid report data'),
        '404': errorResponse('Service not found'),
        '429': errorResponse('Rate limit exceeded'),
      },
    });

    this.addPath('get', '/api/v1/reports', {
      summary: 'List recent reports',
      description: 'Returns recent outage reports across all services, optionally filtered.',
      operationId: 'listReports',
      tags: ['Reports'],
      parameters: [
        queryParam('serviceSlug', 'Filter by service slug'),
        queryParam('type', 'Filter by report type'),
        queryParam('region', 'Filter by region'),
        queryParam('limit', 'Max results', 'integer'),
        queryParam('offset', 'Skip results', 'integer'),
      ],
      responses: {
        '200': jsonResponse('List of reports', { $ref: '#/components/schemas/PaginatedResponse' }),
      },
    });

    this.addPath('get', '/api/v1/services/{slug}/reports', {
      summary: 'Get reports for a service',
      description: 'Returns recent reports for a specific service.',
      operationId: 'getServiceReports',
      tags: ['Reports'],
      parameters: [
        pathParam('slug', 'The service slug'),
        queryParam('limit', 'Max results', 'integer'),
        queryParam('offset', 'Skip results', 'integer'),
      ],
      responses: {
        '200': jsonResponse('Service reports', { $ref: '#/components/schemas/PaginatedResponse' }),
        '404': errorResponse('Service not found'),
      },
    });
  }

  // ── Outage Endpoints ────────────────────────────────────────────

  private addOutagePaths(): void {
    this.addPath('get', '/api/v1/outages', {
      summary: 'List active outages',
      description: 'Returns all currently active outages across all monitored services.',
      operationId: 'listActiveOutages',
      tags: ['Outages'],
      parameters: [
        queryParam('state', 'Filter by outage state'),
        queryParam('category', 'Filter by service category'),
        queryParam('limit', 'Max results', 'integer'),
      ],
      responses: {
        '200': jsonResponse('Active outages', {
          type: 'object',
          properties: {
            data: { type: 'array', items: { $ref: '#/components/schemas/Outage' } },
            total: { type: 'integer' },
          },
        }),
      },
    });

    this.addPath('get', '/api/v1/outages/{id}', {
      summary: 'Get outage details',
      description: 'Returns detailed information about a specific outage event.',
      operationId: 'getOutage',
      tags: ['Outages'],
      parameters: [pathParam('id', 'The outage ID')],
      responses: {
        '200': jsonResponse('Outage details', { $ref: '#/components/schemas/Outage' }),
        '404': errorResponse('Outage not found'),
      },
    });

    this.addPath('get', '/api/v1/services/{slug}/outages', {
      summary: 'Get outages for a service',
      description: 'Returns outage history for a specific service.',
      operationId: 'getServiceOutages',
      tags: ['Outages'],
      parameters: [
        pathParam('slug', 'The service slug'),
        queryParam('state', 'Filter by outage state'),
        queryParam('startDate', 'Start date (ISO 8601)'),
        queryParam('endDate', 'End date (ISO 8601)'),
        queryParam('limit', 'Max results', 'integer'),
      ],
      responses: {
        '200': jsonResponse('Service outages', { $ref: '#/components/schemas/PaginatedResponse' }),
        '404': errorResponse('Service not found'),
      },
    });
  }

  // ── Analytics Endpoints ─────────────────────────────────────────

  private addAnalyticsPaths(): void {
    this.addPath('get', '/api/v1/analytics/services/{slug}/history', {
      summary: 'Get outage history for a service',
      description: 'Returns paginated outage history with optional date and category filters.',
      operationId: 'getServiceOutageHistory',
      tags: ['Analytics'],
      parameters: [
        pathParam('slug', 'The service slug'),
        queryParam('category', 'Filter by category'),
        queryParam('startDate', 'Start date (ISO 8601)'),
        queryParam('endDate', 'End date (ISO 8601)'),
        queryParam('limit', 'Max results', 'integer'),
        queryParam('offset', 'Skip results', 'integer'),
      ],
      responses: {
        '200': jsonResponse('Outage history', {
          type: 'object',
          properties: {
            data: { type: 'array', items: { $ref: '#/components/schemas/OutageHistory' } },
            total: { type: 'integer' },
          },
        }),
        '500': errorResponse('Server error'),
      },
    });

    this.addPath('get', '/api/v1/analytics/services/{slug}/reliability', {
      summary: 'Get service reliability metrics',
      description: 'Returns uptime percentage, MTTR, and MTTD for a service.',
      operationId: 'getServiceReliability',
      tags: ['Analytics'],
      parameters: [
        pathParam('slug', 'The service slug'),
        queryParam('category', 'Filter by category'),
      ],
      responses: {
        '200': jsonResponse('Reliability metrics', {
          type: 'object',
          properties: {
            reliability: { $ref: '#/components/schemas/ServiceReliability' },
            mttr: { type: 'object' },
            mttd: { type: 'object' },
          },
        }),
        '500': errorResponse('Server error'),
      },
    });

    this.addPath('get', '/api/v1/analytics/services/{slug}/correlations', {
      summary: 'Find correlated service outages',
      description: 'Identifies services that tend to experience outages simultaneously.',
      operationId: 'getServiceCorrelations',
      tags: ['Analytics'],
      parameters: [
        pathParam('slug', 'The service slug'),
        queryParam('timeWindowMs', 'Correlation time window in milliseconds', 'integer'),
      ],
      responses: {
        '200': jsonResponse('Correlation results', {
          type: 'object',
          properties: {
            data: { type: 'array', items: { $ref: '#/components/schemas/CorrelationResult' } },
          },
        }),
        '500': errorResponse('Server error'),
      },
    });

    this.addPath('get', '/api/v1/analytics/categories/{category}/summary', {
      summary: 'Get category summary statistics',
      description: 'Returns aggregate outage statistics for a service category.',
      operationId: 'getCategorySummary',
      tags: ['Analytics'],
      parameters: [
        pathParam('category', 'The category name'),
        queryParam('startDate', 'Start date (ISO 8601)'),
        queryParam('endDate', 'End date (ISO 8601)'),
      ],
      responses: {
        '200': jsonResponse('Category summary', {
          type: 'object',
          properties: {
            summary: { $ref: '#/components/schemas/CategorySummary' },
          },
        }),
        '500': errorResponse('Server error'),
      },
    });

    this.addPath('get', '/api/v1/analytics/trends', {
      summary: 'Get platform-wide outage trends',
      description: 'Returns outage trend data aggregated by period (weekly/monthly/quarterly).',
      operationId: 'getTrends',
      tags: ['Analytics'],
      parameters: [
        queryParam('period', 'Aggregation period (weekly, monthly, quarterly)'),
        queryParam('months', 'Number of months to include', 'integer'),
      ],
      responses: {
        '200': jsonResponse('Trend data', {
          type: 'object',
          properties: {
            data: { type: 'array', items: { $ref: '#/components/schemas/TrendData' } },
          },
        }),
        '500': errorResponse('Server error'),
      },
    });

    this.addPath('get', '/api/v1/analytics/leaderboard', {
      summary: 'Get service reliability leaderboard',
      description: 'Returns services ranked by reliability score.',
      operationId: 'getLeaderboard',
      tags: ['Analytics'],
      parameters: [
        queryParam('category', 'Filter by category'),
        queryParam('limit', 'Max results', 'integer'),
      ],
      responses: {
        '200': jsonResponse('Leaderboard', {
          type: 'object',
          properties: {
            data: { type: 'array', items: { $ref: '#/components/schemas/ServiceReliability' } },
          },
        }),
        '500': errorResponse('Server error'),
      },
    });
  }

  // ── Open Data Endpoints ─────────────────────────────────────────

  private addOpenDataPaths(): void {
    this.addPath('get', '/api/v1/open-data/outages', {
      summary: 'List anonymized outages',
      description: 'Returns anonymized, aggregated outage data. Licensed under CC-BY-4.0.',
      operationId: 'listAnonymizedOutages',
      tags: ['OpenData'],
      parameters: [
        queryParam('serviceSlug', 'Filter by service slug'),
        queryParam('category', 'Filter by category'),
        queryParam('city', 'Filter by city'),
        queryParam('region', 'Filter by region'),
        queryParam('startDate', 'Start date (ISO 8601)'),
        queryParam('endDate', 'End date (ISO 8601)'),
        queryParam('limit', 'Max results', 'integer'),
        queryParam('offset', 'Skip results', 'integer'),
      ],
      responses: {
        '200': jsonResponse('Anonymized outage data', {
          type: 'object',
          properties: {
            data: { type: 'array', items: { $ref: '#/components/schemas/AnonymizedOutage' } },
            total: { type: 'integer' },
            license: { $ref: '#/components/schemas/DataLicense' },
          },
        }),
      },
    });

    this.addPath('get', '/api/v1/open-data/reliability', {
      summary: 'Get reliability statistics',
      description: 'Returns reliability statistics for all services or filtered by slug.',
      operationId: 'getOpenReliabilityStats',
      tags: ['OpenData'],
      parameters: [
        queryParam('serviceSlug', 'Filter by service slug'),
        queryParam('limit', 'Max results', 'integer'),
      ],
      responses: {
        '200': jsonResponse('Reliability statistics', {
          type: 'object',
          properties: {
            data: { type: 'array', items: { $ref: '#/components/schemas/ReliabilityStats' } },
            license: { $ref: '#/components/schemas/DataLicense' },
          },
        }),
      },
    });

    this.addPath('get', '/api/v1/open-data/trends', {
      summary: 'Get platform trends (open data)',
      description: 'Returns anonymized trend data for public analysis.',
      operationId: 'getOpenTrends',
      tags: ['OpenData'],
      parameters: [
        queryParam('period', 'Aggregation period'),
        queryParam('months', 'Number of months', 'integer'),
      ],
      responses: {
        '200': jsonResponse('Trend data', {
          type: 'object',
          properties: {
            data: { type: 'array', items: { type: 'object' } },
            license: { $ref: '#/components/schemas/DataLicense' },
          },
        }),
      },
    });

    this.addPath('get', '/api/v1/open-data/export', {
      summary: 'Bulk data export',
      description: 'Exports anonymized outage data in JSON, CSV, or Parquet format.',
      operationId: 'exportOpenData',
      tags: ['OpenData'],
      parameters: [
        queryParam('format', 'Export format (json, csv, parquet)'),
        queryParam('serviceSlug', 'Filter by service slug'),
        queryParam('startDate', 'Start date (ISO 8601)'),
        queryParam('endDate', 'End date (ISO 8601)'),
        queryParam('compress', 'Enable gzip compression', 'boolean'),
      ],
      responses: {
        '200': {
          description: 'Exported data file',
          content: {
            'application/json': { schema: { type: 'object' } },
            'text/csv': { schema: { type: 'string' } },
            'application/octet-stream': { schema: { type: 'string', format: 'binary' } },
          },
        },
      },
    });

    this.addPath('get', '/api/v1/open-data/license', {
      summary: 'Get data license information',
      description: 'Returns the license terms for OpenPulse open data.',
      operationId: 'getDataLicense',
      tags: ['OpenData'],
      responses: {
        '200': jsonResponse('License information', { $ref: '#/components/schemas/DataLicense' }),
      },
    });
  }

  // ── Enterprise Endpoints ────────────────────────────────────────

  private addEnterprisePaths(): void {
    this.addPath('get', '/api/v1/enterprise/orgs', {
      summary: 'List organizations',
      description: 'Returns organizations the authenticated user belongs to.',
      operationId: 'listOrganizations',
      tags: ['Enterprise'],
      security: [{ bearerAuth: [] }],
      responses: {
        '200': jsonResponse('Organizations', {
          type: 'object',
          properties: {
            data: { type: 'array', items: { $ref: '#/components/schemas/Organization' } },
          },
        }),
        '401': errorResponse('Unauthorized'),
      },
    });

    this.addPath('post', '/api/v1/enterprise/orgs', {
      summary: 'Create an organization',
      description: 'Creates a new organization with the authenticated user as owner.',
      operationId: 'createOrganization',
      tags: ['Enterprise'],
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                slug: { type: 'string' },
                plan: { type: 'string', enum: ['free', 'team', 'enterprise'] },
              },
              required: ['name', 'slug'],
            },
          },
        },
      },
      responses: {
        '201': jsonResponse('Organization created', { $ref: '#/components/schemas/Organization' }),
        '400': errorResponse('Invalid input'),
        '401': errorResponse('Unauthorized'),
      },
    });

    this.addPath('get', '/api/v1/enterprise/orgs/{orgId}/sla', {
      summary: 'Get SLA reports',
      description: 'Returns SLA compliance reports for an organization.',
      operationId: 'getOrgSLAReports',
      tags: ['Enterprise'],
      security: [{ bearerAuth: [] }],
      parameters: [pathParam('orgId', 'Organization ID')],
      responses: {
        '200': jsonResponse('SLA reports', {
          type: 'object',
          properties: {
            data: { type: 'array', items: { $ref: '#/components/schemas/SLAReport' } },
          },
        }),
        '401': errorResponse('Unauthorized'),
        '404': errorResponse('Organization not found'),
      },
    });

    this.addPath('get', '/api/v1/enterprise/orgs/{orgId}/monitors', {
      summary: 'List custom monitors',
      description: 'Returns custom monitors configured for an organization.',
      operationId: 'listCustomMonitors',
      tags: ['Enterprise'],
      security: [{ bearerAuth: [] }],
      parameters: [pathParam('orgId', 'Organization ID')],
      responses: {
        '200': jsonResponse('Custom monitors', {
          type: 'object',
          properties: {
            data: { type: 'array', items: { $ref: '#/components/schemas/CustomMonitor' } },
          },
        }),
        '401': errorResponse('Unauthorized'),
      },
    });

    this.addPath('post', '/api/v1/enterprise/orgs/{orgId}/monitors', {
      summary: 'Create a custom monitor',
      description: 'Creates a new custom monitor for an organization.',
      operationId: 'createCustomMonitor',
      tags: ['Enterprise'],
      security: [{ bearerAuth: [] }],
      parameters: [pathParam('orgId', 'Organization ID')],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/CustomMonitor' },
          },
        },
      },
      responses: {
        '201': jsonResponse('Monitor created', { $ref: '#/components/schemas/CustomMonitor' }),
        '400': errorResponse('Invalid monitor config'),
        '401': errorResponse('Unauthorized'),
      },
    });

    this.addPath('get', '/api/v1/enterprise/orgs/{orgId}/dashboards', {
      summary: 'List team dashboards',
      description: 'Returns dashboards configured for an organization.',
      operationId: 'listTeamDashboards',
      tags: ['Enterprise'],
      security: [{ bearerAuth: [] }],
      parameters: [pathParam('orgId', 'Organization ID')],
      responses: {
        '200': jsonResponse('Team dashboards', {
          type: 'object',
          properties: {
            data: { type: 'array', items: { $ref: '#/components/schemas/TeamDashboard' } },
          },
        }),
        '401': errorResponse('Unauthorized'),
      },
    });
  }

  // ── Notification Endpoints ──────────────────────────────────────

  private addNotificationPaths(): void {
    this.addPath('get', '/api/v1/notifications/preferences', {
      summary: 'Get notification preferences',
      description: 'Returns the authenticated user\'s notification preferences.',
      operationId: 'getNotificationPreferences',
      tags: ['Notifications'],
      security: [{ bearerAuth: [] }],
      responses: {
        '200': jsonResponse('Notification preferences', {
          type: 'object',
          properties: {
            data: {
              type: 'array',
              items: { $ref: '#/components/schemas/NotificationPreference' },
            },
          },
        }),
        '401': errorResponse('Unauthorized'),
      },
    });

    this.addPath('put', '/api/v1/notifications/preferences', {
      summary: 'Update notification preferences',
      description: 'Updates notification channel preferences for the authenticated user.',
      operationId: 'updateNotificationPreferences',
      tags: ['Notifications'],
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                channel: { type: 'string' },
                config: { type: 'object' },
                enabled: { type: 'boolean' },
                serviceFilters: { type: 'array', items: { type: 'string' } },
                minSeverity: { type: 'string' },
              },
              required: ['channel', 'enabled'],
            },
          },
        },
      },
      responses: {
        '200': jsonResponse('Updated preferences', {
          $ref: '#/components/schemas/NotificationPreference',
        }),
        '400': errorResponse('Invalid preference data'),
        '401': errorResponse('Unauthorized'),
      },
    });

    this.addPath('post', '/api/v1/notifications/test', {
      summary: 'Send test notification',
      description: 'Sends a test notification to the specified channel for verification.',
      operationId: 'sendTestNotification',
      tags: ['Notifications'],
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                channel: { type: 'string' },
              },
              required: ['channel'],
            },
          },
        },
      },
      responses: {
        '200': jsonResponse('Test sent', {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
          },
        }),
        '401': errorResponse('Unauthorized'),
      },
    });
  }

  // ── Auth Endpoints ──────────────────────────────────────────────

  private addAuthPaths(): void {
    this.addPath('post', '/api/v1/auth/oauth/{provider}', {
      summary: 'Initiate OAuth flow',
      description: 'Starts an OAuth login flow for the specified provider (google, github, discord).',
      operationId: 'initiateOAuth',
      tags: ['Auth'],
      parameters: [pathParam('provider', 'OAuth provider (google, github, discord)')],
      responses: {
        '302': { description: 'Redirect to OAuth provider' },
        '400': errorResponse('Invalid provider'),
      },
    });

    this.addPath('get', '/api/v1/auth/oauth/{provider}/callback', {
      summary: 'OAuth callback',
      description: 'Handles the OAuth callback and issues session tokens.',
      operationId: 'oauthCallback',
      tags: ['Auth'],
      parameters: [
        pathParam('provider', 'OAuth provider'),
        queryParam('code', 'Authorization code'),
        queryParam('state', 'CSRF state token'),
      ],
      responses: {
        '200': jsonResponse('Session created', {
          type: 'object',
          properties: {
            accessToken: { type: 'string' },
            refreshToken: { type: 'string' },
            expiresAt: { type: 'string', format: 'date-time' },
          },
        }),
        '400': errorResponse('Invalid callback'),
      },
    });

    this.addPath('post', '/api/v1/auth/api-keys', {
      summary: 'Create an API key',
      description: 'Creates a new API key for the authenticated user.',
      operationId: 'createApiKey',
      tags: ['Auth'],
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                scopes: { type: 'array', items: { type: 'string' } },
                expiresIn: { type: 'string', description: 'e.g. "90d", "1y"' },
              },
              required: ['name'],
            },
          },
        },
      },
      responses: {
        '201': jsonResponse('API key created', {
          type: 'object',
          properties: {
            key: { type: 'string', description: 'The full API key (shown only once)' },
            record: { $ref: '#/components/schemas/ApiKeyRecord' },
          },
        }),
        '401': errorResponse('Unauthorized'),
      },
    });

    this.addPath('get', '/api/v1/auth/api-keys', {
      summary: 'List API keys',
      description: 'Returns all API keys for the authenticated user.',
      operationId: 'listApiKeys',
      tags: ['Auth'],
      security: [{ bearerAuth: [] }],
      responses: {
        '200': jsonResponse('API keys', {
          type: 'object',
          properties: {
            data: { type: 'array', items: { $ref: '#/components/schemas/ApiKeyRecord' } },
          },
        }),
        '401': errorResponse('Unauthorized'),
      },
    });

    this.addPath('delete', '/api/v1/auth/api-keys/{keyId}', {
      summary: 'Revoke an API key',
      description: 'Permanently revokes an API key.',
      operationId: 'revokeApiKey',
      tags: ['Auth'],
      security: [{ bearerAuth: [] }],
      parameters: [pathParam('keyId', 'The API key ID')],
      responses: {
        '204': { description: 'API key revoked' },
        '401': errorResponse('Unauthorized'),
        '404': errorResponse('API key not found'),
      },
    });
  }
}

// ── Helpers ─────────────────────────────────────────────────────

function pathParam(name: string, description: string): OpenAPIParameter {
  return { name, in: 'path', required: true, description, schema: { type: 'string' } };
}

function queryParam(
  name: string,
  description: string,
  type: string = 'string',
): OpenAPIParameter {
  return { name, in: 'query', required: false, description, schema: { type } };
}

function jsonResponse(description: string, schema: OpenAPISchema): OpenAPIResponse {
  return {
    description,
    content: { 'application/json': { schema } },
  };
}

function errorResponse(description: string): OpenAPIResponse {
  return {
    description,
    content: {
      'application/json': { schema: { $ref: '#/components/schemas/Error' } },
    },
  };
}

/**
 * Minimal JSON-to-YAML converter (no external dependency).
 * Handles objects, arrays, strings, numbers, booleans, and null.
 */
function jsonToYaml(obj: unknown, indent: number = 0): string {
  const prefix = '  '.repeat(indent);

  if (obj === null || obj === undefined) {
    return 'null';
  }

  if (typeof obj === 'string') {
    if (
      obj.includes('\n') ||
      obj.includes(':') ||
      obj.includes('#') ||
      obj.includes('"') ||
      obj.includes("'") ||
      obj.startsWith(' ') ||
      obj.endsWith(' ') ||
      obj === '' ||
      obj === 'true' ||
      obj === 'false' ||
      obj === 'null'
    ) {
      return JSON.stringify(obj);
    }
    return obj;
  }

  if (typeof obj === 'number' || typeof obj === 'boolean') {
    return String(obj);
  }

  if (Array.isArray(obj)) {
    if (obj.length === 0) return '[]';
    const lines: string[] = [];
    for (const item of obj) {
      if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
        const entries = Object.entries(item);
        if (entries.length === 0) {
          lines.push(`${prefix}- {}`);
        } else {
          const [firstKey, firstVal] = entries[0]!;
          lines.push(`${prefix}- ${firstKey}: ${jsonToYaml(firstVal, indent + 2)}`);
          for (let i = 1; i < entries.length; i++) {
            const [key, val] = entries[i]!;
            lines.push(`${prefix}  ${key}: ${jsonToYaml(val, indent + 2)}`);
          }
        }
      } else {
        lines.push(`${prefix}- ${jsonToYaml(item, indent + 1)}`);
      }
    }
    return '\n' + lines.join('\n');
  }

  if (typeof obj === 'object') {
    const entries = Object.entries(obj as Record<string, unknown>);
    if (entries.length === 0) return '{}';
    const lines: string[] = [];
    for (const [key, val] of entries) {
      const yamlKey = key.includes('/') || key.includes('{') ? JSON.stringify(key) : key;
      if (typeof val === 'object' && val !== null) {
        const rendered = jsonToYaml(val, indent + 1);
        if (rendered.startsWith('\n')) {
          lines.push(`${prefix}${yamlKey}:${rendered}`);
        } else {
          lines.push(`${prefix}${yamlKey}: ${rendered}`);
        }
      } else {
        lines.push(`${prefix}${yamlKey}: ${jsonToYaml(val, indent + 1)}`);
      }
    }
    return (indent === 0 ? '' : '\n') + lines.join('\n');
  }

  return String(obj);
}
