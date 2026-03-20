/**
 * Rule-based entity extraction for outage mentions.
 *
 * Extracts service names (fuzzy matching), error codes, and symptom keywords
 * from preprocessed social media text. Designed as an MVP to be replaced
 * with a trained NER model later.
 */

import type { EntityExtraction } from './types.js';

/**
 * HTTP status codes commonly reported in outage posts.
 */
const ERROR_CODE_PATTERNS: RegExp[] = [
  /\b(4\d{2})\b/g,                              // 4xx client errors
  /\b(5\d{2})\b/g,                              // 5xx server errors
  /error\s*(\d{3})/gi,                          // "Error 503"
  /(\d{3})\s*(?:internal\s*server\s*)?error/gi, // "500 Internal Server Error"
  /http\s*(\d{3})/gi,                           // "HTTP 502"
  /status\s*(?:code\s*)?(\d{3})/gi,             // "status code 503"
];

/**
 * Symptom keywords indicating specific outage characteristics.
 */
const SYMPTOM_KEYWORDS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\bslow\b/i, label: 'slow' },
  { pattern: /\btimeout\b/i, label: 'timeout' },
  { pattern: /\btimed?\s*out\b/i, label: 'timeout' },
  { pattern: /can'?t\s*connect/i, label: "can't connect" },
  { pattern: /won'?t\s*load/i, label: "won't load" },
  { pattern: /not\s*loading/i, label: "won't load" },
  { pattern: /login\s*fail/i, label: 'login failed' },
  { pattern: /can'?t\s*log\s*in/i, label: 'login failed' },
  { pattern: /crash/i, label: 'crash' },
  { pattern: /\bdown\b/i, label: 'down' },
  { pattern: /\bbroken\b/i, label: 'broken' },
  { pattern: /\bunreachable\b/i, label: 'unreachable' },
  { pattern: /\bunresponsive\b/i, label: 'unresponsive' },
  { pattern: /\blatency\b/i, label: 'latency' },
  { pattern: /\bdegraded\b/i, label: 'degraded' },
  { pattern: /packet\s*loss/i, label: 'packet loss' },
  { pattern: /connection\s*refused/i, label: 'connection refused' },
  { pattern: /not\s*working/i, label: 'not working' },
  { pattern: /\berror\b/i, label: 'error' },
  { pattern: /\bfailed?\b/i, label: 'failed' },
];

interface ServiceEntry {
  name: string;
  slug: string;
  nameLower: string;
  aliases: string[];
}

export class EntityExtractor {
  private services: ServiceEntry[];
  private serviceMap: Map<string, ServiceEntry>;

  constructor(services: Array<{ name: string; slug: string }> = []) {
    this.services = [];
    this.serviceMap = new Map();
    this.loadServiceCatalog(services);
  }

  /**
   * Load or replace the service catalog used for entity matching.
   */
  loadServiceCatalog(services: Array<{ name: string; slug: string }>): void {
    this.services = services.map((s) => ({
      name: s.name,
      slug: s.slug,
      nameLower: s.name.toLowerCase(),
      aliases: this.generateAliases(s.name),
    }));

    this.serviceMap.clear();
    for (const service of this.services) {
      this.serviceMap.set(service.nameLower, service);
      for (const alias of service.aliases) {
        this.serviceMap.set(alias, service);
      }
    }
  }

  /**
   * Extract entities from text: service names, error codes, symptoms.
   */
  extract(text: string): EntityExtraction[] {
    const textLower = text.toLowerCase();
    const matchedServices = this.matchServices(text, textLower);
    const errorCodes = this.extractErrorCodes(text);
    const symptoms = this.extractSymptoms(textLower);

    if (matchedServices.length === 0) {
      return [];
    }

    return matchedServices.map((match) => ({
      serviceName: match.service.name,
      serviceSlug: match.service.slug,
      errorCode: errorCodes[0],
      symptoms: [...new Set(symptoms)],
      confidence: this.calculateConfidence(match, errorCodes, symptoms),
    }));
  }

  private matchServices(
    text: string,
    textLower: string,
  ): Array<{ service: ServiceEntry; matchType: 'exact' | 'fuzzy'; position: number }> {
    const matches: Array<{
      service: ServiceEntry;
      matchType: 'exact' | 'fuzzy';
      position: number;
    }> = [];
    const seen = new Set<string>();

    for (const service of this.services) {
      if (seen.has(service.slug)) continue;

      // Try exact match (case-insensitive, word boundary)
      const exactPattern = new RegExp(
        `\\b${this.escapeRegex(service.nameLower)}\\b`,
        'i',
      );
      const exactMatch = exactPattern.exec(text);
      if (exactMatch) {
        matches.push({
          service,
          matchType: 'exact',
          position: exactMatch.index,
        });
        seen.add(service.slug);
        continue;
      }

      // Try alias matches
      let aliasMatched = false;
      for (const alias of service.aliases) {
        const aliasPattern = new RegExp(`\\b${this.escapeRegex(alias)}\\b`, 'i');
        const aliasMatch = aliasPattern.exec(text);
        if (aliasMatch) {
          matches.push({
            service,
            matchType: 'exact',
            position: aliasMatch.index,
          });
          seen.add(service.slug);
          aliasMatched = true;
          break;
        }
      }
      if (aliasMatched) continue;

      // Try fuzzy match: check if text contains something similar
      const fuzzyResult = this.fuzzyMatch(textLower, service.nameLower);
      if (fuzzyResult.matched) {
        matches.push({
          service,
          matchType: 'fuzzy',
          position: fuzzyResult.position,
        });
        seen.add(service.slug);
      }
    }

    return matches;
  }

  private extractErrorCodes(text: string): string[] {
    const codes = new Set<string>();

    for (const pattern of ERROR_CODE_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match: RegExpExecArray | null;
      while ((match = regex.exec(text)) !== null) {
        const code = match[1];
        if (code) {
          const num = parseInt(code, 10);
          // Only include valid HTTP error codes (400-599)
          if (num >= 400 && num <= 599) {
            codes.add(code);
          }
        }
      }
    }

    return [...codes];
  }

  private extractSymptoms(textLower: string): string[] {
    const symptoms: string[] = [];

    for (const { pattern, label } of SYMPTOM_KEYWORDS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      if (regex.test(textLower)) {
        symptoms.push(label);
      }
    }

    return symptoms;
  }

  private fuzzyMatch(
    textLower: string,
    nameLower: string,
  ): { matched: boolean; position: number } {
    // For short names (<=3 chars), require exact match to avoid false positives
    if (nameLower.length <= 3) {
      return { matched: false, position: -1 };
    }

    // Allow fuzzy matching for names >= 5 chars
    // Longer names tolerate more edits (handles transpositions)
    if (nameLower.length >= 5) {
      const maxDist = nameLower.length >= 8 ? 2 : 1;
      const words = textLower.split(/\s+/);
      // Strip common punctuation from words for comparison
      const cleanWords = words.map((w) => w.replace(/[^a-z0-9]/g, ''));
      for (let wi = 0; wi < cleanWords.length; wi++) {
        const word = cleanWords[wi]!;
        if (word.length >= 4 && this.editDistance(word, nameLower) <= maxDist) {
          const position = textLower.indexOf(words[wi]!);
          return { matched: true, position };
        }
      }

      // Check multi-word service names against consecutive words
      const nameWords = nameLower.split(/\s+/);
      if (nameWords.length > 1) {
        for (let i = 0; i <= words.length - nameWords.length; i++) {
          const slice = words.slice(i, i + nameWords.length).join(' ');
          if (this.editDistance(slice, nameLower) <= 1) {
            const position = textLower.indexOf(words[i]!);
            return { matched: true, position };
          }
        }
      }
    }

    return { matched: false, position: -1 };
  }

  private editDistance(a: string, b: string): number {
    if (Math.abs(a.length - b.length) > 2) return 3; // early exit

    const m = a.length;
    const n = b.length;
    const dp: number[][] = Array.from({ length: m + 1 }, () =>
      new Array(n + 1).fill(0) as number[],
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

  private calculateConfidence(
    match: { service: ServiceEntry; matchType: 'exact' | 'fuzzy' },
    errorCodes: string[],
    symptoms: string[],
  ): number {
    let confidence = match.matchType === 'exact' ? 0.8 : 0.5;

    if (errorCodes.length > 0) {
      confidence = Math.min(confidence + 0.1, 1.0);
    }

    if (symptoms.length > 0) {
      confidence = Math.min(confidence + 0.05 * symptoms.length, 1.0);
    }

    return Math.round(confidence * 100) / 100;
  }

  private generateAliases(name: string): string[] {
    const aliases: string[] = [];
    const lower = name.toLowerCase();

    // Add acronym for multi-word names
    const words = name.split(/\s+/);
    if (words.length > 1) {
      aliases.push(words.map((w) => w[0]).join('').toLowerCase());
    }

    // Common abbreviations
    const abbreviations: Record<string, string[]> = {
      'playstation network': ['psn'],
      'amazon web services': [],
      'google cloud platform': ['gcp'],
      'microsoft azure': ['azure'],
      'visual studio code': ['vscode'],
    };

    const abbrs = abbreviations[lower];
    if (abbrs) {
      aliases.push(...abbrs);
    }

    return aliases;
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
