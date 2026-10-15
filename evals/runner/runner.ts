import type { LanguageModel } from "ai";
import { mean, round, stdev, isFlaky, DEFAULT_FLAKY_BOUNDS, type FlakyBounds } from "./stats";
import type { CaseReport, EvalCase, RunReport, Suite, SuiteReport } from "./types";
import type { ScoreResult } from "../scorers/types";

export interface RunSuiteOptions<C extends EvalCase> {
  suite: Suite<C, unknown>;
  cases: C[];
  /** Runs per case (N). */
  runs: number;
  /** Builds the model for a given case/run (mock mode replays fixtures per run). */
  modelFor: (c: C, run: number) => LanguageModel;
  judge: LanguageModel;
  meta: { mode: "mock" | "live"; datasetVersion: string; datasetHash: string; model: string; judgeModel: string };
  flakyBounds?: FlakyBounds;
  concurrency?: number;
}

async function runOnce<C extends EvalCase>(o: RunSuiteOptions<C>, c: C, run: number): Promise<RunReport> {
  const t0 = performance.now();
  let scores: ScoreResult[] = [];
  let output: unknown;
  let error: string | undefined;
  try {
    output = await o.suite.run(o.modelFor(c, run), c);
    scores = await o.suite.score({ case: c, output, judge: o.judge });
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }
  const pass = !error && scores.length > 0 && scores.every((s) => s.pass);
  return {
    run,
    pass,
    score: round(scores.length ? mean(scores.map((s) => s.score)) : 0),
    scores,
    output,
    error,
    latencyMs: Math.round(performance.now() - t0),
  };
}

export function summarizeCase(id: string, runs: RunReport[], bounds: FlakyBounds = DEFAULT_FLAKY_BOUNDS): CaseReport {
  const passRate = runs.length ? runs.filter((r) => r.pass).length / runs.length : 0;
  const scores = runs.map((r) => r.score);
  return {
    id,
    passRate: round(passRate),
    meanScore: round(mean(scores)),
    scoreStdev: round(stdev(scores)),
    flaky: isFlaky(passRate, bounds),
    runs,
  };
}

export async function runSuite<C extends EvalCase>(o: RunSuiteOptions<C>): Promise<SuiteReport> {
  const started = new Date();
  const t0 = performance.now();
  const bounds = o.flakyBounds ?? DEFAULT_FLAKY_BOUNDS;
  const limit = Math.max(1, o.concurrency ?? 4);

  const cases: CaseReport[] = new Array(o.cases.length);
  let next = 0;
  async function worker() {
    while (next < o.cases.length) {
      const i = next++;
      const c = o.cases[i]!;
      const runs: RunReport[] = [];
      for (let r = 0; r < o.runs; r++) runs.push(await runOnce(o, c, r));
      cases[i] = summarizeCase(c.id, runs, bounds);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, o.cases.length) }, worker));

  const flaky = cases.filter((c) => c.flaky).length;
  return {
    suite: o.suite.name,
    title: o.suite.title,
    mode: o.meta.mode,
    runsPerCase: o.runs,
    datasetVersion: o.meta.datasetVersion,
    datasetHash: o.meta.datasetHash,
    model: o.meta.model,
    judgeModel: o.meta.judgeModel,
    startedAt: started.toISOString(),
    durationMs: Math.round(performance.now() - t0),
    summary: {
      cases: cases.length,
      passRate: round(mean(cases.map((c) => c.passRate))),
      meanScore: round(mean(cases.map((c) => c.meanScore))),
      flakyCases: flaky,
      flakeRate: round(cases.length ? flaky / cases.length : 0),
      failingCases: cases.filter((c) => c.passRate === 0).length,
    },
    cases,
  };
}
