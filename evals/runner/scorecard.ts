import { round } from "./stats";
import type { SuiteReport } from "./types";
import { addCosts, type TokenCounts } from "./usage";

/** Headline metrics derived from suite reports. Pure: same reports in, same scorecard out. */
export interface Scorecard {
  readonly mode: "mock" | "live";
  readonly runsPerCase: number;
  /** Mean pass rate across suites. */
  readonly passRate: number;
  /** RAG: share of expected citations returned (Recall@k, k = citations the model returned). */
  readonly citationRecall: number | null;
  /** RAG: share of answerable runs the faithfulness judge passed. */
  readonly groundingRate: number | null;
  /** RAG: abstention + no-citation guardrails held (answers only when the documents support it). */
  readonly guardrailPassRate: number | null;
  /** Agent: tool-call match rate (right tools, right args, right order). */
  readonly toolCallAccuracy: number | null;
  readonly latencyMs: { readonly p50: number; readonly p95: number };
  /** Tokens spent across every suite, split between the system under test and the judge. */
  readonly tokens: { readonly model: TokenCounts; readonly judge: TokenCounts };
  /** Total spend, or null when any model in the run has no price entry in evals/prices.json. */
  readonly costUsd: number | null;
  readonly suites: readonly { readonly suite: string; readonly passRate: number; readonly p50: number; readonly p95: number }[];
}

/** Nearest-rank percentile (p in 0..100). Returns 0 for an empty list. */
export function percentile(values: readonly number[], p: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.min(sorted.length, Math.max(1, Math.ceil((p / 100) * sorted.length)));
  return sorted[rank - 1]!;
}

const latencies = (r: SuiteReport) => r.cases.flatMap((c) => c.runs.filter((x) => !x.infra).map((x) => x.latencyMs));

/** Mean of `pass` (or `score`) for the named scorers in one suite; null when the suite or scorer is absent. */
export function scorerRate(reports: readonly SuiteReport[], suite: string, names: readonly string[], field: "pass" | "score" = "pass"): number | null {
  const hits = reports
    .filter((r) => r.suite === suite)
    .flatMap((r) => r.cases.flatMap((c) => c.runs.flatMap((x) => (x.infra ? [] : x.scores.filter((s) => names.includes(s.name) && !s.infra)))));
  if (!hits.length) return null;
  return round(hits.reduce((n, s) => n + (field === "pass" ? Number(s.pass) : s.score), 0) / hits.length);
}

const sumTokens = (reports: readonly SuiteReport[], pick: (r: SuiteReport) => TokenCounts | undefined): TokenCounts =>
  reports.reduce(
    (acc, r) => ({ inputTokens: acc.inputTokens + (pick(r)?.inputTokens ?? 0), outputTokens: acc.outputTokens + (pick(r)?.outputTokens ?? 0) }),
    { inputTokens: 0, outputTokens: 0 },
  );

export function buildScorecard(reports: readonly SuiteReport[]): Scorecard {
  const all = reports.flatMap(latencies);
  return {
    mode: reports[0]?.mode ?? "mock",
    runsPerCase: reports[0]?.runsPerCase ?? 0,
    passRate: round(reports.length ? reports.reduce((n, r) => n + r.summary.passRate, 0) / reports.length : 0),
    citationRecall: scorerRate(reports, "rag", ["citations"], "score"),
    groundingRate: scorerRate(reports, "rag", ["judge:faithfulness"]),
    guardrailPassRate: scorerRate(reports, "rag", ["abstention", "no-citations"]),
    toolCallAccuracy: scorerRate(reports, "agent", ["tool-calls"]),
    latencyMs: { p50: round(percentile(all, 50), 1), p95: round(percentile(all, 95), 1) },
    tokens: { model: sumTokens(reports, (r) => r.usage?.model), judge: sumTokens(reports, (r) => r.usage?.judge) },
    costUsd: reports.reduce<number | null>((acc, r) => addCosts(acc, r.usage?.costUsd ?? null), 0),
    suites: reports.map((r) => ({ suite: r.suite, passRate: r.summary.passRate, p50: round(percentile(latencies(r), 50), 1), p95: round(percentile(latencies(r), 95), 1) })),
  };
}

const fmt = (v: number | null) => (v === null ? "n/a" : `${(v * 100).toFixed(1)}%`);

/** Tokens as "input -> output", in thousands once past 10k so the table stays readable. */
export const formatTokens = (t: TokenCounts): string => `${compact(t.inputTokens)} in / ${compact(t.outputTokens)} out`;
const compact = (n: number) => (n >= 10_000 ? `${Math.round(n / 1000)}k` : String(n));

/** Spend, or "unpriced" when a model in the run has no entry in evals/prices.json. */
export const formatCost = (usd: number | null): string => (usd === null ? "unpriced" : `$${usd.toFixed(usd < 1 ? 4 : 2)}`);

export function renderScorecard(s: Scorecard): string {
  return [
    `### Scorecard (${s.mode}, N=${s.runsPerCase})`,
    "",
    "| Metric | Value |",
    "|---|---|",
    `| Pass rate (mean of suites) | ${fmt(s.passRate)} |`,
    `| Citation recall (Recall@k, rag) | ${fmt(s.citationRecall)} |`,
    `| Grounding rate (faithfulness judge, rag) | ${fmt(s.groundingRate)} |`,
    `| Guardrail pass rate (abstention, rag) | ${fmt(s.guardrailPassRate)} |`,
    `| Tool-call accuracy (agent) | ${fmt(s.toolCallAccuracy)} |`,
    `| Latency p50 / p95 per run | ${s.latencyMs.p50} ms / ${s.latencyMs.p95} ms |`,
    `| Tokens (system under test) | ${formatTokens(s.tokens.model)} |`,
    `| Tokens (judge) | ${formatTokens(s.tokens.judge)} |`,
    `| Cost | ${formatCost(s.costUsd)} |`,
    "",
  ].join("\n");
}
