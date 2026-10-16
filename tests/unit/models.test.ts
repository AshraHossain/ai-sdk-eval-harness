import { afterEach, describe, expect, it } from "vitest";
import { assertLiveKeys, parseSpec, resolveModel } from "../../evals/models";

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

describe("parseSpec", () => {
  it("routes bare router-style ids (provider/model) to bynara", () =>
    expect(parseSpec("openai/laguna-s-2.1")).toEqual({ provider: "bynara", id: "openai/laguna-s-2.1" }));
  it("keeps slashes in the model id after an explicit provider", () =>
    expect(parseSpec("bynara:openai/laguna-s-2.1")).toEqual({ provider: "bynara", id: "openai/laguna-s-2.1" }));
  it("defaults bare names to anthropic", () => expect(parseSpec("claude-haiku-5-5").provider).toBe("anthropic"));
  it("needs BYNARA_API_KEY for a bare router id", () => {
    delete process.env.BYNARA_API_KEY;
    expect(() => assertLiveKeys(["openai/laguna-s-2.1"])).toThrow(/BYNARA_API_KEY/);
  });
});

describe("assertLiveKeys", () => {
  it("requires BYNARA_API_KEY for bynara models", () => {
    delete process.env.BYNARA_API_KEY;
    expect(() => assertLiveKeys(["bynara:m"])).toThrow(/BYNARA_API_KEY/);
    process.env.BYNARA_API_KEY = "test";
    expect(() => assertLiveKeys(["bynara:m"])).not.toThrow();
  });
});
