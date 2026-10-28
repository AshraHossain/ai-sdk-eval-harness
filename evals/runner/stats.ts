/**
 * Small, dependency-free statistics for N-run evaluation.
 *
 * Running each golden case N times turns a single pass/fail bit into a pass
 * *rate*. With small N, the raw rate is noisy, so we also report a Wilson
 * score interval: it behaves sensibly at 0/N and N/N, unlike the normal
 * approximation, which collapses to zero width there.
 */

/** `inconclusive`: every run hit an infrastructure error, so there is no quality signal. */
export type Stability = 'stable-pass' | 'stable-fail' | 'flaky' | 'inconclusive';

export interface Interval {
  low: number;
  high: number;
}

/** Wilson score interval for a binomial proportion (default 95%). */
export function wilsonInterval(successes: number, n: number, z = 1.96): Interval {
  if (n <= 0) return { low: 0, high: 1 };
  if (successes < 0 || successes > n) throw new RangeError(`successes (${successes}) must be within 0..${n}`);
  const p = successes / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return { low: clamp01(centre - half), high: clamp01(centre + half) };
}

/**
 * A case is flaky when it both passed and failed across N runs. That is the
 * only claim N runs can support without a model of the failure distribution.
 */
export function classifyStability(passes: number, n: number): Stability {
  if (n < 0 || passes < 0 || passes > n) throw new RangeError(`invalid passes/n: ${passes}/${n}`);
  if (n === 0) return 'inconclusive';
  if (passes === n) return 'stable-pass';
  if (passes === 0) return 'stable-fail';
  return 'flaky';
}

export function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

/** Sample standard deviation (n - 1). Zero for fewer than two values. */
export function stddev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1));
}

export function percentile(xs: number[], p: number): number {
  if (!xs.length) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

export const round = (x: number, digits = 4) => Math.round(x * 10 ** digits) / 10 ** digits;

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}
