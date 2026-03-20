/**
 * LSTM Autoencoder for anomaly detection (Layer 3).
 *
 * Architecture:
 *   Encoder: LSTM cells reduce a sliding window to a latent vector.
 *   Decoder: LSTM cells reconstruct the window from the latent vector.
 *
 * Anomaly detection: if reconstruction error exceeds the threshold
 * learned from normal training data, the window is flagged anomalous.
 */

import { Matrix } from './matrix.js';
import { LSTMCell } from './lstm-cell.js';
import type {
  AnomalyResult,
  AutoencoderConfig,
  FeatureVector,
  ModelWeights,
  SlidingWindow,
  TrainingMetrics,
} from './types.js';
import { DEFAULT_AUTOENCODER_CONFIG, FEATURE_KEYS } from './types.js';

/**
 * Convert a FeatureVector to a column vector of numeric features.
 */
function featureToVector(fv: FeatureVector): Matrix {
  const arr = FEATURE_KEYS.map(k => fv[k]);
  return Matrix.fromVector(arr);
}

/**
 * Convert a column vector back to a FeatureVector.
 */
function vectorToFeature(vec: Matrix, timestamp: number): FeatureVector {
  return {
    reportRate: Math.max(0, vec.get(0, 0)),
    probeLatency: Math.max(0, vec.get(1, 0)),
    probeSuccessRate: Math.min(1, Math.max(0, vec.get(2, 0))),
    socialMentionRate: Math.max(0, vec.get(3, 0)),
    timestamp,
  };
}

/**
 * Normalize a sliding window to [0, 1] range per feature.
 * Returns the normalized window and the min/max for denormalization.
 */
function normalizeWindow(window: SlidingWindow): {
  normalized: Matrix[];
  mins: number[];
  maxs: number[];
} {
  const featureCount = FEATURE_KEYS.length;
  const mins = new Array<number>(featureCount).fill(Infinity);
  const maxs = new Array<number>(featureCount).fill(-Infinity);

  for (const fv of window) {
    FEATURE_KEYS.forEach((key, idx) => {
      const val = fv[key];
      if (val < mins[idx]!) mins[idx] = val;
      if (val > maxs[idx]!) maxs[idx] = val;
    });
  }

  // Avoid division by zero
  for (let i = 0; i < featureCount; i++) {
    if (maxs[i]! - mins[i]! < 1e-10) {
      maxs[i] = mins[i]! + 1;
    }
  }

  const normalized = window.map(fv => {
    const arr = FEATURE_KEYS.map((key, idx) => (fv[key] - mins[idx]!) / (maxs[idx]! - mins[idx]!));
    return Matrix.fromVector(arr);
  });

  return { normalized, mins, maxs };
}

function denormalizeVector(
  vec: Matrix,
  mins: number[],
  maxs: number[],
  timestamp: number,
): FeatureVector {
  const denormed = Matrix.fromVector(
    FEATURE_KEYS.map((_, idx) => vec.get(idx, 0) * (maxs[idx]! - mins[idx]!) + mins[idx]!),
  );
  return vectorToFeature(denormed, timestamp);
}

export class LSTMAutoencoder {
  private readonly config: AutoencoderConfig;
  private encoderCells: LSTMCell[];
  private decoderCells: LSTMCell[];

  /** Dense layer from final encoder hidden state to latent space */
  private encoderProjection: Matrix;
  private encoderProjectionBias: Matrix;

  /** Dense layer from latent space to initial decoder hidden state */
  private decoderProjection: Matrix;
  private decoderProjectionBias: Matrix;

  /** Dense output layer: decoder hidden -> feature space */
  private outputProjection: Matrix;
  private outputBias: Matrix;

  /** Anomaly threshold (99th percentile of training reconstruction errors) */
  private threshold = 0.1;

  /** Normalization stats from training */
  private trainMins: number[] | null = null;
  private trainMaxs: number[] | null = null;

