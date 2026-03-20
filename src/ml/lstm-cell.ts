/**
 * LSTM Cell implementation for sequence modeling.
 * Used by the LSTM Autoencoder for anomaly detection.
 */

import { Matrix } from './matrix.js';

export class LSTMCell {
  public readonly inputSize: number;
  public readonly hiddenSize: number;

  /** Weight matrices: each is (hiddenSize x (hiddenSize + inputSize)) */
  public Wf: Matrix; // forget gate
  public Wi: Matrix; // input gate
  public Wc: Matrix; // candidate
  public Wo: Matrix; // output gate

  /** Bias vectors: each is (hiddenSize x 1) */
  public bf: Matrix;
  public bi: Matrix;
  public bc: Matrix;
  public bo: Matrix;

  constructor(inputSize: number, hiddenSize: number) {
    this.inputSize = inputSize;
    this.hiddenSize = hiddenSize;

    const combinedSize = hiddenSize + inputSize;

    // Xavier-like initialization: scale = sqrt(2 / (fan_in + fan_out))
    const scale = Math.sqrt(2 / (combinedSize + hiddenSize));

    this.Wf = Matrix.random(hiddenSize, combinedSize, scale);
    this.Wi = Matrix.random(hiddenSize, combinedSize, scale);
    this.Wc = Matrix.random(hiddenSize, combinedSize, scale);
    this.Wo = Matrix.random(hiddenSize, combinedSize, scale);

    // Initialize forget gate bias to 1.0 (helps with learning long dependencies)
    this.bf = Matrix.ones(hiddenSize, 1);
    this.bi = Matrix.zeros(hiddenSize, 1);
    this.bc = Matrix.zeros(hiddenSize, 1);
    this.bo = Matrix.zeros(hiddenSize, 1);
  }

  /**
   * Forward pass through the LSTM cell.
   * @param input Column vector (inputSize x 1)
   * @param prevHidden Previous hidden state (hiddenSize x 1)
   * @param prevCell Previous cell state (hiddenSize x 1)
   * @returns New hidden and cell states
   */
  forward(
    input: Matrix,
    prevHidden: Matrix,
    prevCell: Matrix,
  ): { hidden: Matrix; cell: Matrix } {
    // Concatenate [prevHidden, input] -> (hiddenSize + inputSize) x 1
    const combined = Matrix.vstack(prevHidden, input);

    // Forget gate: f = sigmoid(Wf * [h, x] + bf)
    const f = this.Wf.matmul(combined).add(this.bf).sigmoid();

    // Input gate: i = sigmoid(Wi * [h, x] + bi)
    const i = this.Wi.matmul(combined).add(this.bi).sigmoid();

    // Candidate cell state: c_hat = tanh(Wc * [h, x] + bc)
    const cHat = this.Wc.matmul(combined).add(this.bc).tanh();

    // New cell state: c = f * prevCell + i * c_hat
    const cell = f.multiply(prevCell).add(i.multiply(cHat));

    // Output gate: o = sigmoid(Wo * [h, x] + bo)
    const o = this.Wo.matmul(combined).add(this.bo).sigmoid();

    // New hidden state: h = o * tanh(c)
    const hidden = o.multiply(cell.tanh());

    return { hidden, cell };
  }

  /**
   * Initialize hidden and cell states to zeros.
   */
  initHidden(): { hidden: Matrix; cell: Matrix } {
    return {
      hidden: Matrix.zeros(this.hiddenSize, 1),
      cell: Matrix.zeros(this.hiddenSize, 1),
    };
  }

  /**
   * Serialize weights to plain arrays for persistence.
   */
  getWeights(): { W: number[][][]; b: number[][][] } {
    return {
      W: [
        this.Wf.toArray(),
        this.Wi.toArray(),
        this.Wc.toArray(),
        this.Wo.toArray(),
      ],
      b: [
        this.bf.toArray(),
        this.bi.toArray(),
        this.bc.toArray(),
        this.bo.toArray(),
      ],
    };
  }

  /**
   * Load weights from plain arrays.
   */
  setWeights(weights: { W: number[][][]; b: number[][][] }): void {
    const combinedSize = this.hiddenSize + this.inputSize;
    this.Wf = Matrix.fromArray(weights.W[0]!, this.hiddenSize, combinedSize);
    this.Wi = Matrix.fromArray(weights.W[1]!, this.hiddenSize, combinedSize);
    this.Wc = Matrix.fromArray(weights.W[2]!, this.hiddenSize, combinedSize);
    this.Wo = Matrix.fromArray(weights.W[3]!, this.hiddenSize, combinedSize);
    this.bf = Matrix.fromArray(weights.b[0]!, this.hiddenSize, 1);
    this.bi = Matrix.fromArray(weights.b[1]!, this.hiddenSize, 1);
    this.bc = Matrix.fromArray(weights.b[2]!, this.hiddenSize, 1);
    this.bo = Matrix.fromArray(weights.b[3]!, this.hiddenSize, 1);
  }
}
