import { describe, expect, it } from 'vitest';
import { classifyStability, mean, percentile, stddev, wilsonInterval } from '../../evals/runner/stats';

describe('wilsonInterval', () => {
  it('matches reference values', () => {
    const a = wilsonInterval(4, 5);
    expect(a.low).toBeCloseTo(0.3755, 3);
    expect(a.high).toBeCloseTo(0.9638, 3);
  });

  it('stays informative at the extremes, unlike the normal approximation', () => {
    const allPass = wilsonInterval(5, 5);
    expect(allPass.high).toBe(1);
    expect(allPass.low).toBeCloseTo(0.5655, 3);
    const allFail = wilsonInterval(0, 5);
    expect(allFail.low).toBe(0);
    expect(allFail.high).toBeCloseTo(0.4345, 3);
  });

  it('narrows as N grows', () => {
    const w = (n: number) => wilsonInterval(n * 0.8, n);
    expect(w(100).high - w(100).low).toBeLessThan(w(10).high - w(10).low);
  });

  it('rejects impossible inputs', () => {
    expect(() => wilsonInterval(6, 5)).toThrow(RangeError);
    expect(wilsonInterval(0, 0)).toEqual({ low: 0, high: 1 });
  });
});

describe('classifyStability', () => {
  it('labels all-pass, all-fail and mixed runs', () => {
    expect(classifyStability(5, 5)).toBe('stable-pass');
    expect(classifyStability(0, 5)).toBe('stable-fail');
    expect(classifyStability(3, 5)).toBe('flaky');
    expect(classifyStability(1, 1)).toBe('stable-pass');
  });
  it('is inconclusive with no scored runs and rejects impossible counts', () => {
    expect(classifyStability(0, 0)).toBe('inconclusive');
    expect(() => classifyStability(3, 2)).toThrow(RangeError);
    expect(() => classifyStability(0, -1)).toThrow(RangeError);
  });
});

describe('descriptive stats', () => {
  it('computes mean, sample stddev and nearest-rank percentile', () => {
    expect(mean([1, 2, 3, 4])).toBe(2.5);
    expect(stddev([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.138, 3);
    expect(stddev([1])).toBe(0);
    expect(percentile([5, 1, 4, 2, 3], 50)).toBe(3);
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 95)).toBe(10);
    expect(percentile([], 50)).toBe(0);
  });
});
