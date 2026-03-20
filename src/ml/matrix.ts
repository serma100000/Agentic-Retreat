/**
 * Lightweight Matrix operations for neural network computation.
 * No external dependencies — pure TypeScript.
 */

export class Matrix {
  public readonly rows: number;
  public readonly cols: number;
  public data: number[][];

  constructor(rows: number, cols: number, data?: number[][]) {
    this.rows = rows;
    this.cols = cols;
    if (data) {
      if (data.length !== rows) {
        throw new Error(`Data rows (${data.length}) != expected rows (${rows})`);
      }
      for (const row of data) {
        if (row.length !== cols) {
          throw new Error(`Data cols (${row.length}) != expected cols (${cols})`);
        }
      }
      this.data = data.map(row => [...row]);
    } else {
      this.data = Array.from({ length: rows }, () => new Array<number>(cols).fill(0));
    }
  }

  static zeros(rows: number, cols: number): Matrix {
    return new Matrix(rows, cols);
  }

  static ones(rows: number, cols: number): Matrix {
    const data = Array.from({ length: rows }, () => new Array<number>(cols).fill(1));
    return new Matrix(rows, cols, data);
  }

  static random(rows: number, cols: number, scale = 1.0): Matrix {
    const data = Array.from({ length: rows }, () =>
      Array.from({ length: cols }, () => (Math.random() * 2 - 1) * scale),
    );
    return new Matrix(rows, cols, data);
  }

  static fromArray(data: number[][], rows: number, cols: number): Matrix {
    return new Matrix(rows, cols, data);
  }

  /**
   * Create a column vector from a 1D array.
   */
  static fromVector(arr: number[]): Matrix {
    const data = arr.map(v => [v]);
    return new Matrix(arr.length, 1, data);
  }

  /**
   * Concatenate two column vectors vertically.
   */
  static vstack(a: Matrix, b: Matrix): Matrix {
    if (a.cols !== b.cols) {
      throw new Error(`Column mismatch for vstack: ${a.cols} vs ${b.cols}`);
    }
    const data = [...a.data.map(r => [...r]), ...b.data.map(r => [...r])];
    return new Matrix(a.rows + b.rows, a.cols, data);
  }

  get(row: number, col: number): number {
    return this.data[row]![col]!;
  }

  set(row: number, col: number, value: number): void {
    this.data[row]![col] = value;
  }

  clone(): Matrix {
    return new Matrix(this.rows, this.cols, this.data.map(r => [...r]));
  }

  add(other: Matrix): Matrix {
    if (this.rows !== other.rows || this.cols !== other.cols) {
      throw new Error(
        `Dimension mismatch for add: (${this.rows},${this.cols}) vs (${other.rows},${other.cols})`,
      );
    }
    const result = new Matrix(this.rows, this.cols);
    for (let i = 0; i < this.rows; i++) {
      for (let j = 0; j < this.cols; j++) {
        result.data[i]![j] = this.data[i]![j]! + other.data[i]![j]!;
      }
    }
    return result;
  }

  subtract(other: Matrix): Matrix {
    if (this.rows !== other.rows || this.cols !== other.cols) {
      throw new Error(
        `Dimension mismatch for subtract: (${this.rows},${this.cols}) vs (${other.rows},${other.cols})`,
      );
    }
    const result = new Matrix(this.rows, this.cols);
    for (let i = 0; i < this.rows; i++) {
      for (let j = 0; j < this.cols; j++) {
        result.data[i]![j] = this.data[i]![j]! - other.data[i]![j]!;
      }
    }
    return result;
  }

  /** Element-wise multiplication (Hadamard product). */
  multiply(other: Matrix): Matrix {
    if (this.rows !== other.rows || this.cols !== other.cols) {
      throw new Error(
        `Dimension mismatch for multiply: (${this.rows},${this.cols}) vs (${other.rows},${other.cols})`,
      );
    }
    const result = new Matrix(this.rows, this.cols);
    for (let i = 0; i < this.rows; i++) {
      for (let j = 0; j < this.cols; j++) {
        result.data[i]![j] = this.data[i]![j]! * other.data[i]![j]!;
      }
    }
    return result;
  }

  /** Scalar multiplication. */
  scale(scalar: number): Matrix {
    const result = new Matrix(this.rows, this.cols);
    for (let i = 0; i < this.rows; i++) {
      for (let j = 0; j < this.cols; j++) {
        result.data[i]![j] = this.data[i]![j]! * scalar;
      }
    }
    return result;
  }

