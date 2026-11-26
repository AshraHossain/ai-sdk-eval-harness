import { createHash } from "node:crypto";
import type { EvalCase, Suite } from "./types";

/**
 * Hash of everything in a suite's prompts that can change what a model is asked: each feature's
 * system prompt and user template, plus the judge rubrics the suite scores with. Reports carry it,
 * so an edited prompt invalidates baseline comparisons instead of quietly changing what the numbers
 * mean. Same idea as `datasetHash`, for the prompt side.
 */
export function promptHash(suite: Suite<EvalCase, unknown>): string {
  if (!suite.promptSurface.length) throw new Error(`Suite "${suite.name}" declares an empty promptSurface`);
  // NUL separator: it cannot appear in prompt text, so two surfaces cannot collide by concatenation.
  return createHash("sha256").update(suite.promptSurface.join("\u0000")).digest("hex").slice(0, 12);
}
