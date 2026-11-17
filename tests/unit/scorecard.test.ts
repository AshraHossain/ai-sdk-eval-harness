import { describe, expect, it } from "vitest";
import { evaluateGate, thresholdsSchema, type Baseline } from "../../evals/runner/gate";
import { renderMarkdown } from "../../evals/runner/markdown";
import { buildScorecard, percentile, renderScorecard, scorerRate } from "../../evals/runner/scorecard";
import type { CaseReport, RunReport, SuiteReport } from "../../evals/runner/types";
import type { ScoreResult } from "../../evals/scorers/types";

const run = (latencyMs: number, scores: ScoreResult[], infra = false): RunReport => ({ run: 0, pass: true, score: 1, scores, latencyMs, ...(infra ? { infra } : {}) });
const kase = (id: string, runs: RunReport[], extra: Partial<CaseReport> = {}): CaseReport => ({
  id, scoredRuns: runs.length, passRate: 1, ci95: { low: 0.5, high: 1 }, stability: "stable-pass", flakyScorers: [], meanScore: 1, scoreStdev: 0, flaky: false, runs, ...extra,
});
const suite = (name: string, cases: CaseReport[], passRate = 1): SuiteReport => ({
  suite: name, title: name, mode: "mock", runsPerCase: 2, datasetVersion: "1", datasetHash: "h", model: "m", judgeModel: "j", startedAt: "", durationMs: 1, cases,
  summary: { cases: cases.length, passRate, meanScore: passRate, flakyCases: 0, flakeRate: 0, failingCases: 0, infraErrorRate: 0 },
});
const s = (name: string, pass: boolean, score = pass ? 1 : 0, infra = false): ScoreResult => ({ name, pass, score, ...(infra ? { infra } : {}) });

describe("percentile (nearest rank)", () => {
  it("handles empty, single and ordered inputs", () => {
    expect(percentile([], 50)).toBe(0);
    expect(percentile([7], 95)).toBe(7);
    const xs = [5, 1, 4, 2, 3, 10, 9, 8, 7, 6];
    expect(percentile(xs, 50)).toBe(5);
    expect(percentile(xs, 95)).toBe(10);
    expect(percentile(xs, 0)).toBe(1);
  });
});

describe("buildScorecard", () => {
  const rag = suite("rag", [
    kase("r1", [run(10, [s("citations", false, 0.5), s("judge:faithfulness", true), s("abstention", true)]), run(30, [s("citations", true), s("judge:faithfulness", false), s("abstention", true)])]),
    kase("r2", [run(20, [s("abstention", false), s("no-citations", true)]), run(999, [s("abstention", false)], true)]),
  ], 0.5);
  const agent = suite("agent", [kase("a1", [run(40, [s("tool-calls", true), s("tool-calls", false, 0, true)])])]);

  it("derives retrieval, grounding, guardrail and tool metrics from scorer results", () => {
    const card = buildScorecard([rag, agent]);
    expect(card.citationRecall).toBe(0.75);
    expect(card.groundingRate).toBe(0.5);
    // abstention: pass, pass, fail (+ no-citations pass); the infra run is excluded.
    expect(card.guardrailPassRate).toBe(0.75);
    expect(card.toolCallAccuracy).toBe(1);
    expect(card.passRate).toBe(0.75);
    expect(card.latencyMs).toEqual({ p50: 20, p95: 40 });
    expect(card.suites.map((x) => x.suite)).toEqual(["rag", "agent"]);
  });

  it("reports n/a when a suite was not run", () => {
    const card = buildScorecard([agent]);
    expect(card.citationRecall).toBeNull();
    expect(renderScorecard(card)).toContain("| Citation recall (Recall@k, rag) | n/a |");
    expect(scorerRate([agent], "agent", ["missing"])).toBeNull();
  });

  it("is well-defined for no reports", () => {
    expect(buildScorecard([])).toMatchObject({ mode: "mock", runsPerCase: 0, passRate: 0, latencyMs: { p50: 0, p95: 0 } });
  });

  it("renders a markdown table", () => {
    const md = renderScorecard(buildScorecard([rag, agent]));
    expect(md).toContain("### Scorecard (mock, N=2)");
    expect(md).toContain("| Grounding rate (faithfulness judge, rag) | 50.0% |");
    expect(md).toContain("| Latency p50 / p95 per run | 20 ms / 40 ms |");
  });
});

describe("renderMarkdown branches", () => {
  const thresholds = thresholdsSchema.parse({ default: { minPassRate: 0.5, maxFlakeRate: 1 }, quarantine: ["rag/r2"] });
  it("lists flaky, failing and quarantined cases plus gate notes and infra errors", () => {
    const flaky = kase("r1", [], { flaky: true, passRate: 0.6, stability: "flaky", flakyScorers: ["citations"], ci95: { low: 0.2, high: 0.9 } });
    const failing = kase("r2", [], { stability: "stable-fail", passRate: 0 });
    const plain = kase("r3", [], { flaky: true, passRate: 0.4, stability: "flaky" });
    const r = { ...suite("rag", [flaky, failing, plain], 0.6), runsPerCase: 1 };
    const withInfra = { ...r, summary: { ...r.summary, infraErrorRate: 0.1 } };
    // Different dataset hash: the regression check is skipped and a note explains why.
    const baseline: Baseline = { updatedAt: "", mode: "mock", model: "m", judgeModel: "j", suites: { rag: { datasetHash: "old", runsPerCase: 1, passRate: 0.5, cases: {} } } };
    const md = renderMarkdown([withInfra], evaluateGate([withInfra], thresholds, baseline));
    expect(md).toContain("**Flaky:** rag/r1 (60.0%, 95% CI 20.0%–90.0%, unstable: citations), rag/r3");
    expect(md).toContain("**Always failing:** rag/r2");
    expect(md).toContain("**Quarantined (reported, not gated):** rag/r2");
    expect(md).toMatch(/> rag: regression check skipped/);
    expect(md).toContain("| 10.0% |");
  });

  it("renders an empty run without crashing", () => {
    expect(renderMarkdown([], evaluateGate([], thresholds))).toContain("Mode: `mock` · runs/case: -");
  });
});
