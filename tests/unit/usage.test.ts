import { MockLanguageModelV3 } from "ai/test";
import { generateText } from "ai";
import { describe, expect, it } from "vitest";
import { addCosts, createUsageMeter, estimateCostUsd, NO_TOKENS, type Prices } from "../../evals/runner/usage";
import { executeSuite } from "../../evals/runner/execute";
import { evaluateGate, thresholdsSchema } from "../../evals/runner/gate";
import { buildScorecard, formatCost, formatTokens } from "../../evals/runner/scorecard";
import { loadPrices } from "../../evals/runner/load";
import type { SuiteReport } from "../../evals/runner/types";

const model = (inputTokens: number, outputTokens: number) =>
  new MockLanguageModelV3({
    doGenerate: async () => ({
      content: [{ type: "text", text: "hi" }],
      finishReason: { unified: "stop", raw: "stop" },
      usage: {
        inputTokens: { total: inputTokens, noCache: inputTokens, cacheRead: 0, cacheWrite: 0 },
        outputTokens: { total: outputTokens, text: outputTokens, reasoning: 0 },
      },
      warnings: [],
    }),
  });

const prices: Prices = { "p:m": { inputPer1MUsd: 3, outputPer1MUsd: 15 } };

describe("createUsageMeter", () => {
  it("counts tokens across calls without changing the model's output", async () => {
    const meter = createUsageMeter();
    const metered = meter.meter(model(100, 10));
    const first = await generateText({ model: metered, prompt: "a" });
    expect(first.text).toBe("hi");
    expect(meter.counts()).toEqual({ inputTokens: 100, outputTokens: 10 });
    await generateText({ model: metered, prompt: "b" });
    expect(meter.counts()).toEqual({ inputTokens: 200, outputTokens: 20 });
  });

  it("counts zero for a model that reports no token totals", async () => {
    const meter = createUsageMeter();
    const noUsage = new MockLanguageModelV3({
      doGenerate: async () => ({
        content: [{ type: "text", text: "x" }],
        finishReason: { unified: "stop", raw: "stop" },
        usage: {
          inputTokens: { total: undefined, noCache: undefined, cacheRead: undefined, cacheWrite: undefined },
          outputTokens: { total: undefined, text: undefined, reasoning: undefined },
        },
        warnings: [],
      }),
    });
    await generateText({ model: meter.meter(noUsage), prompt: "a" });
    expect(meter.counts()).toEqual(NO_TOKENS);
  });

  it("passes a model-id string through instead of wrapping it", () => {
    const meter = createUsageMeter();
    expect(meter.meter("openai/gpt-x")).toBe("openai/gpt-x");
  });

  it("keeps separate meters independent, as concurrent runs need", async () => {
    const a = createUsageMeter();
    const b = createUsageMeter();
    await generateText({ model: a.meter(model(5, 1)), prompt: "a" });
    expect(a.counts()).toEqual({ inputTokens: 5, outputTokens: 1 });
    expect(b.counts()).toEqual(NO_TOKENS);
  });
});

describe("cost estimation", () => {
  it("prices input and output tokens per million", () =>
    expect(estimateCostUsd("p:m", { inputTokens: 1_000_000, outputTokens: 200_000 }, prices)).toBeCloseTo(3 + 3, 6));
  it("returns null for a model with no price entry", () =>
    expect(estimateCostUsd("unknown:model", { inputTokens: 1000, outputTokens: 1000 }, prices)).toBeNull());
  it("treats an unknown part of a total as unknown, not zero", () => {
    expect(addCosts(1, 2)).toBe(3);
    expect(addCosts(1, null)).toBeNull();
    expect(addCosts(null, 1)).toBeNull();
  });
  it("formats tokens compactly and labels unpriced runs", () => {
    expect(formatTokens({ inputTokens: 1200, outputTokens: 24_000 })).toBe("1200 in / 24k out");
    expect(formatCost(null)).toBe("unpriced");
    expect(formatCost(0.0123)).toBe("$0.0123");
    expect(formatCost(12.5)).toBe("$12.50");
  });
});

describe("prices.json", () => {
  it("prices both mock models, so offline runs report a cost of 0 rather than unpriced", async () => {
    const loaded = await loadPrices();
    expect(loaded["mock-fixture"]).toEqual({ inputPer1MUsd: 0, outputPer1MUsd: 0 });
    expect(loaded["mock-judge"]).toEqual({ inputPer1MUsd: 0, outputPer1MUsd: 0 });
  });
});

describe("usage in a real offline run", () => {
  it("records tokens for the suite and the judge, and a zero cost", async () => {
    const r = await executeSuite({ suite: "classify", runs: 2, mode: "mock" });
    expect(r.usage.model.inputTokens).toBeGreaterThan(0);
    expect(r.usage.costUsd).toBe(0);
    expect(r.cases[0]!.runs[0]!.usage!.model.inputTokens).toBeGreaterThan(0);
    // classify scores deterministically, so it never calls the judge.
    expect(r.usage.judge).toEqual(NO_TOKENS);
    const rag = await executeSuite({ suite: "rag", runs: 1, mode: "mock" });
    expect(rag.usage.judge.inputTokens).toBeGreaterThan(0);
    expect(buildScorecard([r, rag]).costUsd).toBe(0);
  });

  it("fails the gate when a suite run exceeds its cost budget", async () => {
    const r = await executeSuite({ suite: "classify", runs: 1, mode: "mock" });
    const over = { ...r, usage: { ...r.usage, costUsd: 4.2 } };
    const thresholds = thresholdsSchema.parse({ default: { minPassRate: 0.5, maxFlakeRate: 1, maxCostUsd: 1 } });
    const gate = evaluateGate([over], thresholds);
    expect(gate.ok).toBe(false);
    expect(gate.results[0]!.failures.join(" ")).toContain("cost $4.20 > budget $1.00");
  });

  it("never trips the budget when the model is unpriced", async () => {
    const r = await executeSuite({ suite: "classify", runs: 1, mode: "mock" });
    const unpriced = { ...r, usage: { ...r.usage, costUsd: null } };
    const thresholds = thresholdsSchema.parse({ default: { minPassRate: 0.5, maxFlakeRate: 1, maxCostUsd: 0.000001 } });
    expect(evaluateGate([unpriced], thresholds).ok).toBe(true);
  });

  it("reports an unpriced total when any suite is unpriced", async () => {
    const r = await executeSuite({ suite: "classify", runs: 1, mode: "mock" });
    expect(buildScorecard([{ ...r, usage: { ...r.usage, costUsd: null } }]).costUsd).toBeNull();
  });

  it("reads a report written before usage was recorded as zero tokens and unknown cost", async () => {
    const r = await executeSuite({ suite: "classify", runs: 1, mode: "mock" });
    const legacy: Record<string, unknown> = { ...r };
    delete legacy.usage;
    const card = buildScorecard([legacy as unknown as SuiteReport]);
    expect(card.tokens).toEqual({ model: NO_TOKENS, judge: NO_TOKENS });
    expect(card.costUsd).toBeNull();
  });
});
