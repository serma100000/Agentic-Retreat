import { describe, expect, it, beforeEach } from 'vitest';
import { ChangelogGenerator } from '../changelog-generator.js';

describe('ChangelogGenerator', () => {
  let generator: ChangelogGenerator;

  beforeEach(() => {
    generator = new ChangelogGenerator();
  });

  describe('parseCommit', () => {
    it('parses a simple conventional commit', () => {
      const result = generator.parseCommit('feat: add login page');
      expect(result).not.toBeNull();
      expect(result!.type).toBe('feat');
      expect(result!.description).toBe('add login page');
      expect(result!.scope).toBeUndefined();
      expect(result!.breaking).toBe(false);
    });

    it('parses a scoped commit', () => {
      const result = generator.parseCommit('fix(auth): handle expired tokens');
      expect(result).not.toBeNull();
      expect(result!.type).toBe('fix');
      expect(result!.scope).toBe('auth');
      expect(result!.description).toBe('handle expired tokens');
    });

    it('parses a commit with hash and date prefix', () => {
      const result = generator.parseCommit('abc1234 2025-01-15 feat(api): add rate limiting');
      expect(result).not.toBeNull();
      expect(result!.hash).toBe('abc1234');
      expect(result!.date).toBe('2025-01-15');
      expect(result!.type).toBe('feat');
      expect(result!.scope).toBe('api');
    });

    it('detects breaking changes', () => {
      const result = generator.parseCommit('feat(api)!: remove deprecated endpoints');
      expect(result).not.toBeNull();
      expect(result!.breaking).toBe(true);
    });

    it('returns null for non-conventional messages', () => {
      expect(generator.parseCommit('random commit message')).toBeNull();
      expect(generator.parseCommit('')).toBeNull();
      expect(generator.parseCommit('  ')).toBeNull();
    });
  });

  describe('generateFromCommits', () => {
    it('parses multiple commits and groups by type', () => {
      const commits = [
        'abc1234 2025-01-15 feat(auth): add OAuth support',
        'def5678 2025-01-14 fix(api): handle null responses',
        'ghi9012 2025-01-13 feat(ws): add WebSocket reconnection',
        'jkl3456 2025-01-12 perf(db): optimize query performance',
        'not a conventional commit',
        'mno7890 2025-01-11 docs: update API documentation',
      ];

      const entries = generator.generateFromCommits(commits);
      expect(entries).toHaveLength(5);

      const feats = entries.filter(e => e.type === 'feat');
      expect(feats).toHaveLength(2);

      const fixes = entries.filter(e => e.type === 'fix');
      expect(fixes).toHaveLength(1);

      const perfs = entries.filter(e => e.type === 'perf');
      expect(perfs).toHaveLength(1);

      const docs = entries.filter(e => e.type === 'docs');
      expect(docs).toHaveLength(1);
    });

    it('skips invalid commits', () => {
      const commits = [
        'not valid',
        '',
        'also not valid format',
        'feat: valid one',
      ];

      const entries = generator.generateFromCommits(commits);
      expect(entries).toHaveLength(1);
      expect(entries[0]!.description).toBe('valid one');
    });
  });

  describe('formatMarkdown', () => {
    it('formats entries as grouped Markdown', () => {
      const entries = generator.generateFromCommits([
        'abc1234 2025-01-15 feat(auth): add OAuth support',
        'def5678 2025-01-14 fix(api): handle null responses',
        'ghi9012 2025-01-13 feat(ws): add WebSocket reconnection',
      ]);

      const md = generator.formatMarkdown(entries, '1.0.0', '2025-01-15');

      expect(md).toContain('## [1.0.0] - 2025-01-15');
      expect(md).toContain('### Features');
      expect(md).toContain('### Bug Fixes');
      expect(md).toContain('**auth:** add OAuth support');
      expect(md).toContain('**api:** handle null responses');
      expect(md).toContain('**ws:** add WebSocket reconnection');
    });

    it('includes breaking changes section when present', () => {
      const entries = generator.generateFromCommits([
        'feat(api)!: remove deprecated endpoints',
        'feat: add new feature',
      ]);

      const md = generator.formatMarkdown(entries);

      expect(md).toContain('### BREAKING CHANGES');
      expect(md).toContain('remove deprecated endpoints');
    });

    it('includes commit hashes when available', () => {
      const entries = generator.generateFromCommits([
        'abc1234 2025-01-15 feat: add feature',
      ]);

      const md = generator.formatMarkdown(entries);
      expect(md).toContain('(abc1234)');
    });
  });

  describe('formatJSON', () => {
    it('produces valid JSON with version info', () => {
      const entries = generator.generateFromCommits([
        'feat(auth): add OAuth support',
        'fix(api): handle null responses',
      ]);

      const jsonStr = generator.formatJSON(entries, '1.0.0', '2025-01-15');
      const parsed = JSON.parse(jsonStr);

      expect(parsed.version).toBe('1.0.0');
      expect(parsed.date).toBe('2025-01-15');
      expect(parsed.changes).toBeDefined();
      expect(parsed.changes.feat).toHaveLength(1);
      expect(parsed.changes.fix).toHaveLength(1);
    });

    it('includes breaking changes in JSON output', () => {
      const entries = generator.generateFromCommits([
        'feat(api)!: remove deprecated endpoints',
      ]);

      const jsonStr = generator.formatJSON(entries);
      const parsed = JSON.parse(jsonStr);

      expect(parsed.breakingChanges).toBeDefined();
      expect(parsed.breakingChanges).toHaveLength(1);
      expect(parsed.breakingChanges[0].description).toBe('remove deprecated endpoints');
    });
  });

  describe('compareVersions', () => {
    it('correctly compares equal versions', () => {
      expect(generator.compareVersions('1.0.0', '1.0.0')).toBe(0);
      expect(generator.compareVersions('v1.0.0', 'v1.0.0')).toBe(0);
    });

    it('correctly compares different major versions', () => {
      expect(generator.compareVersions('2.0.0', '1.0.0')).toBe(1);
      expect(generator.compareVersions('1.0.0', '2.0.0')).toBe(-1);
    });

    it('correctly compares different minor versions', () => {
      expect(generator.compareVersions('1.2.0', '1.1.0')).toBe(1);
      expect(generator.compareVersions('1.1.0', '1.2.0')).toBe(-1);
    });

    it('correctly compares different patch versions', () => {
      expect(generator.compareVersions('1.0.2', '1.0.1')).toBe(1);
      expect(generator.compareVersions('1.0.1', '1.0.2')).toBe(-1);
    });

    it('handles versions with v prefix', () => {
      expect(generator.compareVersions('v2.0.0', 'v1.5.0')).toBe(1);
      expect(generator.compareVersions('v1.0.0', 'v2.0.0')).toBe(-1);
    });

    it('handles versions with different segment counts', () => {
      expect(generator.compareVersions('1.0', '1.0.0')).toBe(0);
      expect(generator.compareVersions('1.0.1', '1.0')).toBe(1);
    });
  });

  describe('formatMultiVersionMarkdown', () => {
    it('produces a full changelog with header and versions', () => {
      const versions = [
        {
          version: '1.0.0',
          date: '2025-01-01',
          entries: generator.generateFromCommits([
            'feat: initial release',
          ]),
        },
        {
          version: '1.1.0',
          date: '2025-01-15',
          entries: generator.generateFromCommits([
            'feat(auth): add OAuth',
            'fix(api): handle errors',
          ]),
        },
      ];

      const md = generator.formatMultiVersionMarkdown(versions);

      expect(md).toContain('# Changelog');
      expect(md).toContain('## [1.1.0] - 2025-01-15');
      expect(md).toContain('## [1.0.0] - 2025-01-01');
      // 1.1.0 should appear before 1.0.0 (newest first)
      const idx110 = md.indexOf('[1.1.0]');
      const idx100 = md.indexOf('[1.0.0]');
      expect(idx110).toBeLessThan(idx100);
    });
  });
});
