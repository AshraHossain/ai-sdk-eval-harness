import type { ZodType } from "zod";
import type { LanguageModel } from "ai";
import type { ScoreResult } from "../scorers/types";
import type { Interval, Stability } from "./stats";

export interface EvalCase {
  readonly id: string;
}

export interface Suite<C extends EvalCase = EvalCase, O = unknown> {
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly caseSchema: ZodType<C>;
  /** Runs the system under test for one case. */
  run(model: LanguageModel, c: C): Promise<O>;
  /** Scores one output. `judge` is always provided; scorers decide whether to use it. */
  score(args: { case: C; output: O; judge: LanguageModel }): Promise<ScoreResult[]>;
}

export interface RunReport {
  readonly run: number;
  readonly pass: boolean;
  /** Mean of normalized scorer scores for this run. */
  readonly score: number;
  readonly scores: readonly ScoreResult[];
  readonly output?: unknown;
  readonly error?: string;
  /** Failed for infrastructure reasons; excluded from pass rates and flaky detection. */
  readonly infra?: boolean;
  readonly latencyMs: number;
}

export interface CaseReport {
  readonly id: string;
  /** Runs that produced a quality signal (runs minus infra errors). */
  readonly scoredRuns: number;
  readonly passRate: number;
  /** Wilson 95% interval on the pass rate. */
  readonly ci95: Interval;
  readonly stability: Stability;
  /** Scorers whose verdict changed across runs: where the instability lives. */
  readonly flakyScorers: readonly string[];
  readonly meanScore: number;
  readonly scoreStdev: number;
  readonly flaky: boolean;
  readonly runs: readonly RunReport[];
}

export interface SuiteSummary {
  readonly cases: number;
  readonly passRate: number;
  readonly meanScore: number;
  readonly flakyCases: number;
  readonly flakeRate: number;
  readonly failingCases: number;
  /** Share of runs lost to infrastructure errors. */
  readonly infraErrorRate: number;
}

export interface SuiteReport {
  readonly suite: string;
  readonly title: string;
  readonly mode: "mock" | "live";
  readonly runsPerCase: number;
  readonly datasetVersion: string;
  readonly datasetHash: string;
  readonly model: string;
  readonly judgeModel: string;
  readonly startedAt: string;
  readonly durationMs: number;
  readonly summary: SuiteSummary;
  readonly cases: readonly CaseReport[];
}
