/**
 * Changelog generator for OpenPulse.
 *
 * Parses conventional commit messages, groups them by type,
 * and produces formatted CHANGELOG output in Markdown and JSON.
 */

import type {
  ChangelogEntry,
  ChangelogVersion,
  ConventionalCommit,
} from './types.js';

const COMMIT_REGEX = /^(?<type>[a-z]+)(?:\((?<scope>[^)]+)\))?(?<breaking>!)?\s*:\s*(?<description>.+)$/;

const TYPE_LABELS: Record<string, string> = {
  feat: 'Features',
  fix: 'Bug Fixes',
  perf: 'Performance Improvements',
  docs: 'Documentation',
  refactor: 'Code Refactoring',
  test: 'Tests',
  chore: 'Chores',
  ci: 'CI/CD',
  style: 'Style',
  build: 'Build System',
};

const TYPE_ORDER: string[] = [
  'feat', 'fix', 'perf', 'docs', 'refactor', 'test', 'chore', 'ci', 'style', 'build',
];

export class ChangelogGenerator {
  /**
   * Parse raw commit messages into structured changelog entries.
   * Each commit string should be in the format:
   *   "hash date type(scope): description"
   * or simply:
   *   "type(scope): description"
   */
  generateFromCommits(commits: string[]): ChangelogEntry[] {
    const entries: ChangelogEntry[] = [];

    for (const raw of commits) {
      const parsed = this.parseCommit(raw);
      if (!parsed) continue;

      entries.push({
        type: this.normalizeType(parsed.type),
        scope: parsed.scope,
        description: parsed.description,
        hash: parsed.hash,
        date: parsed.date,
        breaking: parsed.breaking,
      });
    }

    return entries;
  }

  /**
   * Parse a single commit string into a ConventionalCommit.
   *
   * Accepts formats:
   *   "abc1234 2025-01-15 feat(auth): add OAuth support"
   *   "feat(auth): add OAuth support"
   */
  parseCommit(raw: string): ConventionalCommit | null {
    const trimmed = raw.trim();
    if (!trimmed) return null;

    let hash = '';
    let date = '';
    let messagePart = trimmed;

    // Try to extract hash and date prefix: "abc1234 2025-01-15 type: desc"
    const prefixMatch = /^([a-z0-9]{7,40})\s+(\d{4}-\d{2}-\d{2})\s+(.+)$/.exec(trimmed);
    if (prefixMatch) {
      hash = prefixMatch[1]!;
      date = prefixMatch[2]!;
      messagePart = prefixMatch[3]!;
    }

    const match = COMMIT_REGEX.exec(messagePart);
    if (!match?.groups) return null;

    return {
      hash,
      type: match.groups['type']!,
      scope: match.groups['scope'] || undefined,
      description: match.groups['description']!.trim(),
      breaking: match.groups['breaking'] === '!',
      date,
    };
  }

  /**
   * Format entries as a Markdown changelog string.
   */
  formatMarkdown(entries: ChangelogEntry[], version?: string, date?: string): string {
    const lines: string[] = [];

    if (version) {
      const dateStr = date ?? new Date().toISOString().slice(0, 10);
      lines.push(`## [${version}] - ${dateStr}`);
      lines.push('');
    }

    const grouped = this.groupByType(entries);

    // Breaking changes first
    const breaking = entries.filter(e => e.breaking);
    if (breaking.length > 0) {
      lines.push('### BREAKING CHANGES');
      lines.push('');
      for (const entry of breaking) {
        const scope = entry.scope ? `**${entry.scope}:** ` : '';
        lines.push(`- ${scope}${entry.description}`);
      }
      lines.push('');
    }

    for (const type of TYPE_ORDER) {
      const group = grouped.get(type);
      if (!group || group.length === 0) continue;

      const label = TYPE_LABELS[type] ?? type;
      lines.push(`### ${label}`);
      lines.push('');

      for (const entry of group) {
        const scope = entry.scope ? `**${entry.scope}:** ` : '';
        const hashRef = entry.hash ? ` (${entry.hash.slice(0, 7)})` : '';
        lines.push(`- ${scope}${entry.description}${hashRef}`);
      }
      lines.push('');
    }

    return lines.join('\n').trimEnd() + '\n';
  }

  /**
   * Format entries as structured JSON.
   */
  formatJSON(entries: ChangelogEntry[], version?: string, date?: string): string {
    const grouped = this.groupByType(entries);
    const result: Record<string, unknown> = {};

    if (version) {
      result['version'] = version;
      result['date'] = date ?? new Date().toISOString().slice(0, 10);
    }

    const sections: Record<string, unknown[]> = {};
    for (const type of TYPE_ORDER) {
      const group = grouped.get(type);
      if (!group || group.length === 0) continue;

      sections[type] = group.map(entry => ({
        scope: entry.scope ?? null,
        description: entry.description,
        hash: entry.hash ?? null,
        breaking: entry.breaking ?? false,
      }));
    }

    result['changes'] = sections;

    const breaking = entries.filter(e => e.breaking);
    if (breaking.length > 0) {
      result['breakingChanges'] = breaking.map(e => ({
        scope: e.scope ?? null,
        description: e.description,
      }));
    }

    return JSON.stringify(result, null, 2);
  }

  /**
   * Compare two semantic version strings.
   * Returns:
   *   -1 if v1 < v2
   *    0 if v1 === v2
   *    1 if v1 > v2
   */
  compareVersions(v1: string, v2: string): -1 | 0 | 1 {
    const parse = (v: string): number[] =>
      v.replace(/^v/, '').split('.').map(Number);

    const parts1 = parse(v1);
    const parts2 = parse(v2);
    const maxLen = Math.max(parts1.length, parts2.length);

    for (let i = 0; i < maxLen; i++) {
      const a = parts1[i] ?? 0;
      const b = parts2[i] ?? 0;
      if (a < b) return -1;
      if (a > b) return 1;
    }

    return 0;
  }

  /**
   * Generate a full changelog from multiple versions.
   */
  formatMultiVersionMarkdown(versions: ChangelogVersion[]): string {
    const sorted = [...versions].sort((a, b) =>
      this.compareVersions(b.version, a.version),
    );

    const header = `# Changelog

All notable changes to this project will be documented in this file.

This project adheres to [Conventional Commits](https://www.conventionalcommits.org/).

`;

    const body = sorted
      .map(v => this.formatMarkdown(v.entries, v.version, v.date))
      .join('\n');

    return header + body;
  }

  // ── Private Helpers ─────────────────────────────────────────────

  private groupByType(entries: ChangelogEntry[]): Map<string, ChangelogEntry[]> {
    const grouped = new Map<string, ChangelogEntry[]>();

    for (const entry of entries) {
      const type = entry.type;
      const list = grouped.get(type) ?? [];
      list.push(entry);
      grouped.set(type, list);
    }

    return grouped;
  }

  private normalizeType(type: string): ChangelogEntry['type'] {
    const valid = new Set(['feat', 'fix', 'perf', 'docs', 'refactor', 'test', 'chore']);
    return (valid.has(type) ? type : 'chore') as ChangelogEntry['type'];
  }
}
