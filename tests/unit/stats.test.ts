import { describe, expect, it } from "vitest";
import { isFlaky, mean, stdev } from "../../evals/runner/stats";
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
