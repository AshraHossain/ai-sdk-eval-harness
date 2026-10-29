import type { LanguageModel } from "ai";
import { mean, round, stdev, isFlaky, classifyStability, wilsonInterval, DEFAULT_FLAKY_BOUNDS, type FlakyBounds } from "./stats";
import { isInfraError } from "./errors";
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
  let infra = false;
  try {
    output = await o.suite.run(o.modelFor(c, run), c);
    scores = await o.suite.score({ case: c, output, judge: o.judge });
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
    infra = isInfraError(err);
  }
  infra ||= scores.some((s) => s.infra);
  const pass = !error && !infra && scores.length > 0 && scores.every((s) => s.pass);
  return {
    run,
    pass,
    score: round(scores.length ? mean(scores.map((s) => s.score)) : 0),
    scores,
    output,
    error,
    ...(infra ? { infra } : {}),
    latencyMs: Math.round(performance.now() - t0),
  };
}

/**
 * Names of scorers whose verdict changed across runs. A run that threw before
 * scoring counts as a fail for every scorer plus `execution`, so intermittent
 * exceptions (e.g. unparseable structured output) are attributed, not hidden.
 */
export function flakyScorers(runs: RunReport[]): string[] {
  if (runs.length < 2) return [];
  const names = [...new Set(runs.flatMap((r) => r.scores.map((s) => s.name)))];
  const verdicts = (name: string) => runs.map((r) => (r.error ? false : (r.scores.find((s) => s.name === name)?.pass ?? false)));
  const exec = runs.map((r) => !r.error);
  const out = names.filter((n) => {
    const v = verdicts(n);
    return v.some(Boolean) && v.some((x) => !x);
  });
  return exec.some(Boolean) && exec.some((x) => !x) ? ["execution", ...out] : out;
}

export function summarizeCase(id: string, runs: RunReport[], bounds: FlakyBounds = DEFAULT_FLAKY_BOUNDS): CaseReport {
  const scored = runs.filter((r) => !r.infra);
  const passes = scored.filter((r) => r.pass).length;
  const passRate = scored.length ? passes / scored.length : 0;
  const scores = scored.map((r) => r.score);
  return {
    id,
    scoredRuns: scored.length,
    passRate: round(passRate),
    ci95: wilsonInterval(passes, scored.length),
    stability: classifyStability(passes, scored.length, bounds),
    flakyScorers: flakyScorers(scored),
    meanScore: round(mean(scores)),
    scoreStdev: round(stdev(scores)),
    flaky: scored.length > 0 && isFlaky(passRate, bounds),
    runs,
  };
}

export async function runSuite<C extends EvalCase>(o: RunSuiteOptions<C>): Promise<SuiteReport> {
  const started = new Date();
  const t0 = performance.now();
  const bounds = o.flakyBounds ?? DEFAULT_FLAKY_BOUNDS;
  const limit = o.concurrency ?? 4;
  if (!Number.isInteger(limit) || limit < 1) throw new RangeError(`concurrency must be a positive integer, got ${limit}`);

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
  const allRuns = cases.flatMap((c) => c.runs);
  // Cases with no scored runs carry no quality signal; leave them out of the means.
  const scoredCases = cases.filter((c) => c.scoredRuns > 0);
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
      passRate: round(mean(scoredCases.map((c) => c.passRate))),
      meanScore: round(mean(scoredCases.map((c) => c.meanScore))),
      flakyCases: flaky,
      flakeRate: round(cases.length ? flaky / cases.length : 0),
      failingCases: cases.filter((c) => c.stability === "stable-fail").length,
      infraErrorRate: round(allRuns.length ? allRuns.filter((r) => r.infra).length / allRuns.length : 0),
    },
    cases,
  };
}
