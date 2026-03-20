/**
 * Root Vitest configuration with workspace support.
 *
 * Runs tests across the monorepo:
 * - tests/unit/**       -> unit tests (fast, no I/O)
 * - tests/integration/** -> integration tests (mocked infra)
 * - tests/e2e/**        -> end-to-end smoke tests
 * - apps/prober/**      -> prober package tests
 */

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    include: [
      'tests/**/*.test.ts',
      'apps/*/src/**/*.test.ts',
      'src/**/*.test.ts',
    ],
    exclude: [
      'node_modules',
      'dist',
      'RuVector/**',
    ],
    testTimeout: 30_000,
    hookTimeout: 15_000,
    pool: 'forks',
    poolOptions: {
      forks: {
        maxForks: 4,
      },
    },
    coverage: {
      provider: 'v8',
      include: [
        'src/**/*.ts',
        'apps/prober/src/**/*.ts',
      ],
      exclude: [
        '**/*.test.ts',
        '**/*.spec.ts',
        '**/types.ts',
        '**/index.ts',
      ],
      thresholds: {
        statements: 60,
        branches: 50,
        functions: 60,
        lines: 60,
      },
    },
    reporters: ['verbose'],
    passWithNoTests: true,
  },
});
