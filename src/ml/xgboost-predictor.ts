/**
 * Simplified gradient-boosted decision tree predictor (Layer 4).
 * Predicts probability of outage at 5min, 15min, and 60min horizons.
 */

import type { XGBoostPrediction } from './types.js';

interface SplitNode {
  type: 'split';
  featureName: string;
  threshold: number;
  left: TreeNode;
  right: TreeNode;
}

interface LeafNode {
  type: 'leaf';
  value: number;
}

type TreeNode = SplitNode | LeafNode;

export class DecisionTree {
  private root: TreeNode | null = null;
  private maxDepth: number;

  constructor(maxDepth = 3) {
    this.maxDepth = maxDepth;
  }

  /**
   * Train a decision tree using greedy recursive splitting.
   */
  train(
    data: { features: Record<string, number>; label: number }[],
    depth = 0,
  ): void {
    this.root = this.buildTree(data, depth);
  }

  private buildTree(
    data: { features: Record<string, number>; label: number }[],
    depth: number,
  ): TreeNode {
    if (data.length === 0) {
      return { type: 'leaf', value: 0 };
    }

    const mean = data.reduce((sum, d) => sum + d.label, 0) / data.length;

    // Stop conditions
    if (depth >= this.maxDepth || data.length < 4) {
      return { type: 'leaf', value: mean };
    }

    // Check if all labels are the same
    const allSame = data.every(d => Math.abs(d.label - data[0]!.label) < 1e-10);
    if (allSame) {
      return { type: 'leaf', value: mean };
    }

    // Find best split
    const featureNames = Object.keys(data[0]!.features);
    let bestGain = -Infinity;
    let bestFeature = '';
    let bestThreshold = 0;

    for (const featureName of featureNames) {
      // Get unique values for this feature
      const values = Array.from(new Set(data.map(d => d.features[featureName] ?? 0))).sort((a, b) => a - b);

      for (let i = 0; i < values.length - 1; i++) {
        const threshold = (values[i]! + values[i + 1]!) / 2;

        const left = data.filter(d => (d.features[featureName] ?? 0) <= threshold);
        const right = data.filter(d => (d.features[featureName] ?? 0) > threshold);

        if (left.length === 0 || right.length === 0) continue;

        const gain = this.computeGain(data, left, right);
        if (gain > bestGain) {
          bestGain = gain;
          bestFeature = featureName;
          bestThreshold = threshold;
        }
      }
    }

    if (bestGain <= 0) {
      return { type: 'leaf', value: mean };
    }

    const leftData = data.filter(d => (d.features[bestFeature] ?? 0) <= bestThreshold);
    const rightData = data.filter(d => (d.features[bestFeature] ?? 0) > bestThreshold);

    return {
      type: 'split',
      featureName: bestFeature,
      threshold: bestThreshold,
      left: this.buildTree(leftData, depth + 1),
      right: this.buildTree(rightData, depth + 1),
    };
  }

  /**
   * Compute variance reduction gain for a split.
   */
  private computeGain(
    parent: { label: number }[],
    left: { label: number }[],
    right: { label: number }[],
  ): number {
    const parentVar = this.variance(parent.map(d => d.label));
    const leftVar = this.variance(left.map(d => d.label));
    const rightVar = this.variance(right.map(d => d.label));

    const n = parent.length;
    const weightedChildVar = (left.length / n) * leftVar + (right.length / n) * rightVar;

    return parentVar - weightedChildVar;
  }

  private variance(values: number[]): number {
    if (values.length === 0) return 0;
    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    return values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  }

  /**
   * Predict a value for the given features.
   */
  predict(features: Record<string, number>): number {
    if (!this.root) return 0;
    return this.predictNode(this.root, features);
  }

  private predictNode(node: TreeNode, features: Record<string, number>): number {
    if (node.type === 'leaf') return node.value;
    const featureValue = features[node.featureName] ?? 0;
    if (featureValue <= node.threshold) {
      return this.predictNode(node.left, features);
    }
    return this.predictNode(node.right, features);
  }

  /**
   * Serialize the tree.
   */
  toJSON(): TreeNode | null {
    return this.root;
  }

  /**
   * Deserialize the tree.
   */
  fromJSON(node: TreeNode | null): void {
    this.root = node;
  }
}

/**
 * Gradient-boosted ensemble of decision trees.
 */
export class XGBoostPredictor {
  private trees5min: DecisionTree[] = [];
  private trees15min: DecisionTree[] = [];
  private trees60min: DecisionTree[] = [];

  private readonly numTrees: number;
  private readonly maxDepth: number;
  private readonly learningRate: number;
  private readonly baseScore: number;

  private trained = false;

  constructor(config?: {
    numTrees?: number;
    maxDepth?: number;
    learningRate?: number;
    baseScore?: number;
  }) {
    this.numTrees = config?.numTrees ?? 10;
    this.maxDepth = config?.maxDepth ?? 3;
    this.learningRate = config?.learningRate ?? 0.1;
    this.baseScore = config?.baseScore ?? 0.5;
  }

