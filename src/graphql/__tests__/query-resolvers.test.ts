import { describe, expect, it, beforeEach } from 'vitest';
import { queryResolvers } from '../resolvers/query-resolvers.js';
import type { GraphQLContext, DatabaseLike, RedisLike, DataLoaders } from '../types.js';

function createMockDb(queryResults: Record<string, { rows: unknown[] }> = {}): DatabaseLike {
  const defaultResults: Record<string, { rows: unknown[] }> = {
    COUNT: { rows: [{ count: 0 }] },
    SELECT: { rows: [] },
  };

  return {
    query: async (sql: string, _params?: unknown[]) => {
      for (const [key, value] of Object.entries(queryResults)) {
        if (sql.includes(key)) return value;
      }
      if (sql.includes('COUNT')) return defaultResults['COUNT']!;
      return defaultResults['SELECT']!;
    },
  };
}

function createMockRedis(): RedisLike {
  return {
    get: async () => null,
    set: async () => 'OK',
    incr: async () => 1,
    mget: async () => [],
    del: async () => 1,
  };
}

function createMockLoaders(): DataLoaders {
  return {
    serviceLoader: { load: async () => null, loadMany: async () => [], clear: () => {}, clearAll: () => {} },
    outageLoader: { load: async () => [], loadMany: async () => [], clear: () => {}, clearAll: () => {} },
    timelineLoader: { load: async () => [], loadMany: async () => [], clear: () => {}, clearAll: () => {} },
    probeStatusLoader: { load: async () => null, loadMany: async () => [], clear: () => {}, clearAll: () => {} },
    reportCountLoader: { load: async () => 0, loadMany: async () => [], clear: () => {}, clearAll: () => {} },
  };
}

function createContext(db?: DatabaseLike): GraphQLContext {
  return {
    db: db ?? createMockDb(),
    redis: createMockRedis(),
    apiTier: 'free',
    rateLimitRemaining: 100,
    loaders: createMockLoaders(),
  };
}

const services = [
  { id: 'svc-1', slug: 'github', name: 'GitHub', category: 'devtools', url: 'https://github.com', created_at: new Date(), updated_at: new Date() },
  { id: 'svc-2', slug: 'slack', name: 'Slack', category: 'communication', url: 'https://slack.com', created_at: new Date(), updated_at: new Date() },
  { id: 'svc-3', slug: 'aws', name: 'AWS', category: 'cloud', url: 'https://aws.amazon.com', created_at: new Date(), updated_at: new Date() },
];

const outages = [
  { id: 'out-1', service_id: 'svc-1', status: 'ACTIVE', confidence: 0.85, started_at: new Date('2026-03-19'), resolved_at: null, affected_regions: ['us-east-1'], detection_signals: '[]' },
  { id: 'out-2', service_id: 'svc-2', status: 'RESOLVED', confidence: 0.95, started_at: new Date('2026-03-18'), resolved_at: new Date('2026-03-18T12:00:00Z'), affected_regions: ['eu-west-1'], detection_signals: '[]' },
];

