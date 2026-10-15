import { generateObject, type LanguageModel } from "ai";
import { z } from "zod";
import type { ScoreResult } from "./types";

export const judgeSchema = z.object({
  score: z.number().int().min(1).max(5),
  rationale: z.string(),
});

export interface JudgeOptions {
  /** Short scorer name, e.g. "faithfulness". */
  name: string;
  /** What a 5 looks like, and what drags the score down. */
  rubric: string;
  /** Minimum 1-5 score that counts as a pass. */
  minScore?: number;
}

export interface JudgeInput {
  input: string;
  output: string;
  reference?: string;
}

/**
 * Prompt layout is a contract with the offline mock judge (evals/mock/mockModel.ts),
 * which looks for the "REFERENCE:" and "OUTPUT:" blocks.
 */
export function buildJudgePrompt(opts: JudgeOptions, i: JudgeInput): string {
  return [
    `RUBRIC (${opts.name}):\n${opts.rubric}`,
    `INPUT:\n${i.input}`,
    `REFERENCE:\n${i.reference ?? "(none)"}`,
    `OUTPUT:\n${i.output}`,
    "Score the OUTPUT from 1 (fails the rubric) to 5 (fully satisfies it). Judge only against the rubric.",
  ].join("\n\n");
}

/** LLM-as-judge: rubric -> structured 1-5 score + rationale. Temperature 0, pinned judge model. */
export async function llmJudge(model: LanguageModel, opts: JudgeOptions, i: JudgeInput): Promise<ScoreResult> {
  const minScore = opts.minScore ?? 4;
  try {
    const { object } = await generateObject({
      model,
      temperature: 0,
      schema: judgeSchema,
      system: "You are a strict, impartial evaluator. Return a score and a one-sentence rationale.",
      prompt: buildJudgePrompt(opts, i),
    });
    return {
      name: `judge:${opts.name}`,
      score: (object.score - 1) / 4,
      pass: object.score >= minScore,
      detail: `${object.score}/5 - ${object.rationale}`,
    };
  } catch (err) {
    return { name: `judge:${opts.name}`, score: 0, pass: false, detail: `judge error: ${(err as Error).message}` };
  }
}
