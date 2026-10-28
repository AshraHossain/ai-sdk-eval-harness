import type { LanguageModel } from 'ai';
import { judge, type JudgeRequest } from '../../src/lib/judge';
import { isInfraError } from '../runner/errors';
import type { ScoreResult } from './types';

export interface JudgeScorerOptions {
  /** Minimum 1-5 score that counts as a pass. Default 4. */
  passAt?: number;
}

/**
 * LLM-as-judge scorer. The judge returns a 1-5 rubric score which is
 * normalized to 0..1. Judge failures surface as a failing score, never a crash.
 */
export async function llmJudge(
  name: string,
  model: LanguageModel,
  req: JudgeRequest,
  { passAt = 4 }: JudgeScorerOptions = {},
): Promise<ScoreResult> {
  try {
    const v = await judge(model, req);
    return {
      name,
      kind: 'judge',
      score: (v.score - 1) / 4,
      pass: v.score >= passAt,
      detail: `${v.score}/5 — ${v.rationale}`,
    };
  } catch (err) {
    return { name, kind: 'judge', score: 0, pass: false, detail: `judge error: ${(err as Error).message}`, ...(isInfraError(err) ? { infra: true } : {}) };
  }
}
