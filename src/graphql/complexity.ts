/**
 * Query complexity analysis and validation for the OpenPulse GraphQL API.
 *
 * Prevents abuse by computing a complexity score for each query before
 * execution. Fields contribute a base cost, lists multiply by their limit,
 * and nested fields compound multiplicatively.
 */

import type { QueryComplexity, ApiTierType } from './types.js';

/** Per-field cost overrides. Unlisted fields default to 1. */
const FIELD_COSTS: Record<string, number> = {
  services: 2,
  outages: 2,
  analytics: 10,
  outageHistory: 5,
  categorySummary: 5,
  trends: 5,
  reliability: 5,
  service: 1,
  outage: 1,
  recentReports: 2,
  timeline: 2,
  signals: 1,
  probeStatus: 1,
};

/** Maximum complexity per API tier. */
const MAX_COMPLEXITY: Record<ApiTierType, number> = {
  free: 1000,
  pro: 5000,
  enterprise: 10000,
};

/** Default list limit when none specified. */
const DEFAULT_LIST_LIMIT = 20;

interface FieldNode {
  name: string;
  arguments: Record<string, unknown>;
  children: FieldNode[];
}

/**
 * Parses a simplified representation of a GraphQL query into a field tree.
 * This is a lightweight parser that handles the common patterns without
 * requiring a full GraphQL parser dependency.
 */
export function parseQueryFields(query: string, variables?: Record<string, unknown>): FieldNode[] {
  const cleaned = query
    .replace(/#[^\n]*/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  const nodes: FieldNode[] = [];
  parseSelectionSet(cleaned, 0, nodes, variables ?? {});
  return nodes;
}

function parseSelectionSet(
  input: string,
  depth: number,
  nodes: FieldNode[],
  variables: Record<string, unknown>,
): void {
  // Find the first opening brace after query/mutation/subscription keyword
  let startIdx = 0;
  if (depth === 0) {
    const operationMatch = input.match(/(?:query|mutation|subscription)\s*(?:\w+\s*)?(?:\([^)]*\)\s*)?{/);
    if (operationMatch) {
      startIdx = operationMatch.index! + operationMatch[0].length;
    } else {
      const braceIdx = input.indexOf('{');
      if (braceIdx >= 0) {
        startIdx = braceIdx + 1;
      }
    }
  }

  let i = startIdx;
  while (i < input.length) {
    // Skip whitespace
    while (i < input.length && /\s/.test(input[i]!)) i++;
    if (i >= input.length || input[i] === '}') break;

    // Read field name
    let name = '';
    while (i < input.length && /[\w]/.test(input[i]!)) {
      name += input[i];
      i++;
    }
    if (!name) {
      i++;
      continue;
    }

    // Skip alias (name followed by colon)
    while (i < input.length && /\s/.test(input[i]!)) i++;
    if (input[i] === ':') {
      i++;
      while (i < input.length && /\s/.test(input[i]!)) i++;
      name = '';
      while (i < input.length && /[\w]/.test(input[i]!)) {
        name += input[i];
        i++;
      }
    }

    // Parse arguments
    const args: Record<string, unknown> = {};
    while (i < input.length && /\s/.test(input[i]!)) i++;
    if (input[i] === '(') {
      i++;
      let parenDepth = 1;
      let argStr = '';
      while (i < input.length && parenDepth > 0) {
        if (input[i] === '(') parenDepth++;
        else if (input[i] === ')') parenDepth--;
        if (parenDepth > 0) argStr += input[i];
        i++;
      }
      parseArguments(argStr, args, variables);
    }

    // Parse child selection set
    const children: FieldNode[] = [];
    while (i < input.length && /\s/.test(input[i]!)) i++;
    if (input[i] === '{') {
      i++;
      let braceDepth = 1;
      let childStr = '';
      while (i < input.length && braceDepth > 0) {
        if (input[i] === '{') braceDepth++;
        else if (input[i] === '}') braceDepth--;
        if (braceDepth > 0) childStr += input[i];
        i++;
      }
      parseSelectionSet(childStr, depth + 1, children, variables);
    }

    if (name && !name.startsWith('__')) {
      nodes.push({ name, arguments: args, children });
    }
  }
}

function parseArguments(
  argStr: string,
  args: Record<string, unknown>,
  variables: Record<string, unknown>,
): void {
  const argPairs = argStr.split(',');
  for (const pair of argPairs) {
    const colonIdx = pair.indexOf(':');
    if (colonIdx < 0) continue;
    const key = pair.slice(0, colonIdx).trim();
    let value = pair.slice(colonIdx + 1).trim();

    if (value.startsWith('$')) {
      const varName = value.slice(1);
      args[key] = variables[varName] ?? value;
    } else if (value.startsWith('"') && value.endsWith('"')) {
      args[key] = value.slice(1, -1);
    } else if (value === 'true' || value === 'false') {
      args[key] = value === 'true';
    } else if (!isNaN(Number(value))) {
      args[key] = Number(value);
    } else {
      args[key] = value;
    }
  }
}

function computeFieldCost(node: FieldNode, multiplier: number): { score: number; fields: string[] } {
  const baseCost = FIELD_COSTS[node.name] ?? 1;
  const limit = typeof node.arguments['limit'] === 'number'
    ? (node.arguments['limit'] as number)
    : (node.children.length > 0 && isListField(node.name) ? DEFAULT_LIST_LIMIT : 1);

  const effectiveMultiplier = isListField(node.name) ? multiplier * limit : multiplier;
  let score = baseCost * multiplier;
  const fields = [node.name];

  for (const child of node.children) {
    const childResult = computeFieldCost(child, effectiveMultiplier);
    score += childResult.score;
    fields.push(...childResult.fields);
  }

  return { score, fields };
}

function isListField(name: string): boolean {
  return [
    'services', 'outages', 'outageHistory', 'categorySummary',
    'trends', 'reliability', 'recentReports', 'timeline',
    'signals', 'affectedRegions', 'regions', 'nodes',
  ].includes(name);
}

/**
 * Computes the complexity score of a GraphQL query string.
 */
export function computeComplexity(
  query: string,
  variables?: Record<string, unknown>,
  tier: ApiTierType = 'free',
): QueryComplexity {
  const fields = parseQueryFields(query, variables);
  let totalScore = 0;
  const allFields: string[] = [];

  for (const field of fields) {
    const result = computeFieldCost(field, 1);
    totalScore += result.score;
    allFields.push(...result.fields);
  }

  return {
    score: totalScore,
    maxAllowed: MAX_COMPLEXITY[tier],
    fields: allFields,
  };
}

/**
 * Validates a query complexity result against its tier limit.
 */
export function validateComplexity(
  complexity: QueryComplexity,
): { allowed: boolean; reason?: string } {
  if (complexity.score <= complexity.maxAllowed) {
    return { allowed: true };
  }

  return {
    allowed: false,
    reason: `Query complexity ${complexity.score} exceeds maximum allowed ${complexity.maxAllowed}. ` +
      `Simplify your query or upgrade your API tier.`,
  };
}

/**
 * Middleware function that rejects queries exceeding the complexity limit.
 * Returns null if the query is allowed, or an error response if rejected.
 */
export function complexityMiddleware(
  query: string,
  variables: Record<string, unknown> | undefined,
  tier: ApiTierType,
): { error: string } | null {
  const complexity = computeComplexity(query, variables, tier);
  const validation = validateComplexity(complexity);

  if (!validation.allowed) {
    return { error: validation.reason! };
  }

  return null;
}