  /**
   * Predict outage probabilities at 5min, 15min, and 60min horizons.
   */
  predict(features: Record<string, number>): XGBoostPrediction {
    if (!this.trained) {
      // Return a heuristic-based prediction when not trained
      return this.heuristicPredict(features);
    }

    const probability5min = this.clamp(this.predictEnsemble(this.trees5min, features));
    const probability15min = this.clamp(this.predictEnsemble(this.trees15min, features));
    const probability60min = this.clamp(this.predictEnsemble(this.trees60min, features));

    return { probability5min, probability15min, probability60min, features };
  }

  /**
   * Train the ensemble on labeled data.
   * Labels should be boolean (true = outage occurred).
   * For different horizons, the caller should provide appropriately labeled data.
   */
  train(data: { features: Record<string, number>; label: boolean }[]): void {
    if (data.length === 0) return;

    const numericData = data.map(d => ({
      features: d.features,
      label: d.label ? 1 : 0,
    }));

    // Train separate ensembles for each horizon
    // In practice, labels would differ per horizon; here we use the same data
    // with adjusted weights to simulate different time horizons.
    this.trees5min = this.trainEnsemble(numericData, 1.0);
    this.trees15min = this.trainEnsemble(numericData, 0.8);
    this.trees60min = this.trainEnsemble(numericData, 0.5);

    this.trained = true;
  }

  /**
   * Gradient boosting training loop.
   */
  private trainEnsemble(
    data: { features: Record<string, number>; label: number }[],
    horizonWeight: number,
  ): DecisionTree[] {
    const trees: DecisionTree[] = [];

    // Initialize predictions to base score
    const predictions = new Array<number>(data.length).fill(this.baseScore);

    for (let t = 0; t < this.numTrees; t++) {
      // Compute residuals (negative gradient of log loss)
      const residuals = data.map((d, i) => ({
        features: d.features,
        label: (d.label * horizonWeight - this.sigmoid(predictions[i]!)) * horizonWeight,
      }));

      // Fit a tree to the residuals
      const tree = new DecisionTree(this.maxDepth);
      tree.train(residuals);
      trees.push(tree);

      // Update predictions
      for (let i = 0; i < data.length; i++) {
        predictions[i] =
          predictions[i]! + this.learningRate * tree.predict(data[i]!.features);
      }
    }

    return trees;
  }

  /**
   * Sum predictions from an ensemble.
   */
  private predictEnsemble(trees: DecisionTree[], features: Record<string, number>): number {
    let score = this.baseScore;
    for (const tree of trees) {
      score += this.learningRate * tree.predict(features);
    }
    return this.sigmoid(score);
  }

  /**
   * Heuristic prediction when no model is trained.
   * Uses feature-based rules learned from domain knowledge.
   */
  private heuristicPredict(features: Record<string, number>): XGBoostPrediction {
    let risk = 0;

    // Report rate acceleration indicates growing problem
    const reportAccel = features['reportRateAcceleration'] ?? 0;
    if (reportAccel > 2) risk += 0.3;
    else if (reportAccel > 1) risk += 0.15;

    // Probe latency trend
    const latencyTrend = features['probeLatencyTrend'] ?? 0;
    if (latencyTrend > 3) risk += 0.25;
    else if (latencyTrend > 1.5) risk += 0.1;

    // Social sentiment shift
    const sentimentShift = features['socialSentimentShift'] ?? 0;
    if (sentimentShift > 2) risk += 0.15;
    else if (sentimentShift > 1) risk += 0.05;

    // DNS resolution anomaly
    const dnsAnomaly = features['dnsResolutionAnomaly'] ?? 0;
    if (dnsAnomaly > 0.5) risk += 0.2;

    // TLS cert expiry
    const tlsExpiry = features['tlsCertExpiryDays'] ?? 365;
    if (tlsExpiry < 1) risk += 0.3;
    else if (tlsExpiry < 7) risk += 0.1;

    // Historical pattern (hour-of-day sensitivity)
    const hourPattern = features['historicalOutagePattern'] ?? 0;
    risk += hourPattern * 0.1;

    risk = this.clamp(risk);

    // 5min prediction is most urgent, 60min is most uncertain
    return {
      probability5min: this.clamp(risk * 1.2),
      probability15min: this.clamp(risk),
      probability60min: this.clamp(risk * 0.7),
      features,
    };
  }

  private sigmoid(x: number): number {
    return 1 / (1 + Math.exp(-x));
  }

  private clamp(value: number, min = 0, max = 1): number {
    return Math.min(max, Math.max(min, value));
  }

  /**
   * Check if the predictor has been trained.
   */
  isTrained(): boolean {
    return this.trained;
  }
}
