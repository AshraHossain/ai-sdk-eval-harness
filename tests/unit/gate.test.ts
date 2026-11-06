import { describe, expect, it } from "vitest";
import { baselineFrom, evaluateGate, limitsFor, thresholdsSchema, type Baseline } from "../../evals/runner/gate";
import { renderMarkdown } from "../../evals/runner/markdown";
import type { CaseReport, SuiteReport } from "../../evals/runner/types";
import { loadThresholds } from "../../evals/runner/load";

const report = (suite: string, passRate: number, flakeRate: number): SuiteReport => ({
  suite, title: suite, mode: "mock", runsPerCase: 5, datasetVersion: "1", datasetHash: "x", model: "m", judgeModel: "j",
  startedAt: "", durationMs: 1, cases: [],
  summary: { cases: 10, passRate, meanScore: passRate, flakyCases: flakeRate * 10, flakeRate, failingCases: 0, infraErrorRate: 0 },
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

const kase = (id: string, stability: CaseReport["stability"]): CaseReport => {
  const passRate = stability === "stable-pass" ? 1 : stability === "flaky" ? 0.6 : 0;
  return { id, scoredRuns: 5, passRate, ci95: { low: 0, high: 1 }, stability, flakyScorers: [], meanScore: passRate, scoreStdev: 0, flaky: stability === "flaky", runs: [] };
};
const withCases = (suite: string, cases: CaseReport[], extra: Partial<SuiteReport> = {}): SuiteReport => {
  const passRate = cases.reduce((n, c) => n + c.passRate, 0) / cases.length;
  const flaky = cases.filter((c) => c.flaky).length;
  return {
    ...report(suite, passRate, flaky / cases.length),
    cases,
    summary: { cases: cases.length, passRate, meanScore: passRate, flakyCases: flaky, flakeRate: flaky / cases.length, failingCases: 0, infraErrorRate: 0 },
    ...extra,
  };
};
const baseline = (b: Partial<Baseline> = {}): Baseline => ({
  updatedAt: "x", mode: "mock", model: "m", judgeModel: "j",
  suites: { a: { datasetHash: "x", runsPerCase: 5, passRate: 1, cases: { c1: "stable-pass", c2: "stable-pass", c3: "stable-pass", c4: "stable-pass", c5: "stable-pass" } } },
  ...b,
});
const five = (overrides: Record<string, CaseReport["stability"]> = {}) =>
  ["c1", "c2", "c3", "c4", "c5"].map((id) => kase(id, overrides[id] ?? "stable-pass"));

describe("evaluateGate: quarantine, modes, infra", () => {
  it("leaves quarantined cases out of pass and flake rates", () => {
    const r = withCases("a", five({ c5: "flaky" }));
    const strict = thresholdsSchema.parse({ default: { minPassRate: 0.95, maxFlakeRate: 0 } });
    expect(evaluateGate([r], strict).ok).toBe(false);
    const g = evaluateGate([r], { ...strict, quarantine: ["a/c5"] });
    expect(g.ok).toBe(true);
    expect(g.results[0]).toMatchObject({ passRate: 1, flakeRate: 0, quarantined: ["c5"] });
  });

  it("rejects malformed quarantine ids", () => {
    expect(() => thresholdsSchema.parse({ default: { minPassRate: 0.8, maxFlakeRate: 0.2 }, quarantine: ["c5"] })).toThrow();
  });

  it("applies mode overrides after suite overrides", () => {
    const t = thresholdsSchema.parse({ default: { minPassRate: 0.8, maxFlakeRate: 0.2 }, suites: { a: { minPassRate: 0.9 } }, modes: { live: { maxFlakeRate: 0.5 } } });
    expect(limitsFor(t, "a", "live")).toMatchObject({ minPassRate: 0.9, maxFlakeRate: 0.5 });
    expect(limitsFor(t, "a", "mock")).toMatchObject({ minPassRate: 0.9, maxFlakeRate: 0.2 });
  });

  it("fails when too many runs hit infrastructure errors", () => {
    const r = withCases("a", five());
    r.summary.infraErrorRate = 0.3;
    const g = evaluateGate([r], thresholds);
    expect(g.ok).toBe(false);
    expect(g.results[0]!.failures[0]).toContain("infra errors");
  });

  it("notes when N=1 disables flaky detection", () => {
    expect(evaluateGate([withCases("a", five(), { runsPerCase: 1 })], thresholds).notes.join(" ")).toMatch(/N=1/);
  });
});

describe("evaluateGate: baseline regression", () => {
  it("passes within tolerance and fails beyond it", () => {
    const lenient = thresholdsSchema.parse({ default: { minPassRate: 0, maxFlakeRate: 1, maxRegression: 0.05 } });
    const slight = withCases("a", five({ c5: "flaky" }));
    slight.summary.passRate = 0.96;
    expect(evaluateGate([slight], lenient, baseline()).results[0]!.regression).toBeCloseTo(0.04, 3);
    expect(evaluateGate([slight], lenient, baseline()).ok).toBe(true);
    const big = withCases("a", five({ c4: "flaky", c5: "flaky" }));
    expect(evaluateGate([big], lenient, baseline()).results[0]!.failures.join()).toMatch(/regressed/);
  });

  it("fails on a case that went from stable-pass to stable-fail even inside the tolerance", () => {
    const lenient = thresholdsSchema.parse({ default: { minPassRate: 0, maxFlakeRate: 1, maxRegression: 1 } });
    const g = evaluateGate([withCases("a", five({ c3: "stable-fail" }))], lenient, baseline());
    expect(g.ok).toBe(false);
    expect(g.results[0]!.failures).toContain("newly failing: c3");
  });

  it("skips the comparison when mode, models or dataset differ", () => {
    const r = withCases("a", five({ c3: "stable-fail" }));
    const lenient = thresholdsSchema.parse({ default: { minPassRate: 0, maxFlakeRate: 1 } });
    for (const [b, why] of [
      [baseline({ mode: "live" }), /live mode/],
      [baseline({ model: "other" }), /models/],
      [baseline({ suites: { a: { ...baseline().suites.a!, datasetHash: "old" } } }), /dataset changed/],
    ] as const) {
      const g = evaluateGate([r], lenient, b);
      expect(g.ok).toBe(true);
      expect(g.results[0]!.regression).toBeUndefined();
      expect(g.notes.join(" ")).toMatch(why);
    }
  });

  it("builds a baseline from gated rates and merges only compatible history", () => {
    const r = withCases("a", five({ c5: "flaky" }));
    const prev = baseline({ suites: { other: { datasetHash: "y", runsPerCase: 5, passRate: 1, cases: {} } } });
    const b = baselineFrom([r], prev, ["a/c5"]);
    expect(Object.keys(b.suites).sort()).toEqual(["a", "other"]);
    expect(b.suites.a!.passRate).toBe(1);
    expect(b.suites.a!.cases.c5).toBe("flaky");
    expect(baselineFrom([r], { ...prev, model: "x" }).suites.other).toBeUndefined();
  });

  it("the committed thresholds parse", async () => {
    const t = await loadThresholds();
    expect(t.quarantine).toEqual([]);
    expect(t.modes.live?.maxRegression).toBeGreaterThan(t.default.maxRegression);
  });
});
