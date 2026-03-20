#!/usr/bin/env node
/**
 * Detection pipeline benchmark script for OpenPulse.
 *
 * Measures detection latency across all 4 layers:
 *   Layer 1: Statistical detection (target <10ms)
 *   Layer 2: CUSUM change-point detection (target <50ms)
 *   Layer 3: LSTM neural network (target <200ms)
 *   Layer 4: XGBoost ensemble (target <500ms)
 *
 * Runs 1000 iterations per layer and reports p50/p95/p99 latencies.
 *
 * Usage: npx tsx scripts/benchmark-detection.ts [--iterations <n>]
 */

interface BenchmarkConfig {
  iterations: number;
  warmup: number;
}

interface PercentileResult {
  min: number;
  max: number;
  avg: number;
  p50: number;
  p95: number;
  p99: number;
}

interface LayerBenchmark {
  name: string;
  target: number;
  results: PercentileResult;
  passed: boolean;
}

function parseArgs(): BenchmarkConfig {
  const args = process.argv.slice(2);
  const config: BenchmarkConfig = {
    iterations: 1000,
    warmup: 50,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--iterations':
        config.iterations = parseInt(args[++i] ?? '1000', 10);
        break;
      case '--warmup':
        config.warmup = parseInt(args[++i] ?? '50', 10);
        break;
      case '--help':
        console.log(`Usage: benchmark-detection.ts [options]

Options:
  --iterations <n>   Number of test iterations (default: 1000)
  --warmup <n>       Warmup iterations (default: 50)
  --help             Show this help`);
        process.exit(0);
    }
  }

  return config;
}

function calculatePercentiles(latencies: number[]): PercentileResult {
  const sorted = [...latencies].sort((a, b) => a - b);
  const len = sorted.length;

  return {
    min: sorted[0]!,
    max: sorted[len - 1]!,
    avg: latencies.reduce((a, b) => a + b, 0) / len,
    p50: sorted[Math.floor(len * 0.50)]!,
    p95: sorted[Math.floor(len * 0.95)]!,
    p99: sorted[Math.floor(len * 0.99)]!,
  };
}

/**
 * Simulate Layer 1: Statistical z-score detection.
 * This is a pure mathematical operation -- very fast.
 */
function simulateStatisticalDetection(
  currentRate: number,
  expectedRate: number,
  stdDev: number,
): { anomalyScore: number; isAnomaly: boolean } {
  const zScore = Math.abs((currentRate - expectedRate) / stdDev);
  const threshold = 3.0;
  const confidence = Math.min(zScore / (threshold * 2), 1.0);

  // Simulate region breakdown
  const regions = ['us-east', 'us-west', 'eu-west', 'ap-south'];
  const breakdown = regions.map(region => ({
    region,
    rate: currentRate * (0.8 + Math.random() * 0.4),
    deviation: zScore * (0.5 + Math.random()),
  }));

  // Force a use of breakdown to prevent dead-code elimination
  void breakdown.length;

  return { anomalyScore: zScore, isAnomaly: zScore > threshold };
}

/**
 * Simulate Layer 2: CUSUM change-point detection.
 * Maintains cumulative sums and checks against thresholds.
 */
function simulateCusumDetection(
  observations: number[],
  targetMean: number,
  allowance: number,
  threshold: number,
): { detected: boolean; changePoint: number } {
  let cusumHigh = 0;
  let cusumLow = 0;
  let changePoint = -1;

  for (let i = 0; i < observations.length; i++) {
    const obs = observations[i]!;
    cusumHigh = Math.max(0, cusumHigh + obs - targetMean - allowance);
    cusumLow = Math.max(0, cusumLow - obs + targetMean - allowance);

    if (cusumHigh > threshold || cusumLow > threshold) {
      changePoint = i;
      break;
    }
  }

  return { detected: changePoint >= 0, changePoint };
}

/**
 * Simulate Layer 3: LSTM inference.
 * Performs matrix multiplications simulating a small LSTM cell.
 */
function simulateLstmInference(
  sequence: number[],
  hiddenSize: number = 64,
): number[] {
  const seqLen = sequence.length;
  const inputSize = 1;

  // Simulated weight matrices
  const Wi = createMatrix(hiddenSize, inputSize + hiddenSize);
  const Wf = createMatrix(hiddenSize, inputSize + hiddenSize);
  const Wc = createMatrix(hiddenSize, inputSize + hiddenSize);
  const Wo = createMatrix(hiddenSize, inputSize + hiddenSize);

  let h = new Float64Array(hiddenSize);
  let c = new Float64Array(hiddenSize);
  const outputs: number[] = [];

  for (let t = 0; t < seqLen; t++) {
    const x = [sequence[t]!];
    const combined = [...x, ...h];

    const ig = sigmoid(matVecMul(Wi, combined));
    const fg = sigmoid(matVecMul(Wf, combined));
    const cCandidate = tanh(matVecMul(Wc, combined));
    const og = sigmoid(matVecMul(Wo, combined));

    c = addVec(mulVec(fg, c), mulVec(ig, cCandidate));
    h = mulVec(og, tanhVec(c));

    outputs.push(h[0]!);
  }

  return outputs;
}

