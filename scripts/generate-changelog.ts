#!/usr/bin/env node
/**
 * Script to generate CHANGELOG.md from git commit history.
 *
 * Reads the git log, parses conventional commits, and writes
 * a formatted CHANGELOG.md file to the project root.
 *
 * Usage: npx tsx scripts/generate-changelog.ts [--version <version>] [--since <tag>]
 */

import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { ChangelogGenerator } from '../src/docs/changelog-generator.js';

interface CliArgs {
  version: string;
  since: string;
  output: string;
  format: 'markdown' | 'json';
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const result: CliArgs = {
    version: '0.1.0',
    since: '',
    output: 'CHANGELOG.md',
    format: 'markdown',
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--version':
        result.version = args[++i] ?? result.version;
        break;
      case '--since':
        result.since = args[++i] ?? '';
        break;
      case '--output':
        result.output = args[++i] ?? result.output;
        break;
      case '--format':
        result.format = (args[++i] as 'markdown' | 'json') ?? 'markdown';
        break;
      case '--help':
        console.log(`Usage: generate-changelog.ts [options]

Options:
  --version <ver>    Version string (default: 0.1.0)
  --since <tag>      Only include commits since this tag
  --output <file>    Output file path (default: CHANGELOG.md)
  --format <fmt>     Output format: markdown or json (default: markdown)
  --help             Show this help`);
        process.exit(0);
    }
  }

  return result;
}

function getGitLog(since: string): string[] {
  const sinceArg = since ? `${since}..HEAD` : '';
  const format = '--format=%H %ai %s';

  try {
    const output = execSync(
      `git log ${sinceArg} ${format}`.trim(),
      { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 },
    );
    return output.trim().split('\n').filter(Boolean);
  } catch {
    console.warn('Warning: Could not read git log. Using empty commit list.');
    return [];
  }
}

function formatCommitLine(raw: string): string {
  // Git log format: full_hash date time tz message
  // e.g. "abc123def456 2025-01-15 10:30:00 -0500 feat: add feature"
  const match = /^([a-f0-9]+)\s+(\d{4}-\d{2}-\d{2})\s+\S+\s+\S+\s+(.+)$/.exec(raw);
  if (match) {
    const shortHash = match[1]!.slice(0, 7);
    return `${shortHash} ${match[2]} ${match[3]}`;
  }
  return raw;
}

function main(): void {
  const args = parseArgs();
  const projectRoot = dirname(dirname(new URL(import.meta.url).pathname));
  const outputPath = join(projectRoot, args.output);

  console.log(`Generating changelog...`);
  console.log(`  Version: ${args.version}`);
  if (args.since) console.log(`  Since: ${args.since}`);

  const rawCommits = getGitLog(args.since);
  console.log(`  Found ${rawCommits.length} commits`);

  const formattedCommits = rawCommits.map(formatCommitLine);
  const generator = new ChangelogGenerator();
  const entries = generator.generateFromCommits(formattedCommits);
  const date = new Date().toISOString().slice(0, 10);

  console.log(`  Parsed ${entries.length} conventional commits`);

  if (entries.length === 0) {
    console.log('  No conventional commits found. Generating minimal changelog.');
  }

  const featCount = entries.filter(e => e.type === 'feat').length;
  const fixCount = entries.filter(e => e.type === 'fix').length;
  const perfCount = entries.filter(e => e.type === 'perf').length;
  const docsCount = entries.filter(e => e.type === 'docs').length;
  const otherCount = entries.length - featCount - fixCount - perfCount - docsCount;

  console.log(`  Breakdown: ${featCount} features, ${fixCount} fixes, ${perfCount} perf, ${docsCount} docs, ${otherCount} other`);

  let content: string;

  if (args.format === 'json') {
    content = generator.formatJSON(entries, args.version, date);
  } else {
    content = generator.formatMultiVersionMarkdown([
      { version: args.version, date, entries },
    ]);
  }

  writeFileSync(outputPath, content, 'utf-8');
  console.log(`\nChangelog written to: ${outputPath}`);
}

main();
