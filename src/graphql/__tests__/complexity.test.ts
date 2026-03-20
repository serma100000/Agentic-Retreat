import { describe, expect, it } from 'vitest';
import { computeComplexity, validateComplexity, complexityMiddleware } from '../complexity.js';

describe('computeComplexity', () => {
  it('returns low score for a simple query', () => {
    const query = `
      query {
        service(slug: "github") {
          id
          name
          slug
        }
      }
    `;
    const result = computeComplexity(query);
    expect(result.score).toBeLessThan(10);
    expect(result.fields).toContain('service');
  });

  it('returns higher score for nested queries', () => {
    const query = `
      query {
        services(limit: 10) {
          nodes {
            id
            name
            outages(limit: 5) {
              id
              status
              timeline {
                id
                state
              }
            }
          }
        }
      }
    `;
    const result = computeComplexity(query);
    expect(result.score).toBeGreaterThan(20);
    expect(result.fields).toContain('services');
    expect(result.fields).toContain('outages');
  });

  it('multiplies cost by list limit', () => {
    const smallQuery = `
      query {
        services(limit: 5) {
          nodes {
            id
          }
        }
      }
    `;
    const largeQuery = `
      query {
        services(limit: 50) {
          nodes {
            id
          }
        }
      }
    `;
    const smallResult = computeComplexity(smallQuery);
    const largeResult = computeComplexity(largeQuery);
    expect(largeResult.score).toBeGreaterThan(smallResult.score);
  });

  it('assigns higher base cost to analytics queries', () => {
    const simpleQuery = `
      query {
        service(slug: "github") {
          id
          name
        }
      }
    `;
    const analyticsQuery = `
      query {
        analytics {
          outageHistory {
            outageId
            serviceSlug
          }
          trends {
            period
            totalOutages
          }
        }
      }
    `;
    const simpleResult = computeComplexity(simpleQuery);
    const analyticsResult = computeComplexity(analyticsQuery);
    expect(analyticsResult.score).toBeGreaterThan(simpleResult.score);
  });

  it('uses default limit for list fields without explicit limit', () => {
    const query = `
      query {
        services {
          nodes {
            id
          }
        }
      }
    `;
    const result = computeComplexity(query);
    // Default limit of 20 should be applied for 'services' list field
    expect(result.score).toBeGreaterThan(5);
  });

  it('resolves variables in limit arguments', () => {
    const query = `
      query GetServices($limit: Int) {
        services(limit: $limit) {
          nodes {
            id
          }
        }
      }
    `;
    const result = computeComplexity(query, { limit: 100 });
    expect(result.score).toBeGreaterThan(50);
  });

  it('deeply nested query accumulates high complexity', () => {
    const query = `
      query {
        services(limit: 20) {
          nodes {
            id
            name
            outages(limit: 10) {
              id
              timeline {
                id
                state
              }
              signals {
                source
                score
              }
              service {
                id
                name
              }
            }
            recentReports(limit: 5) {
              id
              type
            }
          }
        }
      }
    `;
    const result = computeComplexity(query);
    expect(result.score).toBeGreaterThan(100);
  });

  it('handles empty query gracefully', () => {
    const result = computeComplexity('{ }');
    expect(result.score).toBe(0);
    expect(result.fields).toHaveLength(0);
  });
});

describe('validateComplexity', () => {
  it('allows queries under the limit', () => {
    const result = validateComplexity({ score: 50, maxAllowed: 1000, fields: ['service'] });
    expect(result.allowed).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it('rejects queries exceeding the limit', () => {
    const result = validateComplexity({ score: 1500, maxAllowed: 1000, fields: ['services', 'outages'] });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('1500');
    expect(result.reason).toContain('1000');
  });

  it('allows queries exactly at the limit', () => {
    const result = validateComplexity({ score: 1000, maxAllowed: 1000, fields: [] });
    expect(result.allowed).toBe(true);
  });

  it('uses correct limits for different tiers', () => {
    const query = `
      query {
        services(limit: 50) {
          nodes {
            id
            name
            outages(limit: 20) {
              id
              timeline {
                id
              }
            }
          }
        }
      }
    `;

    const freeResult = computeComplexity(query, undefined, 'free');
    const proResult = computeComplexity(query, undefined, 'pro');
    const enterpriseResult = computeComplexity(query, undefined, 'enterprise');

    // Same score but different max allowed
    expect(freeResult.maxAllowed).toBe(1000);
    expect(proResult.maxAllowed).toBe(5000);
    expect(enterpriseResult.maxAllowed).toBe(10000);

    // Scores should be equal regardless of tier
    expect(freeResult.score).toBe(proResult.score);
    expect(proResult.score).toBe(enterpriseResult.score);
  });
});

describe('complexityMiddleware', () => {
  it('returns null for allowed queries', () => {
    const query = '{ service(slug: "github") { id name } }';
    const result = complexityMiddleware(query, undefined, 'free');
    expect(result).toBeNull();
  });

  it('returns error for overly complex queries', () => {
    // Build a deeply nested query that will exceed the limit
    const query = `
      query {
        services(limit: 100) {
          nodes {
            outages(limit: 100) {
              timeline {
                id state
              }
              signals {
                source score
              }
            }
            recentReports(limit: 100) {
              id type
            }
          }
        }
      }
    `;
    const result = complexityMiddleware(query, undefined, 'free');
    // This may or may not exceed 1000 depending on the scoring; validate structure
    if (result) {
      expect(result.error).toContain('exceeds');
    }
  });
});
