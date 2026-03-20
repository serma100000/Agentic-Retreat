/**
 * Service validator for the OpenPulse community contribution system.
 *
 * Validates contributed service URLs, detects duplicates,
 * checks status page formats, and validates categories.
 */

import type {
  ServiceContribution,
  ServiceValidation,
  ValidationMessage,
} from './types.js';
import { ALLOWED_CATEGORIES, type ServiceCategoryType } from './types.js';

const URL_REGEX = /^https?:\/\/[^\s/$.?#].[^\s]*$/i;
const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const KNOWN_STATUS_PAGE_PATTERNS = [
  /status\./i,
  /statuspage\.io/i,
  /atlassian/i,
  /\.statuspage\./i,
  /status\.io/i,
  /cachet/i,
  /uptime/i,
  /health/i,
];

export interface UrlCheckResult {
  reachable: boolean;
  statusCode?: number;
  error?: string;
}

export class ServiceValidator {
  private readonly existingSlugs: Set<string>;
  private readonly existingNames: Set<string>;
  private readonly existingUrls: Set<string>;

  /**
   * HTTP check function, injectable for testing.
   */
  private readonly httpCheck: (url: string) => Promise<UrlCheckResult>;

  constructor(
    existingSlugs: string[] = [],
    existingNames: string[] = [],
    existingUrls: string[] = [],
    httpCheck?: (url: string) => Promise<UrlCheckResult>,
  ) {
    this.existingSlugs = new Set(existingSlugs.map((s) => s.toLowerCase()));
    this.existingNames = new Set(existingNames.map((n) => n.toLowerCase()));
    this.existingUrls = new Set(existingUrls.map((u) => u.toLowerCase()));
    this.httpCheck = httpCheck ?? ServiceValidator.defaultHttpCheck;
  }

  /**
   * Validate that a URL is well-formed and reachable.
   */
  async validateUrl(url: string): Promise<boolean> {
    if (!URL_REGEX.test(url)) {
      return false;
    }
    try {
      const result = await this.httpCheck(url);
      return result.reachable;
    } catch {
      return false;
    }
  }

  /**
   * Check whether a URL looks like a known status page format.
   */
  validateStatusPageUrl(url: string): { valid: boolean; format?: string } {
    if (!URL_REGEX.test(url)) {
      return { valid: false };
    }

    for (const pattern of KNOWN_STATUS_PAGE_PATTERNS) {
      if (pattern.test(url)) {
        const formatMatch = url.match(/statuspage\.io/i)
          ? 'atlassian-statuspage'
          : url.match(/status\.io/i)
            ? 'status-io'
            : url.match(/cachet/i)
              ? 'cachet'
              : 'generic';
        return { valid: true, format: formatMatch };
      }
    }

    return { valid: false };
  }

  /**
   * Detect duplicate services by fuzzy matching name, slug, and URL.
   */
  detectDuplicate(
    name: string,
    slug: string,
    url: string,
  ): { duplicate: boolean; matches: string[] } {
    const matches: string[] = [];

    if (this.existingSlugs.has(slug.toLowerCase())) {
      matches.push(`slug "${slug}" already exists`);
    }

    if (this.existingNames.has(name.toLowerCase())) {
      matches.push(`name "${name}" already exists`);
    }

    const normalizedUrl = this.normalizeUrl(url);
    if (this.existingUrls.has(normalizedUrl)) {
      matches.push(`URL "${url}" already exists`);
    }

    // Fuzzy name matching: check for names that are very similar
    const lowerName = name.toLowerCase();
    for (const existing of this.existingNames) {
      if (existing !== lowerName && this.levenshteinSimilarity(lowerName, existing) > 0.85) {
        matches.push(`name "${name}" is similar to existing "${existing}"`);
      }
    }

    return { duplicate: matches.length > 0, matches };
  }

  /**
   * Validate a category against the allowed list.
   */
  validateCategory(category: string): boolean {
    return (ALLOWED_CATEGORIES as readonly string[]).includes(category);
  }

  /**
   * Run full validation on a contribution.
   */
  async runFullValidation(
    contribution: ServiceContribution,
  ): Promise<ServiceValidation> {
    const errors: ValidationMessage[] = [];
    const warnings: ValidationMessage[] = [];

    // Validate required fields
    if (!contribution.name || contribution.name.trim().length === 0) {
      errors.push({ field: 'name', message: 'Name is required', code: 'REQUIRED' });
    } else if (contribution.name.length > 100) {
      errors.push({ field: 'name', message: 'Name must be 100 characters or less', code: 'TOO_LONG' });
    }

    if (!contribution.slug || contribution.slug.trim().length === 0) {
      errors.push({ field: 'slug', message: 'Slug is required', code: 'REQUIRED' });
    } else if (!SLUG_REGEX.test(contribution.slug)) {
      errors.push({
        field: 'slug',
        message: 'Slug must be lowercase alphanumeric with hyphens only',
        code: 'INVALID_FORMAT',
      });
    }

    if (!contribution.url || contribution.url.trim().length === 0) {
      errors.push({ field: 'url', message: 'URL is required', code: 'REQUIRED' });
    } else if (!URL_REGEX.test(contribution.url)) {
      errors.push({ field: 'url', message: 'URL must be a valid HTTP/HTTPS URL', code: 'INVALID_URL' });
    }

    if (!contribution.description || contribution.description.trim().length === 0) {
      errors.push({ field: 'description', message: 'Description is required', code: 'REQUIRED' });
    }

    if (!contribution.category) {
      errors.push({ field: 'category', message: 'Category is required', code: 'REQUIRED' });
    } else if (!this.validateCategory(contribution.category)) {
      errors.push({
        field: 'category',
        message: `Invalid category "${contribution.category}". Allowed: ${ALLOWED_CATEGORIES.join(', ')}`,
        code: 'INVALID_CATEGORY',
      });
    }

    // URL reachability check (only if URL is valid format)
    if (contribution.url && URL_REGEX.test(contribution.url)) {
      const reachable = await this.validateUrl(contribution.url);
      if (!reachable) {
        warnings.push({
          field: 'url',
          message: 'URL could not be reached; it may be temporarily unavailable',
          code: 'UNREACHABLE',
        });
      }
    }

    // Status page URL validation
    if (contribution.statusPageUrl) {
      const statusResult = this.validateStatusPageUrl(contribution.statusPageUrl);
      if (!statusResult.valid) {
        warnings.push({
          field: 'statusPageUrl',
          message: 'Status page URL does not match known status page formats',
          code: 'UNKNOWN_FORMAT',
        });
      }
    } else {
      warnings.push({
        field: 'statusPageUrl',
        message: 'No status page URL provided; detection accuracy may be reduced',
        code: 'MISSING_STATUS_PAGE',
      });
    }

    // Duplicate detection
    if (contribution.name && contribution.slug && contribution.url) {
      const dupeCheck = this.detectDuplicate(
        contribution.name,
        contribution.slug,
        contribution.url,
      );
      if (dupeCheck.duplicate) {
        for (const match of dupeCheck.matches) {
          errors.push({
            field: 'duplicate',
            message: `Duplicate detected: ${match}`,
            code: 'DUPLICATE',
          });
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  // ---- Private ----

  private normalizeUrl(url: string): string {
    try {
      const parsed = new URL(url);
      return `${parsed.protocol}//${parsed.host}${parsed.pathname}`.toLowerCase().replace(/\/+$/, '');
    } catch {
      return url.toLowerCase();
    }
  }

  private levenshteinSimilarity(a: string, b: string): number {
    if (a === b) return 1;
    const maxLen = Math.max(a.length, b.length);
    if (maxLen === 0) return 1;
    return 1 - this.levenshteinDistance(a, b) / maxLen;
  }

  private levenshteinDistance(a: string, b: string): number {
    const m = a.length;
    const n = b.length;
    const dp: number[][] = Array.from({ length: m + 1 }, () =>
      Array.from({ length: n + 1 }, () => 0),
    );

    for (let i = 0; i <= m; i++) dp[i]![0] = i;
    for (let j = 0; j <= n; j++) dp[0]![j] = j;

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        dp[i]![j] = Math.min(
          dp[i - 1]![j]! + 1,
          dp[i]![j - 1]! + 1,
          dp[i - 1]![j - 1]! + cost,
        );
      }
    }

    return dp[m]![n]!;
  }

  private static async defaultHttpCheck(url: string): Promise<UrlCheckResult> {
    try {
      const response = await fetch(url, {
        method: 'HEAD',
        signal: AbortSignal.timeout(10000),
        redirect: 'follow',
      });
      return {
        reachable: response.ok,
        statusCode: response.status,
      };
    } catch (err) {
      return {
        reachable: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}
