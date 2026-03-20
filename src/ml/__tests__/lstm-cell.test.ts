import { describe, it, expect } from 'vitest';
import { LSTMCell } from '../lstm-cell.js';
import { Matrix } from '../matrix.js';

describe('LSTMCell', () => {
  const inputSize = 4;
  const hiddenSize = 8;

  it('should initialize with correct dimensions', () => {
    const cell = new LSTMCell(inputSize, hiddenSize);
    const combinedSize = hiddenSize + inputSize;

    expect(cell.Wf.rows).toBe(hiddenSize);
    expect(cell.Wf.cols).toBe(combinedSize);
    expect(cell.Wi.rows).toBe(hiddenSize);
    expect(cell.Wc.rows).toBe(hiddenSize);
    expect(cell.Wo.rows).toBe(hiddenSize);
    expect(cell.bf.rows).toBe(hiddenSize);
    expect(cell.bf.cols).toBe(1);
  });

  it('should produce hidden and cell state of correct dimensions', () => {
    const cell = new LSTMCell(inputSize, hiddenSize);
    const input = Matrix.random(inputSize, 1, 0.5);
    const { hidden: prevH, cell: prevC } = cell.initHidden();

    const { hidden, cell: cellState } = cell.forward(input, prevH, prevC);

    expect(hidden.rows).toBe(hiddenSize);
    expect(hidden.cols).toBe(1);
    expect(cellState.rows).toBe(hiddenSize);
    expect(cellState.cols).toBe(1);
  });

  it('should produce hidden state values in valid range [-1, 1] (tanh output)', () => {
    const cell = new LSTMCell(inputSize, hiddenSize);
    const input = Matrix.random(inputSize, 1, 1.0);
    const { hidden: prevH, cell: prevC } = cell.initHidden();

    const { hidden } = cell.forward(input, prevH, prevC);

    for (let i = 0; i < hiddenSize; i++) {
      const val = hidden.get(i, 0);
      expect(val).toBeGreaterThanOrEqual(-1);
      expect(val).toBeLessThanOrEqual(1);
    }
  });

  it('should process a sequence maintaining state across steps', () => {
    const cell = new LSTMCell(inputSize, hiddenSize);
    let { hidden, cell: cellState } = cell.initHidden();

    const sequence = Array.from({ length: 10 }, () =>
      Matrix.random(inputSize, 1, 0.5),
    );

    const hiddenStates: Matrix[] = [];
    for (const input of sequence) {
      const result = cell.forward(input, hidden, cellState);
      hidden = result.hidden;
      cellState = result.cell;
      hiddenStates.push(hidden);
    }

    expect(hiddenStates).toHaveLength(10);

    // Hidden states should change over the sequence (not all identical)
    const first = hiddenStates[0]!;
    const last = hiddenStates[9]!;
    let allSame = true;
    for (let i = 0; i < hiddenSize; i++) {
      if (Math.abs(first.get(i, 0) - last.get(i, 0)) > 1e-6) {
        allSame = false;
        break;
      }
    }
    expect(allSame).toBe(false);
  });

  it('should return zero state from initHidden', () => {
    const cell = new LSTMCell(inputSize, hiddenSize);
    const { hidden, cell: cellState } = cell.initHidden();

    expect(hidden.rows).toBe(hiddenSize);
    expect(hidden.cols).toBe(1);
    expect(cellState.rows).toBe(hiddenSize);
    expect(cellState.cols).toBe(1);

    for (let i = 0; i < hiddenSize; i++) {
      expect(hidden.get(i, 0)).toBe(0);
      expect(cellState.get(i, 0)).toBe(0);
    }
  });

  it('should serialize and deserialize weights', () => {
    const cell = new LSTMCell(inputSize, hiddenSize);
    const weights = cell.getWeights();

    const cell2 = new LSTMCell(inputSize, hiddenSize);
    cell2.setWeights(weights);

    // Verify weights match
    for (let i = 0; i < hiddenSize; i++) {
      for (let j = 0; j < hiddenSize + inputSize; j++) {
        expect(cell2.Wf.get(i, j)).toBe(cell.Wf.get(i, j));
        expect(cell2.Wi.get(i, j)).toBe(cell.Wi.get(i, j));
        expect(cell2.Wc.get(i, j)).toBe(cell.Wc.get(i, j));
        expect(cell2.Wo.get(i, j)).toBe(cell.Wo.get(i, j));
      }
    }
  });

  it('should produce different outputs for different inputs', () => {
    const cell = new LSTMCell(inputSize, hiddenSize);
    const { hidden: h0, cell: c0 } = cell.initHidden();

    const input1 = Matrix.fromVector([1, 0, 0, 0]);
    const input2 = Matrix.fromVector([0, 0, 0, 1]);

    const result1 = cell.forward(input1, h0, c0);
    const result2 = cell.forward(input2, h0, c0);

    let allSame = true;
    for (let i = 0; i < hiddenSize; i++) {
      if (Math.abs(result1.hidden.get(i, 0) - result2.hidden.get(i, 0)) > 1e-8) {
        allSame = false;
        break;
      }
    }
    expect(allSame).toBe(false);
  });
});
