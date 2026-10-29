import { APICallError } from "ai";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { flakyScorers, runSuite } from "../../evals/runner/runner";
import { createFixtureModel, createMockJudge } from "../../evals/mock/mockModel";
import { summarize } from "../../src/lib/ai/summarize";
import { exactMatch } from "../../evals/scorers/deterministic";
import type { Suite } from "../../evals/runner/types";

const caseSchema = z.object({ id: z.string(), expected: z.string() });
type Case = z.infer<typeof caseSchema>;
const suite: Suite<Case, string> = {
  name: "t", title: "t", description: "t", caseSchema,
  run: (model, c) => summarize(model, { text: c.id, maxWords: 5 }),
  score: async ({ case: c, output }) => [exactMatch("eq", output, c.expected)],
};
const cases: Case[] = [{ id: "stable", expected: "ok" }, { id: "flaky", expected: "ok" }, { id: "broken", expected: "ok" }];
const fixtures: Record<string, string[]> = { stable: ["ok"], flaky: ["ok", "bad", "ok", "ok"], broken: ["bad"] };
const meta = { mode: "mock" as const, datasetVersion: "1", datasetHash: "h", model: "m", judgeModel: "j" };

describe("runSuite", () => {
  it("runs each case N times and flags flaky / failing cases", async () => {
    const report = await runSuite({
      suite, cases, runs: 4, judge: createMockJudge(), meta,
      modelFor: (c, run) => createFixtureModel(fixtures[c.id]![run % fixtures[c.id]!.length]!),
    });
    const by = Object.fromEntries(report.cases.map((c) => [c.id, c]));
    expect(by.stable).toMatchObject({ passRate: 1, flaky: false });
    expect(by.flaky).toMatchObject({ passRate: 0.75, flaky: true });
    expect(by.broken).toMatchObject({ passRate: 0, flaky: false });
    expect(by.flaky!.runs).toHaveLength(4);
    expect(report.summary).toMatchObject({ cases: 3, flakyCases: 1, failingCases: 1 });
    expect(report.summary.passRate).toBeCloseTo((1 + 0.75 + 0) / 3, 3);
    expect(report.summary.flakeRate).toBeCloseTo(1 / 3, 3);
  });

  it("records provider errors as failed runs instead of aborting", async () => {
    const report = await runSuite({
      suite, cases: [cases[0]!], runs: 2, judge: createMockJudge(), meta,
      modelFor: () => { throw new Error("boom"); },
    });
    expect(report.cases[0]!.passRate).toBe(0);
    expect(report.cases[0]!.runs[0]!.error).toBe("boom");
  });

  it("preserves case order", async () => {
    const report = await runSuite({
      suite, cases, runs: 1, judge: createMockJudge(), meta, concurrency: 3,
      modelFor: () => createFixtureModel("ok"),
    });
    expect(report.cases.map((c) => c.id)).toEqual(["stable", "flaky", "broken"]);
  });

  it("keeps infrastructure errors out of pass rates and flaky detection", async () => {
    const rateLimited = () => new APICallError({ message: "rate limited", url: "https://api", requestBodyValues: {}, statusCode: 429, isRetryable: true });
    const report = await runSuite({
      suite, cases: [cases[0]!, cases[2]!], runs: 3, judge: createMockJudge(), meta,
      modelFor: (c, run) => {
        if (c.id === "broken" || run === 1) throw rateLimited();
        return createFixtureModel("ok");
      },
    });
    const [stable, broken] = report.cases;
    expect(stable).toMatchObject({ passRate: 1, scoredRuns: 2, stability: "stable-pass", flaky: false });
    expect(stable!.runs[1]!.infra).toBe(true);
    expect(broken).toMatchObject({ scoredRuns: 0, stability: "inconclusive", flaky: false });
    expect(report.summary.infraErrorRate).toBeCloseTo(4 / 6, 3);
    expect(report.summary.passRate).toBe(1);
    expect(report.summary.failingCases).toBe(0);
  });

  it("adds a Wilson interval and names the scorer that flipped", async () => {
    const report = await runSuite({
      suite, cases: [cases[1]!], runs: 4, judge: createMockJudge(), meta,
      modelFor: (c, run) => createFixtureModel(fixtures[c.id]![run % fixtures[c.id]!.length]!),
    });
    const c = report.cases[0]!;
    expect(c.stability).toBe("flaky");
    expect(c.flakyScorers).toEqual(["eq"]);
    expect(c.ci95.low).toBeLessThan(0.75);
    expect(c.ci95.high).toBeGreaterThan(0.75);
  });

  it("rejects a non-integer concurrency", async () => {
    await expect(runSuite({ suite, cases, runs: 1, judge: createMockJudge(), meta, concurrency: Number.NaN, modelFor: () => createFixtureModel("ok") })).rejects.toThrow(RangeError);
  });
});

describe("flakyScorers", () => {
  it("attributes intermittent exceptions to execution", () => {
    const ok = { run: 0, pass: true, score: 1, scores: [{ name: "eq", score: 1, pass: true }], latencyMs: 1 };
    const threw = { run: 1, pass: false, score: 0, scores: [], error: "could not parse", latencyMs: 1 };
    expect(flakyScorers([ok, threw])).toEqual(["execution", "eq"]);
    expect(flakyScorers([ok, ok])).toEqual([]);
  });
});
