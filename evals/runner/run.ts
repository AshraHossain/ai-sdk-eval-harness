import type { EvalCase, AnySuite, SuiteContext } from '../suites/types';
import type { ScoreResult } from '../scorers/types';
import { isInfraError } from './errors';
import { classifyStability, mean, percentile, round, wilsonInterval } from './stats';
import type { CaseResult, RunResult, ScorerSummary, SuiteResult } from './types';

export const QUARANTINE_TAG = 'known-flaky';

export interface RunSuiteOptions {
  /** How many times to execute each case. N >= 2 enables flaky detection. */
  runs?: number;
  /** Max cases in flight at once. Runs of the same case stay sequential. */
  concurrency?: number;
  /** Keep raw outputs in the report (useful for debugging, noisy in CI). */
  keepOutputs?: boolean;
  /** Only run cases whose id or tags match. */
  filter?: (c: EvalCase<unknown, unknown>) => boolean;
  onCaseDone?: (c: CaseResult) => void;
}

/** Executes one case once: run the feature, score it, never throw. */
export async function executeOnce(
  suite: AnySuite,
  c: EvalCase<unknown, unknown>,
  ctx: SuiteContext,
  run: number,
  keepOutputs = false,
): Promise<RunResult> {
  const t0 = performance.now();
  let output: unknown;
  try {
    output = await suite.run(c.input, ctx);
  } catch (err) {
    const infra = isInfraError(err);
    return {
      run,
      pass: false,
      latencyMs: round(performance.now() - t0, 1),
      scores: [{ name: 'execution', kind: 'deterministic', score: 0, pass: false, detail: (err as Error).message, ...(infra ? { infra } : {}) }],
      error: (err as Error).message,
      ...(infra ? { infra } : {}),
    };
  }
  const latencyMs = round(performance.now() - t0, 1);
  // Always emit `execution`, so intermittent exceptions show up as a flaky scorer.
  const scores: ScoreResult[] = [{ name: 'execution', kind: 'deterministic', score: 1, pass: true }];
  try {
    scores.push(...(await suite.score(c, output, ctx)));
  } catch (err) {
    scores.push({ name: 'scoring', kind: 'deterministic', score: 0, pass: false, detail: (err as Error).message });
  }
  const infra = scores.some((s) => s.infra);
  return {
    run,
    pass: !infra && scores.every((s) => s.pass),
    latencyMs,
    scores: scores.map((s) => ({ ...s, score: round(s.score) })),
    ...(keepOutputs ? { output } : {}),
    ...(infra ? { infra } : {}),
  };
}

export function summarizeCase(c: EvalCase<unknown, unknown>, runs: RunResult[]): CaseResult {
  const scored = runs.filter((r) => !r.infra);
  const passes = scored.filter((r) => r.pass).length;
  // A scorer missing from a run (because the run threw first) counts as a fail
  // for that run, so the instability is attributed instead of hidden.
  const names = [...new Set(scored.flatMap((r) => r.scores.map((s) => s.name)))];
  const flakyScorers = scored.length < 2 ? [] : names.filter((name) => {
    const verdicts = scored.map((r) => r.scores.find((s) => s.name === name)?.pass ?? false);
    return verdicts.some(Boolean) && verdicts.some((x) => !x);
  });
  const tags = c.tags ?? [];
  return {
    id: c.id,
    tags,
    runs,
    scoredRuns: scored.length,
    passes,
    passRate: scored.length ? round(passes / scored.length) : 0,
    ci95: (({ low, high }) => ({ low: round(low), high: round(high) }))(wilsonInterval(passes, scored.length)),
    stability: classifyStability(passes, scored.length),
    quarantined: tags.includes(QUARANTINE_TAG),
    flakyScorers,
    meanScore: round(mean(scored.flatMap((r) => r.scores.map((s) => s.score)))),
  };
}

export function summarizeSuite(suite: AnySuite, cases: CaseResult[], runsPerCase: number, durationMs: number): SuiteResult {
  const allRuns = cases.flatMap((c) => c.runs);
  const scoredRuns = allRuns.filter((r) => !r.infra);
  const gatedRuns = cases.filter((c) => !c.quarantined).flatMap((c) => c.runs.filter((r) => !r.infra));
  const rate = (rs: RunResult[]) => (rs.length ? round(rs.filter((r) => r.pass).length / rs.length) : 0);
  const scorerMap = new Map<string, ScoreResult[]>();
  for (const r of scoredRuns) for (const s of r.scores) scorerMap.set(s.name, [...(scorerMap.get(s.name) ?? []), s]);
  const scorers: ScorerSummary[] = [...scorerMap.entries()].map(([name, xs]) => ({
    name,
    kind: xs[0].kind,
    meanScore: round(mean(xs.map((x) => x.score))),
    passRate: round(xs.filter((x) => x.pass).length / xs.length),
  }));
  const latencies = allRuns.map((r) => r.latencyMs);
  return {
    name: suite.name,
    description: suite.description,
    runsPerCase,
    cases,
    passRate: rate(scoredRuns),
    gatedPassRate: rate(gatedRuns),
    infraErrorRate: allRuns.length ? round(allRuns.filter((r) => r.infra).length / allRuns.length) : 0,
    quarantinedCaseIds: cases.filter((c) => c.quarantined).map((c) => c.id),
    stablePassRate: round(cases.filter((c) => c.stability === 'stable-pass').length / Math.max(1, cases.length)),
    flakyCaseIds: cases.filter((c) => c.stability === 'flaky').map((c) => c.id),
    scorers,
    latency: { p50: round(percentile(latencies, 50), 1), p95: round(percentile(latencies, 95), 1) },
    durationMs: Math.round(durationMs),
  };
}

/** Bounded-concurrency map that preserves input order. */
export async function mapPool<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  if (!Number.isInteger(limit) || limit < 1) throw new RangeError(`concurrency must be a positive integer, got ${limit}`);
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  return out;
}

export async function runSuite(
  suite: AnySuite,
  cases: EvalCase<unknown, unknown>[],
  ctx: SuiteContext,
  { runs = 1, concurrency = 4, keepOutputs = false, filter, onCaseDone }: RunSuiteOptions = {},
): Promise<SuiteResult> {
  if (!Number.isInteger(runs) || runs < 1) throw new RangeError(`runs must be a positive integer, got ${runs}`);
  const selected = filter ? cases.filter(filter) : cases;
  const t0 = performance.now();
  const results = await mapPool(selected, concurrency, async (c) => {
    const rs: RunResult[] = [];
    // Sequential per case: repeated calls must not race each other, so the
    // N samples are independent draws rather than one burst.
    for (let r = 0; r < runs; r++) rs.push(await executeOnce(suite, c, ctx, r, keepOutputs));
    const summary = summarizeCase(c, rs);
    onCaseDone?.(summary);
    return summary;
  });
  return summarizeSuite(suite, results, runs, performance.now() - t0);
}
