import { describe, expect, it } from "vitest";
import { classifyStability, isFlaky, mean, stdev, wilsonInterval } from "../../evals/runner/stats";
import { summarizeCase } from "../../evals/runner/runner";
import type { RunReport } from "../../evals/runner/types";

const run = (i: number, pass: boolean, score = pass ? 1 : 0): RunReport => ({ run: i, pass, score, scores: [], latencyMs: 1 });

describe("stats", () => {
  it("mean of empty is 0", () => expect(mean([])).toBe(0));
  it("mean", () => expect(mean([1, 2, 3])).toBe(2));
  it("population stdev", () => expect(stdev([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2));
  it("stdev of one value is 0", () => expect(stdev([5])).toBe(0));
});

describe("isFlaky", () => {
  it("is not flaky when always passing or failing", () => {
    expect(isFlaky(1)).toBe(false);
    expect(isFlaky(0)).toBe(false);
  });
  it("is flaky strictly between 0 and 1", () => {
    expect(isFlaky(0.2)).toBe(true);
    expect(isFlaky(0.8)).toBe(true);
  });
  it("respects custom bounds", () => {
    expect(isFlaky(0.9, { low: 0.2, high: 0.8 })).toBe(false);
    expect(isFlaky(0.5, { low: 0.2, high: 0.8 })).toBe(true);
  });
});

describe("summarizeCase", () => {
  it("aggregates pass rate, mean and stdev and flags flakiness", () => {
    const c = summarizeCase("c", [run(0, true), run(1, true), run(2, false), run(3, true)]);
    expect(c.passRate).toBe(0.75);
    expect(c.meanScore).toBe(0.75);
    expect(c.scoreStdev).toBeCloseTo(0.433, 3);
    expect(c.flaky).toBe(true);
  });
  it("stable pass is not flaky", () => expect(summarizeCase("c", [run(0, true), run(1, true)]).flaky).toBe(false));
  it("stable fail is not flaky", () => expect(summarizeCase("c", [run(0, false), run(1, false)]).flaky).toBe(false));
});

describe("wilsonInterval", () => {
  it("matches reference values", () => {
    expect(wilsonInterval(4, 5).low).toBeCloseTo(0.3755, 3);
    expect(wilsonInterval(4, 5).high).toBeCloseTo(0.9638, 3);
  });
  it("stays informative at the extremes", () => {
    expect(wilsonInterval(5, 5)).toEqual({ low: expect.closeTo(0.5655, 3), high: 1 });
    expect(wilsonInterval(0, 5)).toEqual({ low: 0, high: expect.closeTo(0.4345, 3) });
  });
  it("narrows as N grows", () => {
    const width = (n: number) => wilsonInterval(n * 0.8, n).high - wilsonInterval(n * 0.8, n).low;
    expect(width(100)).toBeLessThan(width(10));
  });
  it("handles n=0 and rejects impossible counts", () => {
    expect(wilsonInterval(0, 0)).toEqual({ low: 0, high: 1 });
    expect(() => wilsonInterval(6, 5)).toThrow(RangeError);
  });
});

describe("classifyStability", () => {
  it("labels stable, flaky, mixed and inconclusive cases", () => {
    expect(classifyStability(5, 5)).toBe("stable-pass");
    expect(classifyStability(0, 5)).toBe("stable-fail");
    expect(classifyStability(3, 5)).toBe("flaky");
    expect(classifyStability(9, 10, { low: 0.2, high: 0.8 })).toBe("mixed");
    expect(classifyStability(0, 0)).toBe("inconclusive");
  });
});
