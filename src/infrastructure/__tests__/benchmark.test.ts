import { describe, expect, it } from 'vitest';
import { Benchmark } from '../benchmark.js';

describe('Benchmark', () => {
  const bench = new Benchmark();

  it('runs the specified number of iterations', async () => {
    let count = 0;
    const result = await bench.run(
      'counter',
      async () => { count++; },
      { iterations: 50, warmup: 5 },
    );

    // warmup + iterations
    expect(count).toBe(55);
    expect(result.samples).toBe(50);
  });

  it('produces valid statistics', async () => {
    const result = await bench.run(
      'noop',
      async () => {},
      { iterations: 100, warmup: 10 },
    );

    expect(result.name).toBe('noop');
    expect(result.operation).toBe('noop');
    expect(result.opsPerSec).toBeGreaterThan(0);
    expect(result.avgLatencyMs).toBeGreaterThanOrEqual(0);
    expect(result.p50).toBeGreaterThanOrEqual(0);
    expect(result.p95).toBeGreaterThanOrEqual(result.p50);
    expect(result.p99).toBeGreaterThanOrEqual(result.p95);
    expect(result.maxLatency).toBeGreaterThanOrEqual(result.p99);
    expect(result.samples).toBe(100);
  });

  it('detects regression when current is slower', () => {
    const baseline = {
      name: 'test', operation: 'test',
      opsPerSec: 1000, avgLatencyMs: 1.0,
      p50: 0.9, p95: 1.5, p99: 2.0, maxLatency: 3.0, samples: 100,
    };
    const current = {
      name: 'test', operation: 'test',
      opsPerSec: 800, avgLatencyMs: 1.25,
      p50: 1.1, p95: 1.8, p99: 2.5, maxLatency: 4.0, samples: 100,
    };

    const comparison = bench.compare(baseline, current);
    expect(comparison.regression).toBe(true);
    expect(comparison.improvement).toBe(false);
    expect(comparison.delta).toBeGreaterThan(0);
  });

  it('detects improvement when current is faster', () => {
    const baseline = {
      name: 'test', operation: 'test',
      opsPerSec: 1000, avgLatencyMs: 1.0,
      p50: 0.9, p95: 1.5, p99: 2.0, maxLatency: 3.0, samples: 100,
    };
    const current = {
      name: 'test', operation: 'test',
      opsPerSec: 1500, avgLatencyMs: 0.5,
      p50: 0.4, p95: 0.8, p99: 1.0, maxLatency: 1.5, samples: 100,
    };

    const comparison = bench.compare(baseline, current);
    expect(comparison.regression).toBe(false);
    expect(comparison.improvement).toBe(true);
    expect(comparison.delta).toBeLessThan(0);
  });

  it('formats a readable report', async () => {
    const results = await bench.runSuite([
      { name: 'fast-op', fn: async () => {}, options: { iterations: 10, warmup: 2 } },
      { name: 'slow-op', fn: async () => {
        await new Promise((r) => setTimeout(r, 1));
      }, options: { iterations: 5, warmup: 1 } },
    ]);

    const report = bench.formatReport(results);

    expect(report).toContain('fast-op');
    expect(report).toContain('slow-op');
    expect(report).toContain('ops/s');
    expect(report).toContain('avg(ms)');
    expect(report).toContain('p50(ms)');
    expect(report).toContain('p95(ms)');
    expect(report).toContain('p99(ms)');
    expect(report.split('\n').length).toBeGreaterThanOrEqual(5);
  });

  it('runSuite executes all benchmarks', async () => {
    let aRan = false;
    let bRan = false;

    const results = await bench.runSuite([
      { name: 'a', fn: async () => { aRan = true; }, options: { iterations: 1, warmup: 0 } },
      { name: 'b', fn: async () => { bRan = true; }, options: { iterations: 1, warmup: 0 } },
    ]);

    expect(aRan).toBe(true);
    expect(bRan).toBe(true);
    expect(results).toHaveLength(2);
    expect(results[0]!.name).toBe('a');
    expect(results[1]!.name).toBe('b');
  });
});
