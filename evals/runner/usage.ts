import { wrapLanguageModel, type LanguageModel, type LanguageModelMiddleware } from "ai";

/** The model shape `wrapLanguageModel` accepts, derived from it so no provider package is imported. */
type WrappableModel = Parameters<typeof wrapLanguageModel>[0]["model"];

export interface TokenCounts {
  readonly inputTokens: number;
  readonly outputTokens: number;
}

/** Published price per million tokens. Hand-maintained, so it can be stale: see evals/prices.json. */
export interface ModelPrice {
  readonly inputPer1MUsd: number;
  readonly outputPer1MUsd: number;
}
export type Prices = Readonly<Record<string, ModelPrice>>;

export const NO_TOKENS: TokenCounts = { inputTokens: 0, outputTokens: 0 };

const isWrappable = (m: LanguageModel): m is WrappableModel =>
  typeof m === "object" && m !== null && (m as { specificationVersion?: string }).specificationVersion === "v3";

/**
 * Counts tokens for every call a model makes. The system under test stays a pure
 * `(model, input)` function: the runner wraps the model it hands in, so nothing in
 * `src/lib/ai/` knows about metering.
 *
 * One meter per run: `runSuite` works several cases concurrently, and a shared counter
 * would mix their totals.
 */
export function createUsageMeter() {
  let inputTokens = 0;
  let outputTokens = 0;
  const middleware: LanguageModelMiddleware = {
    specificationVersion: "v3",
    wrapGenerate: async ({ doGenerate }) => {
      const result = await doGenerate();
      inputTokens += result.usage.inputTokens.total ?? 0;
      outputTokens += result.usage.outputTokens.total ?? 0;
      return result;
    },
  };
  return {
    /** Model-id strings and v2 models are passed through unwrapped and report no usage. */
    meter: (model: LanguageModel): LanguageModel => (isWrappable(model) ? wrapLanguageModel({ model, middleware }) : model),
    /** Totals so far. */
    counts: (): TokenCounts => ({ inputTokens, outputTokens }),
  };
}

/** Cost in USD for one model's tokens, or null when that model has no price entry. */
export function estimateCostUsd(spec: string, counts: TokenCounts, prices: Prices): number | null {
  const price = prices[spec];
  if (!price) return null;
  return (counts.inputTokens / 1e6) * price.inputPer1MUsd + (counts.outputTokens / 1e6) * price.outputPer1MUsd;
}

/** Sums two optional costs; null when either is unknown, so a partial total is never reported as complete. */
export function addCosts(a: number | null, b: number | null): number | null {
  return a === null || b === null ? null : a + b;
}