  /** Matrix multiplication: this (m x n) * other (n x p) -> (m x p). */
  matmul(other: Matrix): Matrix {
    if (this.cols !== other.rows) {
      throw new Error(
        `Dimension mismatch for matmul: (${this.rows},${this.cols}) * (${other.rows},${other.cols})`,
      );
    }
    const result = new Matrix(this.rows, other.cols);
    for (let i = 0; i < this.rows; i++) {
      for (let j = 0; j < other.cols; j++) {
        let sum = 0;
        for (let k = 0; k < this.cols; k++) {
          sum += this.data[i]![k]! * other.data[k]![j]!;
        }
        result.data[i]![j] = sum;
      }
    }
    return result;
  }

  transpose(): Matrix {
    const result = new Matrix(this.cols, this.rows);
    for (let i = 0; i < this.rows; i++) {
      for (let j = 0; j < this.cols; j++) {
        result.data[j]![i] = this.data[i]![j]!;
      }
    }
    return result;
  }

  /** Apply sigmoid element-wise: 1 / (1 + exp(-x)). */
  sigmoid(): Matrix {
    const result = new Matrix(this.rows, this.cols);
    for (let i = 0; i < this.rows; i++) {
      for (let j = 0; j < this.cols; j++) {
        const x = this.data[i]![j]!;
        result.data[i]![j] = 1 / (1 + Math.exp(-x));
      }
    }
    return result;
  }

  /** Apply ReLU element-wise: max(0, x). */
  relu(): Matrix {
    const result = new Matrix(this.rows, this.cols);
    for (let i = 0; i < this.rows; i++) {
      for (let j = 0; j < this.cols; j++) {
        result.data[i]![j] = Math.max(0, this.data[i]![j]!);
      }
    }
    return result;
  }

  /** Apply tanh element-wise. */
  tanh(): Matrix {
    const result = new Matrix(this.rows, this.cols);
    for (let i = 0; i < this.rows; i++) {
      for (let j = 0; j < this.cols; j++) {
        result.data[i]![j] = Math.tanh(this.data[i]![j]!);
      }
    }
    return result;
  }

  /** Mean Squared Error between this matrix and another. */
  meanSquaredError(other: Matrix): number {
    if (this.rows !== other.rows || this.cols !== other.cols) {
      throw new Error(
        `Dimension mismatch for MSE: (${this.rows},${this.cols}) vs (${other.rows},${other.cols})`,
      );
    }
    let sum = 0;
    const total = this.rows * this.cols;
    for (let i = 0; i < this.rows; i++) {
      for (let j = 0; j < this.cols; j++) {
        const diff = this.data[i]![j]! - other.data[i]![j]!;
        sum += diff * diff;
      }
    }
    return sum / total;
  }

  /** Sum all elements. */
  sum(): number {
    let s = 0;
    for (let i = 0; i < this.rows; i++) {
      for (let j = 0; j < this.cols; j++) {
        s += this.data[i]![j]!;
      }
    }
    return s;
  }

  /** Mean of all elements. */
  mean(): number {
    return this.sum() / (this.rows * this.cols);
  }

  toArray(): number[][] {
    return this.data.map(row => [...row]);
  }

  /** Flatten to 1D array (row-major). */
  toFlat(): number[] {
    const result: number[] = [];
    for (let i = 0; i < this.rows; i++) {
      for (let j = 0; j < this.cols; j++) {
        result.push(this.data[i]![j]!);
      }
    }
    return result;
  }

  /** Apply a function element-wise. */
  map(fn: (value: number, row: number, col: number) => number): Matrix {
    const result = new Matrix(this.rows, this.cols);
    for (let i = 0; i < this.rows; i++) {
      for (let j = 0; j < this.cols; j++) {
        result.data[i]![j] = fn(this.data[i]![j]!, i, j);
      }
    }
    return result;
  }

  /** Extract a sub-matrix (rows from rowStart to rowEnd exclusive). */
  sliceRows(rowStart: number, rowEnd: number): Matrix {
    const data = this.data.slice(rowStart, rowEnd).map(r => [...r]);
    return new Matrix(rowEnd - rowStart, this.cols, data);
  }
}