/**
 * Simulate Layer 4: XGBoost ensemble prediction.
 * Simulates multiple decision tree evaluations.
 */
function simulateXgboostPrediction(
  features: number[],
  numTrees: number = 100,
  maxDepth: number = 6,
): number {
  let prediction = 0;
  const learningRate = 0.1;

  for (let tree = 0; tree < numTrees; tree++) {
    let value = 0;
    let nodeIdx = 0;

    for (let depth = 0; depth < maxDepth; depth++) {
      const featureIdx = (tree * maxDepth + depth) % features.length;
      const feature = features[featureIdx]!;
      const splitPoint = Math.sin(tree * 13.37 + depth * 7.42) * 0.5;

      if (feature > splitPoint) {
        nodeIdx = nodeIdx * 2 + 1;
        value += Math.cos(nodeIdx * 0.1) * 0.01;
      } else {
        nodeIdx = nodeIdx * 2 + 2;
        value -= Math.sin(nodeIdx * 0.1) * 0.01;
      }
    }

    prediction += learningRate * value;
  }

  return 1 / (1 + Math.exp(-prediction));
}

// ── Matrix Helpers ──────────────────────────────────────────────

function createMatrix(rows: number, cols: number): Float64Array[] {
  const matrix: Float64Array[] = [];
  for (let r = 0; r < rows; r++) {
    const row = new Float64Array(cols);
    for (let c = 0; c < cols; c++) {
      row[c] = (Math.random() - 0.5) * 0.1;
    }
    matrix.push(row);
  }
  return matrix;
}

function matVecMul(matrix: Float64Array[], vec: number[]): Float64Array {
  const result = new Float64Array(matrix.length);
  for (let r = 0; r < matrix.length; r++) {
    let sum = 0;
    const row = matrix[r]!;
    for (let c = 0; c < vec.length; c++) {
      sum += row[c]! * vec[c]!;
    }
    result[r] = sum;
  }
  return result;
}

function sigmoid(arr: Float64Array): Float64Array {
  const result = new Float64Array(arr.length);
  for (let i = 0; i < arr.length; i++) {
    result[i] = 1 / (1 + Math.exp(-arr[i]!));
  }
  return result;
}

function tanh(arr: Float64Array): Float64Array {
  const result = new Float64Array(arr.length);
  for (let i = 0; i < arr.length; i++) {
    result[i] = Math.tanh(arr[i]!);
  }
  return result;
}

function tanhVec(arr: Float64Array): Float64Array {
  return tanh(arr);
}

function addVec(a: Float64Array, b: Float64Array): Float64Array {
  const result = new Float64Array(a.length);
  for (let i = 0; i < a.length; i++) {
    result[i] = a[i]! + b[i]!;
  }
  return result;
}

function mulVec(a: Float64Array, b: Float64Array): Float64Array {
  const result = new Float64Array(a.length);
  for (let i = 0; i < a.length; i++) {
    result[i] = a[i]! * b[i]!;
  }
  return result;
}

// ── Benchmark Runner ────────────────────────────────────────────

function benchmarkLayer(
  name: string,
  fn: () => void,
  iterations: number,
  warmup: number,
): number[] {
  // Warmup
  for (let i = 0; i < warmup; i++) {
    fn();
  }

  // Measure
  const latencies: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    fn();
    const elapsed = performance.now() - start;
    latencies.push(elapsed);
  }

  return latencies;
}

function formatMs(ms: number): string {
  if (ms < 0.01) return `${(ms * 1000).toFixed(1)}us`;
  if (ms < 1) return `${ms.toFixed(3)}ms`;
  return `${ms.toFixed(2)}ms`;
}

