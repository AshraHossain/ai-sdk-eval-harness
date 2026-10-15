import { afterEach, describe, expect, it } from "vitest";
import { assertLiveKeys, resolveModel } from "../../evals/models";

const KEYS = ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "BYNARA_API_KEY"] as const;
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("resolveModel", () => {
  it("resolves bynara models via an OpenAI-compatible client", () => {
    const m = resolveModel("bynara:some-model");
    expect(m).toMatchObject({ modelId: "some-model" });
    expect((m as { provider: string }).provider).toContain("bynara");
  });
  it("rejects unknown providers", () => expect(() => resolveModel("banana:x")).toThrow(/Unknown provider/));
});

describe("assertLiveKeys", () => {
  it("requires BYNARA_API_KEY for bynara models", () => {
    delete process.env.BYNARA_API_KEY;
    expect(() => assertLiveKeys(["bynara:m"])).toThrow(/BYNARA_API_KEY/);
    process.env.BYNARA_API_KEY = "test";
    expect(() => assertLiveKeys(["bynara:m"])).not.toThrow();
  });
});
