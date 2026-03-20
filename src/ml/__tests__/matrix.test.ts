import { describe, it, expect } from 'vitest';
import { Matrix } from '../matrix.js';

describe('Matrix', () => {
  describe('creation', () => {
    it('should create a zeros matrix', () => {
      const m = Matrix.zeros(3, 4);
      expect(m.rows).toBe(3);
      expect(m.cols).toBe(4);
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 4; j++) {
          expect(m.get(i, j)).toBe(0);
        }
      }
    });

    it('should create a ones matrix', () => {
      const m = Matrix.ones(2, 3);
      expect(m.rows).toBe(2);
      expect(m.cols).toBe(3);
      for (let i = 0; i < 2; i++) {
        for (let j = 0; j < 3; j++) {
          expect(m.get(i, j)).toBe(1);
        }
      }
    });

    it('should create a random matrix with values in expected range', () => {
      const scale = 0.5;
      const m = Matrix.random(10, 10, scale);
      for (let i = 0; i < 10; i++) {
        for (let j = 0; j < 10; j++) {
          expect(m.get(i, j)).toBeGreaterThanOrEqual(-scale);
          expect(m.get(i, j)).toBeLessThanOrEqual(scale);
        }
      }
    });

    it('should create from array', () => {
      const data = [
        [1, 2, 3],
        [4, 5, 6],
      ];
      const m = Matrix.fromArray(data, 2, 3);
      expect(m.get(0, 0)).toBe(1);
      expect(m.get(0, 2)).toBe(3);
      expect(m.get(1, 1)).toBe(5);
    });

    it('should create a column vector from a 1D array', () => {
      const v = Matrix.fromVector([1, 2, 3]);
      expect(v.rows).toBe(3);
      expect(v.cols).toBe(1);
      expect(v.get(0, 0)).toBe(1);
      expect(v.get(2, 0)).toBe(3);
    });
  });

  describe('addition', () => {
    it('should add two matrices element-wise', () => {
      const a = Matrix.fromArray([[1, 2], [3, 4]], 2, 2);
      const b = Matrix.fromArray([[5, 6], [7, 8]], 2, 2);
      const c = a.add(b);
      expect(c.get(0, 0)).toBe(6);
      expect(c.get(0, 1)).toBe(8);
      expect(c.get(1, 0)).toBe(10);
      expect(c.get(1, 1)).toBe(12);
    });

    it('should throw on dimension mismatch', () => {
      const a = Matrix.zeros(2, 3);
      const b = Matrix.zeros(3, 2);
      expect(() => a.add(b)).toThrow('Dimension mismatch');
    });
  });

  describe('subtraction', () => {
    it('should subtract two matrices element-wise', () => {
      const a = Matrix.fromArray([[10, 20], [30, 40]], 2, 2);
      const b = Matrix.fromArray([[1, 2], [3, 4]], 2, 2);
      const c = a.subtract(b);
      expect(c.get(0, 0)).toBe(9);
      expect(c.get(1, 1)).toBe(36);
    });
  });

  describe('element-wise multiply', () => {
    it('should multiply two matrices element-wise (Hadamard)', () => {
      const a = Matrix.fromArray([[1, 2], [3, 4]], 2, 2);
      const b = Matrix.fromArray([[5, 6], [7, 8]], 2, 2);
      const c = a.multiply(b);
      expect(c.get(0, 0)).toBe(5);
      expect(c.get(0, 1)).toBe(12);
      expect(c.get(1, 0)).toBe(21);
      expect(c.get(1, 1)).toBe(32);
    });
  });

  describe('matrix multiplication', () => {
    it('should compute correct matrix product', () => {
      const a = Matrix.fromArray([[1, 2], [3, 4]], 2, 2);
      const b = Matrix.fromArray([[5, 6], [7, 8]], 2, 2);
      const c = a.matmul(b);
      // [1*5+2*7, 1*6+2*8] = [19, 22]
      // [3*5+4*7, 3*6+4*8] = [43, 50]
      expect(c.get(0, 0)).toBe(19);
      expect(c.get(0, 1)).toBe(22);
      expect(c.get(1, 0)).toBe(43);
      expect(c.get(1, 1)).toBe(50);
    });

    it('should handle non-square matrices', () => {
      const a = Matrix.fromArray([[1, 2, 3]], 1, 3);
      const b = Matrix.fromArray([[4], [5], [6]], 3, 1);
      const c = a.matmul(b);
      expect(c.rows).toBe(1);
      expect(c.cols).toBe(1);
      expect(c.get(0, 0)).toBe(32); // 1*4 + 2*5 + 3*6
    });

    it('should throw on dimension mismatch', () => {
      const a = Matrix.zeros(2, 3);
      const b = Matrix.zeros(2, 3);
      expect(() => a.matmul(b)).toThrow('Dimension mismatch');
    });
  });

  describe('transpose', () => {
    it('should transpose correctly', () => {
      const a = Matrix.fromArray([[1, 2, 3], [4, 5, 6]], 2, 3);
      const t = a.transpose();
      expect(t.rows).toBe(3);
      expect(t.cols).toBe(2);
      expect(t.get(0, 0)).toBe(1);
      expect(t.get(0, 1)).toBe(4);
      expect(t.get(2, 0)).toBe(3);
      expect(t.get(2, 1)).toBe(6);
    });
  });

  describe('activation functions', () => {
    it('sigmoid should produce values in [0, 1]', () => {
      const m = Matrix.fromArray([[-100, -1, 0, 1, 100]], 1, 5);
      const s = m.sigmoid();
      for (let j = 0; j < 5; j++) {
        expect(s.get(0, j)).toBeGreaterThanOrEqual(0);
        expect(s.get(0, j)).toBeLessThanOrEqual(1);
      }
      // sigmoid(0) = 0.5
      expect(s.get(0, 2)).toBeCloseTo(0.5, 5);
      // sigmoid(-100) ~ 0
      expect(s.get(0, 0)).toBeCloseTo(0, 5);
      // sigmoid(100) ~ 1
      expect(s.get(0, 4)).toBeCloseTo(1, 5);
    });

    it('relu should produce non-negative values', () => {
      const m = Matrix.fromArray([[-5, -1, 0, 1, 5]], 1, 5);
      const r = m.relu();
      expect(r.get(0, 0)).toBe(0);
      expect(r.get(0, 1)).toBe(0);
      expect(r.get(0, 2)).toBe(0);
      expect(r.get(0, 3)).toBe(1);
      expect(r.get(0, 4)).toBe(5);
    });

    it('tanh should produce values in [-1, 1]', () => {
      const m = Matrix.fromArray([[-100, -1, 0, 1, 100]], 1, 5);
      const t = m.tanh();
      for (let j = 0; j < 5; j++) {
        expect(t.get(0, j)).toBeGreaterThanOrEqual(-1);
        expect(t.get(0, j)).toBeLessThanOrEqual(1);
      }
      // tanh(0) = 0
      expect(t.get(0, 2)).toBeCloseTo(0, 5);
    });
  });

  describe('meanSquaredError', () => {
    it('should compute MSE correctly', () => {
      const a = Matrix.fromArray([[1, 2], [3, 4]], 2, 2);
      const b = Matrix.fromArray([[1, 2], [3, 4]], 2, 2);
      expect(a.meanSquaredError(b)).toBe(0);

      const c = Matrix.fromArray([[2, 3], [4, 5]], 2, 2);
      // Each diff is 1, squared is 1, sum is 4, mean is 1
      expect(a.meanSquaredError(c)).toBe(1);
    });

    it('should throw on dimension mismatch', () => {
      const a = Matrix.zeros(2, 2);
      const b = Matrix.zeros(3, 3);
      expect(() => a.meanSquaredError(b)).toThrow('Dimension mismatch');
    });
  });

  describe('utility methods', () => {
    it('should scale by a scalar', () => {
      const m = Matrix.fromArray([[1, 2], [3, 4]], 2, 2);
      const s = m.scale(3);
      expect(s.get(0, 0)).toBe(3);
      expect(s.get(1, 1)).toBe(12);
    });

    it('should compute sum and mean', () => {
      const m = Matrix.fromArray([[1, 2], [3, 4]], 2, 2);
      expect(m.sum()).toBe(10);
      expect(m.mean()).toBe(2.5);
    });

    it('should flatten to 1D array', () => {
      const m = Matrix.fromArray([[1, 2], [3, 4]], 2, 2);
      expect(m.toFlat()).toEqual([1, 2, 3, 4]);
    });

    it('should vstack two column vectors', () => {
      const a = Matrix.fromVector([1, 2]);
      const b = Matrix.fromVector([3, 4, 5]);
      const c = Matrix.vstack(a, b);
      expect(c.rows).toBe(5);
      expect(c.cols).toBe(1);
      expect(c.get(0, 0)).toBe(1);
      expect(c.get(2, 0)).toBe(3);
      expect(c.get(4, 0)).toBe(5);
    });

    it('should clone without sharing references', () => {
      const m = Matrix.fromArray([[1, 2]], 1, 2);
      const c = m.clone();
      c.set(0, 0, 99);
      expect(m.get(0, 0)).toBe(1);
    });
  });
});
