import { MockLanguageModelV3 } from "ai/test";
import { describe, expect, it } from "vitest";
import { buildJudgePrompt, llmJudge } from "../../evals/scorers/judge";
import { createMockJudge } from "../../evals/mock/mockModel";

const fixed = (text: string) =>
  new MockLanguageModelV3({
    doGenerate: async () => ({
      content: [{ type: "text", text }],
      finishReason: { unified: "stop", raw: "stop" },
      usage: { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 1, reasoning: 0 } },
      warnings: [],
    }),
  });

const opts = { name: "quality", rubric: "be good" };

describe("llmJudge", () => {
  it("normalizes a 1-5 score to 0..1 and passes at >= minScore (default 4)", async () => {
    const r = await llmJudge(fixed('{"score":4,"rationale":"ok"}'), opts, { input: "i", output: "o" });
    expect(r).toMatchObject({ name: "judge:quality", score: 0.75, pass: true });
    expect(r.detail).toContain("4/5");
  });
  it("fails below minScore", async () => {
    const r = await llmJudge(fixed('{"score":3,"rationale":"meh"}'), opts, { input: "i", output: "o" });
    expect(r.pass).toBe(false);
  });
  it("honours a custom minScore", async () => {
    const r = await llmJudge(fixed('{"score":3,"rationale":"meh"}'), { ...opts, minScore: 3 }, { input: "i", output: "o" });
    expect(r.pass).toBe(true);
  });
  it("turns an invalid judge response into a failed score, not a crash", async () => {
    const r = await llmJudge(fixed('{"score":9,"rationale":"x"}'), opts, { input: "i", output: "o" });
    expect(r.pass).toBe(false);
    expect(r.detail).toContain("judge error");
  });
  it("includes rubric, reference and output in the prompt", () => {
    const p = buildJudgePrompt(opts, { input: "in", output: "out", reference: "ref" });
    expect(p).toContain("be good");
    expect(p).toContain("REFERENCE:\nref");
    expect(p).toContain("OUTPUT:\nout");
  });
});

describe("mock judge", () => {
  const score = async (reference: string, output: string) =>
    (await llmJudge(createMockJudge(), opts, { input: "q", reference, output })).score;
  it("is deterministic", async () => expect(await score("alpha beta gamma", "alpha beta")).toBe(await score("alpha beta gamma", "alpha beta")));
  it("scores full coverage highest and no coverage lowest", async () => {
    expect(await score("alpha beta gamma", "gamma beta alpha")).toBe(1);
    expect(await score("alpha beta gamma", "zzz yyy")).toBe(0);
  });
});
