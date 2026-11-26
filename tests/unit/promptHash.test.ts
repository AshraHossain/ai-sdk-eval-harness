import { describe, expect, it } from "vitest";
import { SUITES, suiteNames } from "../../evals/suites";
import { promptHash } from "../../evals/runner/prompts";
import { baselineFrom, baselineMismatch, evaluateGate, thresholdsSchema, type Baseline } from "../../evals/runner/gate";
import { render } from "../../src/lib/ai/prompt";
import type { EvalCase, Suite, SuiteReport } from "../../evals/runner/types";

const report = (over: Partial<SuiteReport> = {}): SuiteReport => ({
  suite: "rag", title: "rag", mode: "mock", runsPerCase: 5, datasetVersion: "1", datasetHash: "h", promptHash: "p1",
  model: "m", judgeModel: "j", startedAt: "", durationMs: 1, cases: [],
  usage: { model: { inputTokens: 0, outputTokens: 0 }, judge: { inputTokens: 0, outputTokens: 0 }, costUsd: 0 },
  summary: { cases: 1, passRate: 1, meanScore: 1, flakyCases: 0, flakeRate: 0, failingCases: 0, infraErrorRate: 0 },
  ...over,
});

const fakeSuite = (promptSurface: string[]): Suite<EvalCase, unknown> =>
  ({ name: "t", promptSurface }) as unknown as Suite<EvalCase, unknown>;

describe("render", () => {
  it("fills placeholders and leaves unknown ones alone", () =>
    expect(render("a {x} b {y}", { x: "1" })).toBe("a 1 b {y}"));
  it("treats $ in a value literally, not as a backreference", () =>
    expect(render("{v}", { v: "$& $1 $$" })).toBe("$& $1 $$"));
  it("does not expand a placeholder that a value introduces", () =>
    expect(render("{a}", { a: "{a}", b: "no" })).toBe("{a}"));
});

describe("promptHash", () => {
  it("is stable and 12 hex characters", () => {
    const s = fakeSuite(["system", "{user}"]);
    expect(promptHash(s)).toMatch(/^[0-9a-f]{12}$/);
    expect(promptHash(s)).toBe(promptHash(fakeSuite(["system", "{user}"])));
  });
  it("changes when any prompt or rubric changes", () => {
    const base = promptHash(fakeSuite(["system", "{user}", "rubric"]));
    expect(promptHash(fakeSuite(["system.", "{user}", "rubric"]))).not.toBe(base);
    expect(promptHash(fakeSuite(["system", "{user}!", "rubric"]))).not.toBe(base);
    expect(promptHash(fakeSuite(["system", "{user}", "rubric2"]))).not.toBe(base);
  });
  it("cannot collide by moving a boundary between parts", () =>
    expect(promptHash(fakeSuite(["ab", "c"]))).not.toBe(promptHash(fakeSuite(["a", "bc"]))));
  it("rejects a suite that declares no prompts", () =>
    expect(() => promptHash(fakeSuite([]))).toThrow(/empty promptSurface/));
});

describe("every real suite", () => {
  it("declares a non-empty prompt surface with no blank entries", () => {
    for (const s of SUITES) {
      expect(s.promptSurface.length, s.name).toBeGreaterThan(0);
      for (const part of s.promptSurface) expect(part.trim(), s.name).not.toBe("");
    }
  });
  it("has a distinct prompt hash per suite", () => {
    const hashes = SUITES.map(promptHash);
    expect(new Set(hashes).size).toBe(suiteNames.length);
  });
});

describe("baseline prompt tracking", () => {
  const thresholds = thresholdsSchema.parse({ default: { minPassRate: 0.8, maxFlakeRate: 0.2 } });

  it("records the prompt hash it was taken at", () =>
    expect(baselineFrom([report()]).suites.rag!.promptHash).toBe("p1"));

  it("skips the regression check when prompts changed", () => {
    const baseline = baselineFrom([report()]);
    const gate = evaluateGate([report({ promptHash: "p2", summary: { ...report().summary, passRate: 0.5 } })], thresholds, baseline);
    expect(baselineMismatch(report({ promptHash: "p2" }), baseline)).toBe("prompts changed since baseline");
    expect(gate.notes.join(" ")).toContain("prompts changed since baseline");
    expect(gate.results[0]!.regression).toBeUndefined();
  });

  it("still compares when the prompt hash is unchanged", () => {
    const gate = evaluateGate([report()], thresholds, baselineFrom([report()]));
    expect(gate.results[0]!.regression).toBe(0);
  });

  it("skips the prompt check for a baseline recorded before prompt hashing", () => {
    const old = baselineFrom([report()]);
    const without: Baseline = { ...old, suites: { rag: { ...old.suites.rag!, promptHash: undefined } } };
    expect(baselineMismatch(report({ promptHash: "anything" }), without)).toBeUndefined();
  });
});
