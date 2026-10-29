import type { ZodType } from "zod";
import type { LanguageModel } from "ai";
import type { ScoreResult } from "../scorers/types";
import type { Interval, Stability } from "./stats";

export interface EvalCase {
  id: string;
}

export interface Suite<C extends EvalCase = EvalCase, O = unknown> {
  name: string;
  title: string;
  description: string;
  caseSchema: ZodType<C>;
  /** Runs the system under test for one case. */
  run(model: LanguageModel, c: C): Promise<O>;
  /** Scores one output. `judge` is always provided; scorers decide whether to use it. */
  score(args: { case: C; output: O; judge: LanguageModel }): Promise<ScoreResult[]>;
}

export interface RunReport {
  run: number;
  pass: boolean;
  /** Mean of normalized scorer scores for this run. */
  score: number;
  scores: ScoreResult[];
  output?: unknown;
  error?: string;
  /** Failed for infrastructure reasons; excluded from pass rates and flaky detection. */
  infra?: boolean;
  latencyMs: number;
}

export interface CaseReport {
  id: string;
  /** Runs that produced a quality signal (runs minus infra errors). */
  scoredRuns: number;
  passRate: number;
  /** Wilson 95% interval on the pass rate. */
  ci95: Interval;
  stability: Stability;
  /** Scorers whose verdict changed across runs: where the instability lives. */
  flakyScorers: string[];
  meanScore: number;
  scoreStdev: number;
  flaky: boolean;
  runs: RunReport[];
}

export interface SuiteSummary {
  cases: number;
  passRate: number;
  meanScore: number;
  flakyCases: number;
  flakeRate: number;
  failingCases: number;
  /** Share of runs lost to infrastructure errors. */
  infraErrorRate: number;
}

export interface SuiteReport {
  suite: string;
  title: string;
  mode: "mock" | "live";
  runsPerCase: number;
  datasetVersion: string;
  datasetHash: string;
  model: string;
  judgeModel: string;
  startedAt: string;
  durationMs: number;
  summary: SuiteSummary;
  cases: CaseReport[];
}