  constructor(config?: Partial<AutoencoderConfig>) {
    this.config = { ...DEFAULT_AUTOENCODER_CONFIG, ...config };

    const { inputSize, hiddenSizes, latentSize } = this.config;

    // Build encoder LSTM stack
    this.encoderCells = [];
    let prevSize = inputSize;
    for (const hs of hiddenSizes) {
      this.encoderCells.push(new LSTMCell(prevSize, hs));
      prevSize = hs;
    }

    // Encoder projection: last hidden -> latent
    const lastEncoderHidden = hiddenSizes[hiddenSizes.length - 1]!;
    this.encoderProjection = Matrix.random(latentSize, lastEncoderHidden, 0.1);
    this.encoderProjectionBias = Matrix.zeros(latentSize, 1);

    // Decoder projection: latent -> first decoder hidden
    const firstDecoderHidden = hiddenSizes[hiddenSizes.length - 1]!;
    this.decoderProjection = Matrix.random(firstDecoderHidden, latentSize, 0.1);
    this.decoderProjectionBias = Matrix.zeros(firstDecoderHidden, 1);

    // Build decoder LSTM stack (reversed hidden sizes)
    this.decoderCells = [];
    const reversedHidden = [...hiddenSizes].reverse();
    prevSize = reversedHidden[0]!; // Decoder input starts from projection
    for (let i = 0; i < reversedHidden.length; i++) {
      const hs = reversedHidden[i]!;
      // First decoder cell gets latent-projected input, rest chain
      const inSize = i === 0 ? inputSize : reversedHidden[i - 1]!;
      this.decoderCells.push(new LSTMCell(inSize, hs));
    }

    // Output projection: last decoder hidden -> feature space
    const lastDecoderHidden = reversedHidden[reversedHidden.length - 1]!;
    this.outputProjection = Matrix.random(inputSize, lastDecoderHidden, 0.1);
    this.outputBias = Matrix.zeros(inputSize, 1);
  }

  /**
   * Encode a sliding window into a latent representation.
   */
  encode(window: SlidingWindow): Matrix {
    const { normalized } = normalizeWindow(window);

    // Run through encoder LSTM stack
    const states = this.encoderCells.map(cell => cell.initHidden());

    for (const inputVec of normalized) {
      let layerInput = inputVec;
      for (let l = 0; l < this.encoderCells.length; l++) {
        const cell = this.encoderCells[l]!;
        const state = states[l]!;
        const result = cell.forward(layerInput, state.hidden, state.cell);
        states[l] = result;
        layerInput = result.hidden;
      }
    }

    // Project final hidden state to latent space
    const finalHidden = states[states.length - 1]!.hidden;
    const latent = this.encoderProjection.matmul(finalHidden).add(this.encoderProjectionBias);
    return latent.tanh();
  }

  /**
   * Decode a latent vector back to a sequence of feature vectors.
   */
  decode(latent: Matrix, outputLength: number): FeatureVector[] {
    // Project latent to initial decoder hidden state
    const initHidden = this.decoderProjection.matmul(latent).add(this.decoderProjectionBias).tanh();

    // Initialize decoder states
    const states = this.decoderCells.map(cell => {
      const state = cell.initHidden();
      return { hidden: state.hidden, cell: state.cell };
    });
    // Set first decoder layer hidden to projected latent
    states[0] = { hidden: initHidden, cell: Matrix.zeros(initHidden.rows, 1) };

    const outputs: FeatureVector[] = [];
    let decoderInput = Matrix.zeros(this.config.inputSize, 1);

    for (let t = 0; t < outputLength; t++) {
      let layerInput = decoderInput;
      for (let l = 0; l < this.decoderCells.length; l++) {
        const cell = this.decoderCells[l]!;
        const state = states[l]!;
        const result = cell.forward(layerInput, state.hidden, state.cell);
        states[l] = result;
        layerInput = result.hidden;
      }

      // Project to feature space
      const lastHidden = states[states.length - 1]!.hidden;
      const output = this.outputProjection.matmul(lastHidden).add(this.outputBias).sigmoid();
      outputs.push(vectorToFeature(output, Date.now()));
      decoderInput = output;
    }

    return outputs;
  }

  /**
   * Full forward pass: encode then decode.
   */
  forward(window: SlidingWindow): { reconstruction: FeatureVector[]; latent: Matrix } {
    const latent = this.encode(window);
    const reconstruction = this.decode(latent, window.length);
    return { reconstruction, latent };
  }

  /**
   * Compute reconstruction error (MSE) between original and reconstructed windows.
   */
  computeReconstructionError(original: SlidingWindow, reconstruction: FeatureVector[]): number {
    const len = Math.min(original.length, reconstruction.length);
    if (len === 0) return 0;

    let totalError = 0;
    for (let i = 0; i < len; i++) {
      const origVec = featureToVector(original[i]!);
      const reconVec = featureToVector(reconstruction[i]!);
      totalError += origVec.meanSquaredError(reconVec);
    }
    return totalError / len;
  }

  /**
   * Detect anomalies in a sliding window.
   */
  detect(window: SlidingWindow): AnomalyResult {
    const { reconstruction } = this.forward(window);
    const reconstructionError = this.computeReconstructionError(window, reconstruction);

    // Confidence: how far above/below threshold (capped at [0, 1])
    const ratio = reconstructionError / this.threshold;
    const isAnomaly = reconstructionError > this.threshold;
    const confidence = isAnomaly
      ? Math.min(1, (ratio - 1) / 2 + 0.5)
      : Math.max(0, 1 - ratio);

    // Use the last feature in the window as the representative feature
    const features = window[window.length - 1] ?? {
      reportRate: 0,
      probeLatency: 0,
      probeSuccessRate: 1,
      socialMentionRate: 0,
      timestamp: Date.now(),
    };

    return {
      reconstructionError,
      threshold: this.threshold,
      isAnomaly,
      confidence,
      features,
    };
  }

