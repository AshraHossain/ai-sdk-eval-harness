import { anthropic } from "@ai-sdk/anthropic";
import { createOpenAI, openai } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";

export type EvalMode = "mock" | "live";

export const DEFAULT_MODEL = "anthropic:claude-haiku-5-5";
export const DEFAULT_JUDGE_MODEL = "anthropic:claude-sonnet-5-5";

export function resolveMode(value = process.env.EVAL_MODE): EvalMode {
  return value === "live" ? "live" : "mock";
}

export const BYNARA_DEFAULT_BASE_URL = "https://router.bynara.id/v1";
export const OPENROUTER_DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";
export const NIM_DEFAULT_BASE_URL = "https://integrate.api.nvidia.com/v1";

/** provider -> env var holding its API key. */
export const KEY_ENV: Record<string, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  bynara: "BYNARA_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  nim: "NVIDIA_API_KEY",
};

/** "provider:model"; a bare router-style id like "openai/laguna-s-2.1" goes to the Bynara router. */
export function parseSpec(spec: string): { provider: string; id: string } {
  const idx = spec.indexOf(":");
  if (idx !== -1) return { provider: spec.slice(0, idx), id: spec.slice(idx + 1) };
  return { provider: spec.includes("/") ? "bynara" : "anthropic", id: spec };
}
const providerOf = (spec: string) => parseSpec(spec).provider;

/**
 * "provider:model" -> LanguageModel. Providers: anthropic, openai, bynara.
 * `bynara` talks to the Bynara router (https://router.bynara.id) and assumes an OpenAI-compatible
 * chat-completions API; override the endpoint with BYNARA_BASE_URL.
 */
export function resolveModel(spec: string): LanguageModel {
  const { provider, id } = parseSpec(spec);
  if (provider === "anthropic") return anthropic(id);
  if (provider === "openai") return openai(id);
  if (provider === "bynara") {
    return createOpenAI({
      name: "bynara",
      baseURL: process.env.BYNARA_BASE_URL || BYNARA_DEFAULT_BASE_URL,
      apiKey: process.env.BYNARA_API_KEY,
    }).chat(id);
  }
  if (provider === "openrouter") {
    return createOpenAI({
      name: "openrouter",
      baseURL: process.env.OPENROUTER_BASE_URL || OPENROUTER_DEFAULT_BASE_URL,
      apiKey: process.env.OPENROUTER_API_KEY,
    }).chat(id);
  }
  if (provider === "nim") {
    return createOpenAI({
      name: "nim",
      baseURL: process.env.NIM_BASE_URL || NIM_DEFAULT_BASE_URL,
      apiKey: process.env.NVIDIA_API_KEY,
    }).chat(id);
  }
  throw new Error(`Unknown provider "${provider}" in model spec "${spec}" (use anthropic:<id>, openai:<id>, bynara:<id>, openrouter:<id> or nim:<id>)`);
}

export function assertLiveKeys(specs: string[]): void {
  for (const spec of specs) {
    const key = KEY_ENV[providerOf(spec)];
    if (key && !process.env[key]) throw new Error(`EVAL_MODE=live needs ${key} for model "${spec}"`);
  }
}
