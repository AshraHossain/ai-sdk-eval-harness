import type { LanguageModel } from 'ai';
import type { ZodType } from 'zod';
import type { ScoreResult } from '../scorers/types';

export interface EvalCase<I, E> {
  id: string;
  tags?: string[];
  input: I;
  expected: E;
}

export interface SuiteContext {
  subject: LanguageModel;
  judge: LanguageModel;
}

export interface EvalSuite<I = unknown, E = unknown, O = unknown> {
  name: string;
  description: string;
  /** File name under evals/datasets. */
  dataset: string;
  /** Validates every golden case on load, so a malformed dataset fails loudly. */
  caseSchema: ZodType<EvalCase<I, E>>;
  /** Invokes the system under test. */
  run(input: I, ctx: SuiteContext): Promise<O>;
  /** Returns every score for one output. A run passes when every score passes. */
  score(c: EvalCase<I, E>, output: O, ctx: SuiteContext): Promise<ScoreResult[]>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnySuite = EvalSuite<any, any, any>;

export const defineSuite = <I, E, O>(s: EvalSuite<I, E, O>): EvalSuite<I, E, O> => s;
