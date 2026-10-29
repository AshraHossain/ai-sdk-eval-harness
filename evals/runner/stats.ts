export const mean = (xs: number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/** Population standard deviation (the runs are the whole population we observed). */
export function stdev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
}

export interface FlakyBounds {
  /** Pass rate must be strictly above this to be flaky (default 0). */
  low: number;
  /** ...and strictly below this (default 1). */
  high: number;
}
export const DEFAULT_FLAKY_BOUNDS: FlakyBounds = { low: 0, high: 1 };

/** A case is flaky when it neither always passes nor always fails across N runs. */
export function isFlaky(passRate: number, bounds: FlakyBounds = DEFAULT_FLAKY_BOUNDS): boolean {
  return passRate > bounds.low && passRate < bounds.high;
}

export const round = (n: number, digits = 4): number => Math.round(n * 10 ** digits) / 10 ** digits;

export interface Interval {
  low: number;
  high: number;
}

/**
 * Wilson score interval for a pass rate (default 95%). Unlike the normal
 * approximation it stays informative at 0/N and N/N: 5/5 passes gives roughly
 * [0.57, 1], which is a reminder that five runs prove less than they look.
 */
export function wilsonInterval(passes: number, n: number, z = 1.96): Interval {
  if (n <= 0) return { low: 0, high: 1 };
  if (passes < 0 || passes > n) throw new RangeError(`passes (${passes}) must be within 0..${n}`);
  const p = passes / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return { low: round(Math.max(0, centre - half)), high: round(Math.min(1, centre + half)) };
}

/**
 * - stable-pass / stable-fail: every scored run agreed
 * - flaky: inside the flaky bounds
 * - mixed: passed and failed, but outside custom flaky bounds
 * - inconclusive: every run hit an infrastructure error, so there is no quality signal
 */
export type Stability = "stable-pass" | "stable-fail" | "flaky" | "mixed" | "inconclusive";

export function classifyStability(passes: number, n: number, bounds: FlakyBounds = DEFAULT_FLAKY_BOUNDS): Stability {
  if (n === 0) return "inconclusive";
  if (passes === n) return "stable-pass";
  if (passes === 0) return "stable-fail";
  return isFlaky(passes / n, bounds) ? "flaky" : "mixed";
}