  /**
   * Train the autoencoder on normal operation windows.
   * Uses a simplified gradient-descent approach with numerical gradients
   * for correctness (full backprop-through-time would be significantly more complex).
   */
  train(
    normalWindows: SlidingWindow[],
    trainConfig?: { epochs?: number; lr?: number; validationSplit?: number },
  ): TrainingMetrics[] {
    const epochs = trainConfig?.epochs ?? this.config.epochs;
    const lr = trainConfig?.lr ?? this.config.learningRate;
    const validationSplit = trainConfig?.validationSplit ?? 0.2;

    // Split data
    const splitIdx = Math.floor(normalWindows.length * (1 - validationSplit));
    const trainData = normalWindows.slice(0, splitIdx);
    const valData = normalWindows.slice(splitIdx);

    const metrics: TrainingMetrics[] = [];

    // Collect all learnable parameter matrices for perturbation
    const allParams = this.collectParams();

    for (let epoch = 0; epoch < epochs; epoch++) {
      // Shuffle training data
      const shuffled = [...trainData].sort(() => Math.random() - 0.5);

      let epochLoss = 0;

      for (const window of shuffled) {
        // Forward pass
        const { reconstruction } = this.forward(window);
        const loss = this.computeReconstructionError(window, reconstruction);
        epochLoss += loss;

        // Simplified parameter update: perturb each param slightly
        // and update in the direction that reduces loss.
        // This is a form of random search / evolutionary strategy.
        for (const param of allParams) {
          for (let i = 0; i < param.rows; i++) {
            for (let j = 0; j < param.cols; j++) {
              const epsilon = 0.01;
              const original = param.get(i, j);

              // Positive perturbation
              param.set(i, j, original + epsilon);
              const { reconstruction: reconPlus } = this.forward(window);
              const lossPlus = this.computeReconstructionError(window, reconPlus);

              // Compute numerical gradient
              const grad = (lossPlus - loss) / epsilon;

              // Restore and update
              param.set(i, j, original - lr * grad);
            }
          }
        }
      }

      epochLoss /= trainData.length || 1;

      // Validation loss
      let valLoss = 0;
      for (const window of valData) {
        const { reconstruction } = this.forward(window);
        valLoss += this.computeReconstructionError(window, reconstruction);
      }
      valLoss /= valData.length || 1;

      // Update threshold as 99th percentile of validation errors
      const valErrors: number[] = [];
      for (const window of valData) {
        const { reconstruction } = this.forward(window);
        valErrors.push(this.computeReconstructionError(window, reconstruction));
      }
      valErrors.sort((a, b) => a - b);
      const p99Idx = Math.min(Math.floor(valErrors.length * 0.99), valErrors.length - 1);
      if (valErrors.length > 0) {
        this.threshold = valErrors[p99Idx]! * 1.5; // Add 50% margin
      }

      metrics.push({
        epoch,
        trainLoss: epochLoss,
        valLoss,
        reconstructionThreshold: this.threshold,
      });
    }

    return metrics;
  }

  /**
   * Simplified training that just adjusts output weights.
   * Much faster than full numerical gradient descent.
   */
  trainFast(
    normalWindows: SlidingWindow[],
    trainConfig?: { epochs?: number; lr?: number; validationSplit?: number },
  ): TrainingMetrics[] {
    const epochs = trainConfig?.epochs ?? this.config.epochs;
    const lr = trainConfig?.lr ?? this.config.learningRate;
    const validationSplit = trainConfig?.validationSplit ?? 0.2;

    const splitIdx = Math.floor(normalWindows.length * (1 - validationSplit));
    const trainData = normalWindows.slice(0, splitIdx);
    const valData = normalWindows.slice(splitIdx);

    const metrics: TrainingMetrics[] = [];

    for (let epoch = 0; epoch < epochs; epoch++) {
      let epochLoss = 0;

      for (const window of trainData) {
        const { reconstruction } = this.forward(window);
        const loss = this.computeReconstructionError(window, reconstruction);
        epochLoss += loss;

        // Random weight perturbation for output and projection layers
        const perturbTargets = [
          this.outputProjection,
          this.outputBias,
          this.encoderProjection,
          this.decoderProjection,
        ];

        for (const param of perturbTargets) {
          const perturbation = Matrix.random(param.rows, param.cols, lr);
          const newParam = param.subtract(perturbation.scale(loss));
          for (let i = 0; i < param.rows; i++) {
            for (let j = 0; j < param.cols; j++) {
              param.set(i, j, newParam.get(i, j));
            }
          }
        }
      }

      epochLoss /= trainData.length || 1;

      // Validation
      let valLoss = 0;
      const valErrors: number[] = [];
      for (const window of valData) {
        const { reconstruction } = this.forward(window);
        const err = this.computeReconstructionError(window, reconstruction);
        valLoss += err;
        valErrors.push(err);
      }
      valLoss /= valData.length || 1;

      // Set threshold
      valErrors.sort((a, b) => a - b);
      if (valErrors.length > 0) {
        const p99Idx = Math.min(Math.floor(valErrors.length * 0.99), valErrors.length - 1);
        this.threshold = valErrors[p99Idx]! * 1.5;
      }

      metrics.push({
        epoch,
        trainLoss: epochLoss,
        valLoss,
        reconstructionThreshold: this.threshold,
      });
    }

    return metrics;
  }

