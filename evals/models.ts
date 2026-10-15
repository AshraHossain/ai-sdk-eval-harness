import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";

export type EvalMode = "mock" | "live";

export const DEFAULT_MODEL = "anthropic:claude-haiku-5-5";
export const DEFAULT_JUDGE_MODEL = "anthropic:claude-sonnet-5-5";

export function resolveMode(value = process.env.EVAL_MODE): EvalMode {
  return value === "live" ? "live" : "mock";
}

/** "provider:model" -> LanguageModel. Keys are read from ANTHROPIC_API_KEY / OPENAI_API_KEY by the providers. */
export function resolveModel(spec: string): LanguageModel {
  const idx = spec.indexOf(":");
  const provider = idx === -1 ? "anthropic" : spec.slice(0, idx);
  const id = idx === -1 ? spec : spec.slice(idx + 1);
  if (provider === "anthropic") return anthropic(id);
  if (provider === "openai") return openai(id);
  throw new Error(`Unknown provider "${provider}" in model spec "${spec}" (use anthropic:<id> or openai:<id>)`);
}

export function assertLiveKeys(specs: string[]): void {
  for (const spec of specs) {
    const provider = spec.includes(":") ? spec.split(":")[0] : "anthropic";
    const key = provider === "openai" ? "OPENAI_API_KEY" : "ANTHROPIC_API_KEY";
    if (!process.env[key]) throw new Error(`EVAL_MODE=live needs ${key} for model "${spec}"`);
  }
}
