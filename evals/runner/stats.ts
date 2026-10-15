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
