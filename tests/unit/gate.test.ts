import { describe, expect, it } from "vitest";
import { evaluateGate, thresholdsSchema } from "../../evals/runner/gate";
import { renderMarkdown } from "../../evals/runner/markdown";
import type { SuiteReport } from "../../evals/runner/types";

const report = (suite: string, passRate: number, flakeRate: number): SuiteReport => ({
  suite, title: suite, mode: "mock", runsPerCase: 5, datasetVersion: "1", datasetHash: "x", model: "m", judgeModel: "j",
  startedAt: "", durationMs: 1, cases: [],
  summary: { cases: 10, passRate, meanScore: passRate, flakyCases: flakeRate * 10, flakeRate, failingCases: 0 },
});
const thresholds = thresholdsSchema.parse({ default: { minPassRate: 0.8, maxFlakeRate: 0.2 }, suites: { agent: { minPassRate: 0.95 } } });

describe("evaluateGate", () => {
  it("passes when all suites meet thresholds", () => expect(evaluateGate([report("a", 0.9, 0.1)], thresholds).ok).toBe(true));
  it("fails when pass rate drops below threshold", () => {
    const g = evaluateGate([report("a", 0.79, 0)], thresholds);
    expect(g.ok).toBe(false);
    expect(g.results[0]!.failures[0]).toContain("pass rate");
  });
  it("fails when flake rate exceeds budget", () => {
    const g = evaluateGate([report("a", 1, 0.3)], thresholds);
    expect(g.ok).toBe(false);
    expect(g.results[0]!.failures[0]).toContain("flake rate");
  });
  it("applies per-suite overrides", () => {
    expect(evaluateGate([report("agent", 0.9, 0)], thresholds).ok).toBe(false);
    expect(evaluateGate([report("other", 0.9, 0)], thresholds).ok).toBe(true);
  });
  it("one failing suite fails the gate", () => expect(evaluateGate([report("a", 1, 0), report("b", 0.1, 0)], thresholds).ok).toBe(false));
  it("allows exactly-at-threshold values", () => expect(evaluateGate([report("a", 0.8, 0.2)], thresholds).ok).toBe(true));
});

describe("renderMarkdown", () => {
  it("includes status and suites", () => {
    const reports = [report("a", 0.9, 0), report("b", 0.5, 0)];
    const md = renderMarkdown(reports, evaluateGate(reports, thresholds));
    expect(md).toContain("FAILED");
    expect(md).toContain("| a |");
    expect(md).toContain("| b |");
  });
});
