import { describe, expect, it } from "vitest";
import { executeSuite } from "../../evals/runner/execute";
import { suiteNames } from "../../evals/suites";
import { evaluateGate } from "../../evals/runner/gate";
import { loadBaseline, loadThresholds } from "../../evals/runner/load";
import { applyFault, MOCK_FAULTS, mockFaultNames } from "../../evals/mock/faults";

describe("offline eval of the real suites", () => {
  it("is deterministic across invocations", async () => {
    const strip = (r: Awaited<ReturnType<typeof executeSuite>>) => JSON.stringify({ ...r, startedAt: 0, durationMs: 0, cases: r.cases.map((c) => ({ ...c, runs: c.runs.map((x) => ({ ...x, latencyMs: 0 })) })) });
    const a = await executeSuite({ suite: "extract", runs: 5, mode: "mock" });
    const b = await executeSuite({ suite: "extract", runs: 5, mode: "mock" });
    expect(strip(a)).toBe(strip(b));
  });

  it("passes the committed gate and surfaces the seeded flaky/failing cases", async () => {
    const reports = await Promise.all(suiteNames.map((suite) => executeSuite({ suite, runs: 5, mode: "mock" })));
    expect(evaluateGate(reports, await loadThresholds()).ok).toBe(true);
    const flaky = reports.flatMap((r) => r.cases.filter((c) => c.flaky).map((c) => `${r.suite}/${c.id}`));
    expect(flaky.sort()).toEqual(["extract/e04", "rag/r06", "summarize/s05"]);
    const classify = reports.find((r) => r.suite === "classify")!;
    expect(classify.cases.find((c) => c.id === "c06")!.passRate).toBe(0);
  });

  it("fails the gate when thresholds are tightened", async () => {
    const reports = [await executeSuite({ suite: "classify", runs: 5, mode: "mock" })];
    const t = await loadThresholds();
    expect(evaluateGate(reports, { ...t, suites: { classify: { minPassRate: 0.95 } } }).ok).toBe(false);
  });

  it("refuses live mode without API keys", async () => {
    const saved = { a: process.env.ANTHROPIC_API_KEY, o: process.env.OPENAI_API_KEY };
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      await expect(executeSuite({ suite: "classify", runs: 1, mode: "live" })).rejects.toThrow(/ANTHROPIC_API_KEY/);
    } finally {
      if (saved.a) process.env.ANTHROPIC_API_KEY = saved.a;
      if (saved.o) process.env.OPENAI_API_KEY = saved.o;
    }
  });

  it("matches the committed mock baseline", async () => {
    const reports = await Promise.all(suiteNames.map((suite) => executeSuite({ suite, runs: 5, mode: "mock" })));
    const gate = evaluateGate(reports, await loadThresholds(), await loadBaseline("mock"));
    expect(gate.ok).toBe(true);
    expect(gate.results.every((g) => g.regression === 0)).toBe(true);
  });

  it.each(mockFaultNames)("injected fault %s fails the gate", async (fault) => {
    const { suite } = MOCK_FAULTS[fault];
    const reports = [await executeSuite({ suite, runs: 5, mode: "mock", fault })];
    const gate = evaluateGate(reports, await loadThresholds(), await loadBaseline("mock"));
    expect(gate.ok).toBe(false);
    expect(gate.results[0]!.failures.join(" ")).toMatch(/pass rate|newly failing|regressed/);
  });

  it("only touches the targeted suite and rejects unknown faults", () => {
    expect(applyFault("rag-no-citations", "classify", { label: "billing" })).toEqual({ label: "billing" });
    expect(() => applyFault("nope", "rag", {})).toThrow(/Unknown EVAL_MOCK_FAULT/);
  });
});
