import { MockLanguageModelV3 } from "ai/test";
import type { LanguageModelV3CallOptions, LanguageModelV3GenerateResult } from "@ai-sdk/provider";

export interface FixtureStep {
  text?: string;
  toolCalls?: { name: string; args: Record<string, unknown> }[];
}
/** One recorded model response: raw text, a structured object (serialized to JSON), or multi-step agent output. */
export type Fixture = string | { steps: FixtureStep[] } | Record<string, unknown>;

const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 10, text: 10, reasoning: 0 },
} as LanguageModelV3GenerateResult["usage"];

export function toSteps(f: Fixture): FixtureStep[] {
  if (typeof f === "string") return [{ text: f }];
  if (Array.isArray((f as { steps?: unknown }).steps)) return (f as { steps: FixtureStep[] }).steps;
  return [{ text: JSON.stringify(f) }];
}

function stepResult(step: FixtureStep, n: number): LanguageModelV3GenerateResult {
  if (step.toolCalls?.length) {
    return {
      content: step.toolCalls.map((c, i) => ({
        type: "tool-call" as const,
        toolCallId: `call-${n}-${i}`,
        toolName: c.name,
        input: JSON.stringify(c.args),
      })),
      finishReason: { unified: "tool-calls", raw: "tool_calls" },
      usage,
      warnings: [],
    };
  }
  return {
    content: [{ type: "text" as const, text: step.text ?? "" }],
    finishReason: { unified: "stop", raw: "stop" },
    usage,
    warnings: [],
  };
}

/** Replays a recorded fixture; each doGenerate call advances one step (last step repeats). */
export function createFixtureModel(fixture: Fixture, modelId = "mock-fixture") {
  const steps = toSteps(fixture);
  let n = 0;
  return new MockLanguageModelV3({
    modelId,
    doGenerate: async () => stepResult(steps[Math.min(n, steps.length - 1)]!, n++),
  });
}

const STOP = new Set("the a an and or of to in on for with is are was were be by as at from that this it its their his her".split(" "));
const contentWords = (s: string) => new Set(s.toLowerCase().match(/[a-z0-9$.%]+/g)?.filter((w) => w.length > 2 && !STOP.has(w)) ?? []);

function promptText(opts: LanguageModelV3CallOptions): string {
  return opts.prompt
    .flatMap((m) => (typeof m.content === "string" ? [m.content] : m.content.map((p) => ("text" in p ? p.text : ""))))
    .join("\n");
}

/** Section between `label:` and the next blank-line-delimited label. */
function section(prompt: string, label: string): string {
  const m = prompt.match(new RegExp(`${label}:\\n([\\s\\S]*?)(?:\\n\\n[A-Z]+[A-Z ()a-z]*:|\\n\\nScore the OUTPUT|$)`));
  return m?.[1]?.trim() ?? "";
}

/**
 * Deterministic offline judge: score = 1 + 4 * (share of REFERENCE content words present in OUTPUT).
 * It is a stand-in so CI needs no keys; it is not a quality oracle. Live mode uses a real judge model.
 */
export function createMockJudge() {
  return new MockLanguageModelV3({
    modelId: "mock-judge",
    doGenerate: async (opts) => {
      const prompt = promptText(opts);
      const ref = contentWords(section(prompt, "REFERENCE"));
      const out = contentWords(section(prompt, "OUTPUT"));
      const recall = ref.size ? [...ref].filter((w) => out.has(w)).length / ref.size : 1;
      const score = Math.max(1, Math.min(5, 1 + Math.round(4 * recall)));
      return stepResult({ text: JSON.stringify({ score, rationale: `mock judge: ${Math.round(recall * 100)}% reference coverage` }) }, 0);
    },
  });
}
