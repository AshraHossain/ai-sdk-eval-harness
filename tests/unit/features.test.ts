import { describe, expect, it } from "vitest";
import { runAgent } from "../../src/lib/ai/agent";
import { classifyTicket } from "../../src/lib/ai/classify";
import { extractInvoice } from "../../src/lib/ai/extract";
import { groundedQa } from "../../src/lib/ai/groundedQa";
import { summarize } from "../../src/lib/ai/summarize";
import { createFixtureModel } from "../../evals/mock/mockModel";

describe("AI features against fixture models", () => {
  it("summarize returns trimmed text", async () => expect(await summarize(createFixtureModel("  short.  "), { text: "x", maxWords: 5 })).toBe("short."));
  it("classify returns a validated object", async () =>
    expect(await classifyTicket(createFixtureModel({ label: "billing", confidence: 0.9 }), { text: "x" })).toEqual({ label: "billing", confidence: 0.9 }));
  it("classify rejects an off-enum label", async () =>
    await expect(classifyTicket(createFixtureModel({ label: "spam", confidence: 0.9 }), { text: "x" })).rejects.toThrow());
  it("extract validates structured output", async () => {
    const inv = { vendor: "A", total: 1.5, currency: "USD", dueDate: null };
    expect(await extractInvoice(createFixtureModel(inv), { text: "x" })).toEqual(inv);
  });
  it("grounded QA returns citations", async () => {
    const out = { answerable: true, answer: "30 days", citations: ["d1"] };
    expect(await groundedQa(createFixtureModel(out), { question: "q", documents: [{ id: "d1", text: "t" }] })).toEqual(out);
  });
  it("agent executes tools across steps and records calls", async () => {
    const model = createFixtureModel({
      steps: [{ toolCalls: [{ name: "getWeather", args: { city: "Paris" } }] }, { text: "18C and cloudy" }],
    });
    const r = await runAgent(model, { task: "weather in Paris?" });
    expect(r.toolCalls).toEqual([{ name: "getWeather", args: { city: "Paris" } }]);
    expect(r.text).toBe("18C and cloudy");
  });
});