describe('queryResolvers', () => {
  describe('services', () => {
    it('returns paginated results', async () => {
      const db = createMockDb({
        'COUNT': { rows: [{ count: 3 }] },
        'SELECT': { rows: services },
      });
      const ctx = createContext(db);
      const result = await queryResolvers.Query.services(null, {}, ctx);

      expect(result.totalCount).toBe(3);
      expect(result.nodes).toHaveLength(3);
      expect(result.pageInfo.hasNextPage).toBe(false);
      expect(result.pageInfo.hasPreviousPage).toBe(false);
    });

    it('returns correct pageInfo when more results exist', async () => {
      const db = createMockDb({
        'COUNT': { rows: [{ count: 50 }] },
        'SELECT': { rows: services.slice(0, 2) },
      });
      const ctx = createContext(db);
      const result = await queryResolvers.Query.services(null, { limit: 2, offset: 0 }, ctx);

      expect(result.totalCount).toBe(50);
      expect(result.pageInfo.hasNextPage).toBe(true);
      expect(result.pageInfo.hasPreviousPage).toBe(false);
    });

    it('returns hasPreviousPage when offset > 0', async () => {
      const db = createMockDb({
        'COUNT': { rows: [{ count: 50 }] },
        'SELECT': { rows: services.slice(0, 2) },
      });
      const ctx = createContext(db);
      const result = await queryResolvers.Query.services(null, { limit: 2, offset: 10 }, ctx);

      expect(result.pageInfo.hasPreviousPage).toBe(true);
    });

    it('filters by category', async () => {
      const filtered = services.filter(s => s.category === 'devtools');
      const queries: string[] = [];
      const db: DatabaseLike = {
        query: async (sql: string, params?: unknown[]) => {
          queries.push(sql);
          if (sql.includes('COUNT')) return { rows: [{ count: filtered.length }] };
          return { rows: filtered };
        },
      };
      const ctx = createContext(db);
      const result = await queryResolvers.Query.services(null, { category: 'devtools' }, ctx);

      expect(result.nodes).toHaveLength(1);
      expect(queries.some(q => q.includes('category'))).toBe(true);
    });

    it('filters by search term', async () => {
      const queries: string[] = [];
      const db: DatabaseLike = {
        query: async (sql: string) => {
          queries.push(sql);
          if (sql.includes('COUNT')) return { rows: [{ count: 1 }] };
          return { rows: [services[0]] };
        },
      };
      const ctx = createContext(db);
      const result = await queryResolvers.Query.services(null, { search: 'git' }, ctx);

      expect(result.nodes).toHaveLength(1);
      expect(queries.some(q => q.includes('ILIKE'))).toBe(true);
    });

    it('filters by both category and search', async () => {
      const queries: string[] = [];
      const db: DatabaseLike = {
        query: async (sql: string) => {
          queries.push(sql);
          if (sql.includes('COUNT')) return { rows: [{ count: 1 }] };
          return { rows: [services[0]] };
        },
      };
      const ctx = createContext(db);
      const result = await queryResolvers.Query.services(
        null,
        { category: 'devtools', search: 'git' },
        ctx,
      );

      expect(result.nodes).toHaveLength(1);
      expect(queries.some(q => q.includes('category') && q.includes('ILIKE'))).toBe(true);
    });

    it('caps limit at 100', async () => {
      const capturedParams: unknown[][] = [];
      const db: DatabaseLike = {
        query: async (sql: string, params?: unknown[]) => {
          if (params) capturedParams.push(params);
          if (sql.includes('COUNT')) return { rows: [{ count: 500 }] };
          return { rows: [] };
        },
      };
      const ctx = createContext(db);
      await queryResolvers.Query.services(null, { limit: 999 }, ctx);

      // The second query should have limit=100 as the second-to-last param
      const dataParams = capturedParams[1];
      expect(dataParams).toBeDefined();
      expect(dataParams![0]).toBe(100);
    });
  });

  describe('service', () => {
    it('returns single service by slug', async () => {
      const db = createMockDb({
        'slug': { rows: [services[0]] },
      });
      const ctx = createContext(db);
      const result = await queryResolvers.Query.service(null, { slug: 'github' }, ctx);

      expect(result).not.toBeNull();
      expect(result!.slug).toBe('github');
    });

    it('returns null for non-existent slug', async () => {
      const db = createMockDb({});
      const ctx = createContext(db);
      const result = await queryResolvers.Query.service(null, { slug: 'nonexistent' }, ctx);

      expect(result).toBeNull();
    });

    it('returns service with correct fields', async () => {
      const db = createMockDb({
        'slug': { rows: [services[0]] },
      });
      const ctx = createContext(db);
      const result = await queryResolvers.Query.service(null, { slug: 'github' }, ctx);

      expect(result).toMatchObject({
        id: 'svc-1',
        slug: 'github',
        name: 'GitHub',
        category: 'devtools',
        url: 'https://github.com',
      });
    });
  });

  describe('outages', () => {
    it('returns active outages', async () => {
      const active = outages.filter(o => o.status === 'ACTIVE');
      const db: DatabaseLike = {
        query: async (sql: string) => {
          if (sql.includes('COUNT')) return { rows: [{ count: active.length }] };
          return { rows: active };
        },
      };
      const ctx = createContext(db);
      const result = await queryResolvers.Query.outages(null, { status: 'ACTIVE' }, ctx);

      expect(result.nodes).toHaveLength(1);
      expect(result.nodes[0]!.status).toBe('ACTIVE');
    });

    it('returns all outages without filter', async () => {
      const db: DatabaseLike = {
        query: async (sql: string) => {
          if (sql.includes('COUNT')) return { rows: [{ count: outages.length }] };
          return { rows: outages };
        },
      };
      const ctx = createContext(db);
      const result = await queryResolvers.Query.outages(null, {}, ctx);

      expect(result.nodes).toHaveLength(2);
      expect(result.totalCount).toBe(2);
    });

    it('paginates outages correctly', async () => {
      const db: DatabaseLike = {
        query: async (sql: string) => {
          if (sql.includes('COUNT')) return { rows: [{ count: 50 }] };
          return { rows: [outages[0]] };
        },
      };
      const ctx = createContext(db);
      const result = await queryResolvers.Query.outages(null, { limit: 1, offset: 5 }, ctx);

      expect(result.pageInfo.hasNextPage).toBe(true);
      expect(result.pageInfo.hasPreviousPage).toBe(true);
    });
  });

  describe('outage', () => {
    it('returns full outage detail', async () => {
      const db = createMockDb({
        'id': { rows: [outages[0]] },
      });
      const ctx = createContext(db);
      const result = await queryResolvers.Query.outage(null, { id: 'out-1' }, ctx);

      expect(result).not.toBeNull();
      expect(result!.id).toBe('out-1');
      expect(result!.status).toBe('ACTIVE');
      expect(result!.confidence).toBe(0.85);
    });

    it('returns null for non-existent outage', async () => {
      const db = createMockDb({});
      const ctx = createContext(db);
      const result = await queryResolvers.Query.outage(null, { id: 'nonexistent' }, ctx);

      expect(result).toBeNull();
    });
  });

  describe('analytics', () => {
    it('returns analytics data structure', async () => {
      const db: DatabaseLike = {
        query: async () => ({ rows: [] }),
      };
      const ctx = createContext(db);
      const result = await queryResolvers.Query.analytics(null, {}, ctx);

      expect(result).toHaveProperty('outageHistory');
      expect(result).toHaveProperty('categorySummary');
      expect(result).toHaveProperty('trends');
      expect(result).toHaveProperty('reliability');
      expect(Array.isArray(result.outageHistory)).toBe(true);
      expect(Array.isArray(result.categorySummary)).toBe(true);
      expect(Array.isArray(result.trends)).toBe(true);
      expect(Array.isArray(result.reliability)).toBe(true);
    });

    it('returns history and trends with data', async () => {
      const historyData = [
        { outageId: 'out-1', serviceSlug: 'github', serviceName: 'GitHub', state: 'ACTIVE', confidence: 0.85, startedAt: '2026-03-19', resolvedAt: null, durationMs: 3600000, affectedRegions: ['us-east-1'] },
      ];
      const trendData = [
        { period: '2026-03', totalOutages: 5, avgDuration: 1800, serviceCount: 3 },
      ];

      let callCount = 0;
      const db: DatabaseLike = {
        query: async (sql: string) => {
          callCount++;
          if (callCount === 1) return { rows: historyData };
          if (callCount === 2) return { rows: [] };
          if (callCount === 3) return { rows: trendData };
          return { rows: [] };
        },
      };
      const ctx = createContext(db);
      const result = await queryResolvers.Query.analytics(null, {
        serviceSlug: 'github',
        startDate: '2026-03-01',
        endDate: '2026-03-31',
      }, ctx);

      expect(result.outageHistory).toHaveLength(1);
      expect(result.trends).toHaveLength(1);
    });
  });
});
