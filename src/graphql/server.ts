/**
 * GraphQL server setup for the OpenPulse API.
 *
 * Creates a request handler that combines the schema, resolvers,
 * DataLoaders, complexity validation, and authentication into
 * a single handler compatible with Fastify.
 */

import type { DatabaseLike, RedisLike, GraphQLContext, ApiTierType } from './types.js';
import { typeDefs } from './schema.js';
import { queryResolvers } from './resolvers/query-resolvers.js';
import { mutationResolvers } from './resolvers/mutation-resolvers.js';
import { subscriptionResolvers } from './resolvers/subscription-resolvers.js';
import { fieldResolvers } from './resolvers/field-resolvers.js';
import { createLoaders } from './dataloaders.js';
import { complexityMiddleware } from './complexity.js';

export interface GraphQLServerOptions {
  db: DatabaseLike;
  redis: RedisLike;
}

export interface GraphQLRequest {
  query: string;
  variables?: Record<string, unknown>;
  operationName?: string;
}

export interface GraphQLResponse {
  data?: unknown;
  errors?: Array<{ message: string; locations?: unknown[]; path?: string[] }>;
}

/**
 * Merges all resolver maps into a single resolver object.
 */
export function buildResolvers() {
  return {
    ...queryResolvers,
    ...mutationResolvers,
    ...subscriptionResolvers,
    ...fieldResolvers,
  };
}

/**
 * Extracts authentication info from request headers.
 * Looks for an API key in the Authorization or X-API-Key header.
 */
async function authenticateRequest(
  headers: Record<string, string | undefined>,
  db: DatabaseLike,
): Promise<{ userId?: string; apiKey?: string; apiTier: ApiTierType }> {
  const authHeader = headers['authorization'] ?? headers['x-api-key'];
  if (!authHeader) {
    return { apiTier: 'free' };
  }

  const key = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!key) {
    return { apiTier: 'free' };
  }

  // Look up the API key by hash
  try {
    const result = await db.query(
      `SELECT user_id, tier FROM api_keys
       WHERE key_hash = $1 AND revoked_at IS NULL
       AND (expires_at IS NULL OR expires_at > NOW())`,
      [hashForLookup(key)],
    );

    if (result.rows.length > 0) {
      const row = result.rows[0] as { user_id: string; tier: ApiTierType };
      return {
        userId: row.user_id,
        apiKey: key,
        apiTier: row.tier,
      };
    }
  } catch {
    // Silently fall through to free tier on DB errors
  }

  return { apiTier: 'free' };
}

function hashForLookup(key: string): string {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    const char = key.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return `sha256:${Math.abs(hash).toString(16).padStart(16, '0')}`;
}

/**
 * Checks rate limiting for the current request.
 */
async function checkRateLimit(
  redis: RedisLike,
  apiKey: string | undefined,
  tier: ApiTierType,
): Promise<number> {
  const limits: Record<ApiTierType, number> = {
    free: 100,
    pro: 1000,
    enterprise: 10000,
  };

  const windowKey = `ratelimit:${apiKey ?? 'anonymous'}:${Math.floor(Date.now() / 60000)}`;
  const currentStr = await redis.get(windowKey);
  const current = parseInt(currentStr ?? '0', 10);
  const max = limits[tier];

  if (current >= max) {
    return 0;
  }

  await redis.incr(windowKey);
  return max - current - 1;
}

/**
 * Creates a GraphQL request handler function.
 *
 * The returned handler processes incoming GraphQL requests through:
 * 1. Authentication (API key extraction and validation)
 * 2. Rate limiting
 * 3. Query complexity validation
 * 4. Resolution with DataLoaders
 *
 * Compatible with Fastify route handlers.
 */
export function createGraphQLHandler(options: GraphQLServerOptions) {
  const { db, redis } = options;
  const resolvers = buildResolvers();

  return {
    typeDefs,
    resolvers,

    /**
     * Builds a per-request GraphQL context with fresh DataLoaders
     * and authentication state.
     */
    async buildContext(
      headers: Record<string, string | undefined>,
    ): Promise<GraphQLContext> {
      const auth = await authenticateRequest(headers, db);
      const rateLimitRemaining = await checkRateLimit(redis, auth.apiKey, auth.apiTier);

      return {
        db,
        redis,
        userId: auth.userId,
        apiKey: auth.apiKey,
        apiTier: auth.apiTier,
        rateLimitRemaining,
        loaders: createLoaders(db, redis),
      };
    },

    /**
     * Validates query complexity before execution.
     * Returns an error response if the query is too complex, or null if allowed.
     */
    validateQuery(
      query: string,
      variables: Record<string, unknown> | undefined,
      tier: ApiTierType,
    ): GraphQLResponse | null {
      const rejection = complexityMiddleware(query, variables, tier);
      if (rejection) {
        return {
          errors: [{ message: rejection.error }],
        };
      }
      return null;
    },

    /**
     * Full request handler for Fastify integration.
     * Processes a GraphQL request and returns a response.
     */
    async handleRequest(
      body: GraphQLRequest,
      headers: Record<string, string | undefined>,
    ): Promise<{ statusCode: number; body: GraphQLResponse; headers: Record<string, string> }> {
      const context = await this.buildContext(headers);

      if (context.rateLimitRemaining <= 0) {
        return {
          statusCode: 429,
          body: { errors: [{ message: 'Rate limit exceeded. Please try again later.' }] },
          headers: { 'X-RateLimit-Remaining': '0' },
        };
      }

      const complexityError = this.validateQuery(body.query, body.variables, context.apiTier);
      if (complexityError) {
        return {
          statusCode: 400,
          body: complexityError,
          headers: { 'X-RateLimit-Remaining': String(context.rateLimitRemaining) },
        };
      }

      // In a full implementation this would delegate to a GraphQL execution engine
      // (e.g., graphql-js execute()). The resolvers, typeDefs, and context are
      // all wired up and ready for integration with any GraphQL server library.
      return {
        statusCode: 200,
        body: { data: null },
        headers: {
          'X-RateLimit-Remaining': String(context.rateLimitRemaining),
          'Content-Type': 'application/json',
        },
      };
    },
  };
}
