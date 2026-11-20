import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { APICallError } from "ai";
import { MockLanguageModelV3 } from "ai/test";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { calibrate, loadCalibrationSet, type CalibrationItem } from "../../evals/calibration/calibrate";
import { createMockJudge } from "../../evals/mock/mockModel";
import { resolveModel } from "../../evals/models";
import { baselineFrom, baselineMismatch, gatedRates, type Baseline } from "../../evals/runner/gate";
import { loadBaseline, loadDataset } from "../../evals/runner/load";
import { flakyScorers, runSuite } from "../../evals/runner/runner";
import type { RunReport, Suite, SuiteReport } from "../../evals/runner/types";
import { notContains } from "../../evals/scorers/deterministic";
import { llmJudge } from "../../evals/scorers/judge";

const failing = (err: unknown) => new MockLanguageModelV3({ doGenerate: async () => { throw err; } });

const report = (over: Partial<SuiteReport> = {}): SuiteReport => ({
  suite: "rag", title: "rag", mode: "mock", runsPerCase: 5, datasetVersion: "1", datasetHash: "h", promptHash: "p", model: "m", judgeModel: "j",
  usage: { model: { inputTokens: 0, outputTokens: 0 }, judge: { inputTokens: 0, outputTokens: 0 }, costUsd: 0 },
  startedAt: "", durationMs: 1, cases: [],
  summary: { cases: 0, passRate: 1, meanScore: 1, flakyCases: 0, flakeRate: 0, failingCases: 0, infraErrorRate: 0 },
  ...over,
});

const saved = process.env.EVAL_MODE;
afterEach(() => {
  if (saved === undefined) delete process.env.EVAL_MODE;
  else process.env.EVAL_MODE = saved;
});

describe("resolveModel: first-party providers", () => {
  it("resolves anthropic and openai specs", () => {
    expect(resolveModel("anthropic:claude-haiku-5-5")).toMatchObject({ modelId: "claude-haiku-5-5" });
    expect(resolveModel("openai:gpt-x")).toMatchObject({ modelId: "gpt-x" });
  });
});

describe("notContains", () => {
  it("passes with no detail when no forbidden text is present", () =>
    expect(notContains("nc", "clean text", ["secret"])).toEqual({ name: "nc", score: 1, pass: true }));
});

describe("llmJudge infra attribution", () => {
  it("marks a 5xx provider error as infra", async () => {
    // Not retryable, so the SDK does not back off and retry; the 5xx status alone makes it infra.
    const err = new APICallError({ message: "overloaded", url: "https://api", requestBodyValues: {}, statusCode: 503, isRetryable: false });
    const r = await llmJudge(failing(err), { name: "q", rubric: "r" }, { input: "i", output: "o" });
    expect(r).toMatchObject({ pass: false, score: 0, infra: true });
  });
});

describe("mock judge prompt extraction", () => {
  it("ignores non-text prompt parts", async () => {
    const r = await createMockJudge().doGenerate({
      prompt: [{ role: "user", content: [{ type: "file", data: "AAAA", mediaType: "image/png" }, { type: "text", text: "REFERENCE: a\nOUTPUT: a" }] }],
    });
    expect(r.content[0]).toMatchObject({ type: "text" });
  });
});

describe("calibration errors", () => {
  it("names the line of an invalid calibration item", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "cal-"));
    await mkdir(path.join(dir, "calibration"));
    await writeFile(path.join(dir, "calibration", "judge-calibration.jsonl"), '{"id":"x"}\n');
    await expect(loadCalibrationSet(dir)).rejects.toThrow(/judge-calibration\.jsonl:1/);
  });
  it("fails instead of scoring a judge that errors", async () => {
    const item: CalibrationItem = { id: "c1", name: "n", rubric: "r", input: "i", reference: "r", output: "o", humanScore: 3 };
    await expect(calibrate(failing(new Error("boom")), [item])).rejects.toThrow(/c1: judge error/);
  });
});

describe("gate edge cases", () => {
  const caseReport = (id: string) => ({ id, runs: [], passRate: 1, meanScore: 1, scoredRuns: 1, flaky: false, stability: "stable-pass" }) as unknown as SuiteReport["cases"][number];
  it("reports a zero flake rate when every case is quarantined", () => {
    const r = gatedRates(report({ cases: [caseReport("r1")] }), ["rag/r1"]);
    expect(r).toMatchObject({ flakeRate: 0, quarantined: ["r1"], gated: [] });
  });
  it("explains a baseline that lacks the suite", () => {
    const b: Baseline = { mode: "mock", model: "m", judgeModel: "j", suites: {} } as unknown as Baseline;
    expect(baselineMismatch(report(), b)).toBe("no baseline for this suite");
  });
  it("refuses to baseline zero reports", () => expect(() => baselineFrom([])).toThrow(/No reports/));
});

describe("dataset loading", () => {
  it("rejects a suite missing from the manifest", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "ds-"));
    await mkdir(path.join(dir, "datasets"));
    await writeFile(path.join(dir, "datasets", "manifest.json"), "{}");
    const suite = { name: "ghost" } as unknown as Suite<{ id: string }, unknown>;
    await expect(loadDataset(suite, dir)).rejects.toThrow(/No dataset in manifest for suite "ghost"/);
  });
  it("treats a missing baseline file as no baseline", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "bl-"));
    expect(await loadBaseline("live", dir)).toBeUndefined();
  });
});

describe("runner fallbacks", () => {
  const caseSchema = z.object({ id: z.string() });
  const meta = { mode: "mock" as const, datasetVersion: "1", datasetHash: "h", promptHash: "p", model: "m", judgeModel: "j" };
  it("records non-Error throws as strings", async () => {
    const suite: Suite<{ id: string }, string> = {
      name: "t", title: "t", description: "t", caseSchema, promptSurface: ["sys", "{x}"],
      run: async () => { throw "plain string"; },
      score: async () => [],
    };
    const r = await runSuite({ suite, cases: [{ id: "a" }], runs: 1, judge: createMockJudge(), meta, modelFor: () => failing("x") });
    expect(r.cases[0]!.runs[0]!.error).toBe("plain string");
  });
  it("summarizes an empty case list as zero rates", async () => {
    const suite = { name: "t", title: "t", description: "t", caseSchema, promptSurface: ["sys"], run: async () => "", score: async () => [] } as Suite<{ id: string }, string>;
    const r = await runSuite({ suite, cases: [], runs: 2, judge: createMockJudge(), meta, modelFor: () => failing("x") });
    expect(r.summary).toMatchObject({ cases: 0, flakeRate: 0, infraErrorRate: 0 });
  });
  it("treats a scorer missing from one run as a failed verdict", () => {
    const run = (pass: boolean, withScore: boolean) =>
      ({ run: 0, pass, scores: withScore ? [{ name: "s", score: 1, pass: true }] : [], durationMs: 1 }) as unknown as RunReport;
    expect(flakyScorers([run(true, true), run(false, false)])).toEqual(["s"]);
  });
});
