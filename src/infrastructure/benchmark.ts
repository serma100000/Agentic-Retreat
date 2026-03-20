/**
 * Performance benchmarking suite for OpenPulse.
 *
 * Runs measured iterations with warmup, computing
 * ops/sec, avg, p50, p95, p99, and max latency.
 */

import type { BenchmarkComparison, BenchmarkOptions, BenchmarkResult } from './types.js';

export class Benchmark {
  async run(
    name: string,
    fn: () => Promise<void>,
    options: BenchmarkOptions = { iterations: 1000, warmup: 100 },
  ): Promise<BenchmarkResult> {
    // Warmup phase
    for (let i = 0; i < options.warmup; i++) {
      await fn();
    }

    // Measured phase
    const durations: number[] = [];
    for (let i = 0; i < options.iterations; i++) {
      const start = performance.now();
      await fn();
      const elapsed = performance.now() - start;
      durations.push(elapsed);
    }

    return this.computeResult(name, durations);
  }

  async runSuite(
    benchmarks: { name: string; fn: () => Promise<void>; options?: BenchmarkOptions }[],
  ): Promise<BenchmarkResult[]> {
    const results: BenchmarkResult[] = [];
    for (const bench of benchmarks) {
      const result = await this.run(bench.name, bench.fn, bench.options);
      results.push(result);
    }
    return results;
  }

  compare(
    baseline: BenchmarkResult,
    current: BenchmarkResult,
  ): BenchmarkComparison {
    const delta =
      ((current.avgLatencyMs - baseline.avgLatencyMs) / baseline.avgLatencyMs) * 100;

    return {
      regression: delta > 10,
      improvement: delta < -10,
      delta: Math.round(delta * 100) / 100,
    };
  }

  formatReport(results: BenchmarkResult[]): string {
    const header = [
      'Name'.padEnd(30),
      'ops/s'.padStart(12),
      'avg(ms)'.padStart(10),
      'p50(ms)'.padStart(10),
      'p95(ms)'.padStart(10),
      'p99(ms)'.padStart(10),
      'max(ms)'.padStart(10),
      'samples'.padStart(10),
    ].join(' | ');

    const separator = '-'.repeat(header.length);

    const rows = results.map((r) =>
      [
        r.name.padEnd(30),
        r.opsPerSec.toFixed(0).padStart(12),
        r.avgLatencyMs.toFixed(3).padStart(10),
        r.p50.toFixed(3).padStart(10),
        r.p95.toFixed(3).padStart(10),
        r.p99.toFixed(3).padStart(10),
        r.maxLatency.toFixed(3).padStart(10),
        String(r.samples).padStart(10),
      ].join(' | '),
    );

    return [separator, header, separator, ...rows, separator].join('\n');
  }

  private computeResult(name: string, durations: number[]): BenchmarkResult {
    const sorted = [...durations].sort((a, b) => a - b);
    const count = sorted.length;

    const sum = sorted.reduce((acc, d) => acc + d, 0);
    const avg = sum / count;

    return {
      name,
      operation: name,
      opsPerSec: Math.round(1000 / avg),
      avgLatencyMs: Math.round(avg * 1000) / 1000,
      p50: this.percentile(sorted, 50),
      p95: this.percentile(sorted, 95),
      p99: this.percentile(sorted, 99),
      maxLatency: Math.round(sorted[count - 1]! * 1000) / 1000,
      samples: count,
    };
  }

  private percentile(sorted: number[], p: number): number {
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    const value = sorted[Math.max(0, index)]!;
    return Math.round(value * 1000) / 1000;
  }
}