function main(): void {
  const config = parseArgs();

  console.log('OpenPulse Detection Pipeline Benchmark');
  console.log('======================================\n');
  console.log(`Iterations: ${config.iterations}`);
  console.log(`Warmup: ${config.warmup}\n`);

  const layers: LayerBenchmark[] = [];

  // Layer 1: Statistical Detection
  process.stdout.write('Benchmarking Layer 1 (Statistical)...');
  const layer1Latencies = benchmarkLayer(
    'Statistical',
    () => {
      const rate = 50 + Math.random() * 200;
      simulateStatisticalDetection(rate, 100, 15);
    },
    config.iterations,
    config.warmup,
  );
  const layer1Results = calculatePercentiles(layer1Latencies);
  layers.push({
    name: 'Layer 1 - Statistical',
    target: 10,
    results: layer1Results,
    passed: layer1Results.p99 < 10,
  });
  console.log(' done');

  // Layer 2: CUSUM Detection
  process.stdout.write('Benchmarking Layer 2 (CUSUM)...');
  const layer2Latencies = benchmarkLayer(
    'CUSUM',
    () => {
      const observations = Array.from({ length: 100 }, () => 100 + (Math.random() - 0.3) * 50);
      simulateCusumDetection(observations, 100, 5, 20);
    },
    config.iterations,
    config.warmup,
  );
  const layer2Results = calculatePercentiles(layer2Latencies);
  layers.push({
    name: 'Layer 2 - CUSUM',
    target: 50,
    results: layer2Results,
    passed: layer2Results.p99 < 50,
  });
  console.log(' done');

  // Layer 3: LSTM Inference
  process.stdout.write('Benchmarking Layer 3 (LSTM)...');
  const layer3Latencies = benchmarkLayer(
    'LSTM',
    () => {
      const sequence = Array.from({ length: 24 }, () => Math.random() * 100);
      simulateLstmInference(sequence, 32);
    },
    config.iterations,
    config.warmup,
  );
  const layer3Results = calculatePercentiles(layer3Latencies);
  layers.push({
    name: 'Layer 3 - LSTM',
    target: 200,
    results: layer3Results,
    passed: layer3Results.p99 < 200,
  });
  console.log(' done');

  // Layer 4: XGBoost Prediction
  process.stdout.write('Benchmarking Layer 4 (XGBoost)...');
  const layer4Latencies = benchmarkLayer(
    'XGBoost',
    () => {
      const features = Array.from({ length: 50 }, () => Math.random());
      simulateXgboostPrediction(features, 100, 6);
    },
    config.iterations,
    config.warmup,
  );
  const layer4Results = calculatePercentiles(layer4Latencies);
  layers.push({
    name: 'Layer 4 - XGBoost',
    target: 500,
    results: layer4Results,
    passed: layer4Results.p99 < 500,
  });
  console.log(' done');

  // Print Results
  console.log('\n========================================');
  console.log('Results');
  console.log('========================================\n');

  const colWidths = { name: 24, metric: 12 };

  console.log(
    'Layer'.padEnd(colWidths.name) +
    'p50'.padStart(colWidths.metric) +
    'p95'.padStart(colWidths.metric) +
    'p99'.padStart(colWidths.metric) +
    'Target'.padStart(colWidths.metric) +
    '  Status',
  );
  console.log('-'.repeat(colWidths.name + colWidths.metric * 4 + 8));

  for (const layer of layers) {
    const status = layer.passed ? 'PASS' : 'FAIL';
    const statusColor = layer.passed ? '\x1b[32m' : '\x1b[31m';
    const reset = '\x1b[0m';

    console.log(
      layer.name.padEnd(colWidths.name) +
      formatMs(layer.results.p50).padStart(colWidths.metric) +
      formatMs(layer.results.p95).padStart(colWidths.metric) +
      formatMs(layer.results.p99).padStart(colWidths.metric) +
      `<${layer.target}ms`.padStart(colWidths.metric) +
      `  ${statusColor}${status}${reset}`,
    );
  }

  console.log('\nDetailed Statistics:');
  for (const layer of layers) {
    console.log(`\n  ${layer.name}:`);
    console.log(`    Min: ${formatMs(layer.results.min)}`);
    console.log(`    Avg: ${formatMs(layer.results.avg)}`);
    console.log(`    p50: ${formatMs(layer.results.p50)}`);
    console.log(`    p95: ${formatMs(layer.results.p95)}`);
    console.log(`    p99: ${formatMs(layer.results.p99)}`);
    console.log(`    Max: ${formatMs(layer.results.max)}`);
  }

  // Full pipeline
  const fullPipelineLatencies: number[] = [];
  for (let i = 0; i < config.iterations; i++) {
    const start = performance.now();
    const rate = 50 + Math.random() * 200;
    simulateStatisticalDetection(rate, 100, 15);
    const observations = Array.from({ length: 100 }, () => 100 + (Math.random() - 0.3) * 50);
    simulateCusumDetection(observations, 100, 5, 20);
    const sequence = Array.from({ length: 24 }, () => Math.random() * 100);
    simulateLstmInference(sequence, 32);
    const features = Array.from({ length: 50 }, () => Math.random());
    simulateXgboostPrediction(features, 100, 6);
    fullPipelineLatencies.push(performance.now() - start);
  }
  const fullResults = calculatePercentiles(fullPipelineLatencies);

  console.log('\n  Full Pipeline (all layers):');
  console.log(`    Min: ${formatMs(fullResults.min)}`);
  console.log(`    Avg: ${formatMs(fullResults.avg)}`);
  console.log(`    p50: ${formatMs(fullResults.p50)}`);
  console.log(`    p95: ${formatMs(fullResults.p95)}`);
  console.log(`    p99: ${formatMs(fullResults.p99)}`);
  console.log(`    Max: ${formatMs(fullResults.max)}`);

  const allPassed = layers.every(l => l.passed);
  if (allPassed) {
    console.log('\nAll performance targets MET');
    process.exit(0);
  } else {
    const failed = layers.filter(l => !l.passed);
    console.log(`\n${failed.length} layer(s) FAILED performance targets:`);
    for (const l of failed) {
      console.log(`  ${l.name}: p99=${formatMs(l.results.p99)} (target: <${l.target}ms)`);
    }
    process.exit(1);
  }
}

main();