  /**
   * Set the anomaly detection threshold directly.
   */
  setThreshold(threshold: number): void {
    this.threshold = threshold;
  }

  /**
   * Get the current anomaly detection threshold.
   */
  getThreshold(): number {
    return this.threshold;
  }

  /**
   * Save model weights to a serializable format.
   */
  saveWeights(): ModelWeights {
    const encoderWeights = this.encoderCells.map(cell => {
      const w = cell.getWeights();
      return [...w.W, ...w.b];
    });

    const decoderWeights = this.decoderCells.map(cell => {
      const w = cell.getWeights();
      return [...w.W, ...w.b];
    });

    const biases = [
      this.encoderProjection.toArray(),
      this.encoderProjectionBias.toArray(),
      this.decoderProjection.toArray(),
      this.decoderProjectionBias.toArray(),
      this.outputProjection.toArray(),
      this.outputBias.toArray(),
      [[this.threshold]],
    ];

    return { encoderWeights, decoderWeights, biases };
  }

  /**
   * Load model weights from a previously saved format.
   */
  loadWeights(weights: ModelWeights): void {
    // Load encoder cells
    for (let i = 0; i < this.encoderCells.length; i++) {
      const cellWeights = weights.encoderWeights[i]!;
      this.encoderCells[i]!.setWeights({
        W: cellWeights.slice(0, 4) as number[][][],
        b: cellWeights.slice(4, 8) as number[][][],
      });
    }

    // Load decoder cells
    for (let i = 0; i < this.decoderCells.length; i++) {
      const cellWeights = weights.decoderWeights[i]!;
      this.decoderCells[i]!.setWeights({
        W: cellWeights.slice(0, 4) as number[][][],
        b: cellWeights.slice(4, 8) as number[][][],
      });
    }

    // Load projection and output layers
    const b = weights.biases;
    if (b[0]) {
      this.encoderProjection = Matrix.fromArray(b[0], this.encoderProjection.rows, this.encoderProjection.cols);
    }
    if (b[1]) {
      this.encoderProjectionBias = Matrix.fromArray(b[1], this.encoderProjectionBias.rows, this.encoderProjectionBias.cols);
    }
    if (b[2]) {
      this.decoderProjection = Matrix.fromArray(b[2], this.decoderProjection.rows, this.decoderProjection.cols);
    }
    if (b[3]) {
      this.decoderProjectionBias = Matrix.fromArray(b[3], this.decoderProjectionBias.rows, this.decoderProjectionBias.cols);
    }
    if (b[4]) {
      this.outputProjection = Matrix.fromArray(b[4], this.outputProjection.rows, this.outputProjection.cols);
    }
    if (b[5]) {
      this.outputBias = Matrix.fromArray(b[5], this.outputBias.rows, this.outputBias.cols);
    }
    if (b[6]?.[0]?.[0] !== undefined) {
      this.threshold = b[6][0][0];
    }
  }

  /**
   * Collect all mutable parameter matrices for optimization.
   */
  private collectParams(): Matrix[] {
    const params: Matrix[] = [];

    for (const cell of this.encoderCells) {
      params.push(cell.Wf, cell.Wi, cell.Wc, cell.Wo);
      params.push(cell.bf, cell.bi, cell.bc, cell.bo);
    }

    params.push(this.encoderProjection, this.encoderProjectionBias);
    params.push(this.decoderProjection, this.decoderProjectionBias);

    for (const cell of this.decoderCells) {
      params.push(cell.Wf, cell.Wi, cell.Wc, cell.Wo);
      params.push(cell.bf, cell.bi, cell.bc, cell.bo);
    }

    params.push(this.outputProjection, this.outputBias);

    return params;
  }
}
