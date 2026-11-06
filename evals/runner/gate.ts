import { z } from "zod";
import { mean, round } from "./stats";
import type { CaseReport, SuiteReport } from "./types";

const limits = z.object({
  minPassRate: z.number().min(0).max(1),
  maxFlakeRate: z.number().min(0).max(1),
  /** Max share of runs lost to infrastructure errors (429/5xx/timeouts). */
  maxInfraErrorRate: z.number().min(0).max(1).default(0.1),
  /** Max allowed pass-rate drop vs. a compatible baseline. */
  maxRegression: z.number().min(0).max(1).default(0.05),
});
export const thresholdsSchema = z.object({
  default: limits,
  suites: z.record(z.string(), limits.partial()).default({}),
  /** Per-mode overrides, applied last. Live models are noisier than fixtures. */
  modes: z.object({ mock: limits.partial().optional(), live: limits.partial().optional() }).default({}),
  /** "suite/case" ids that are reported but excluded from every gate check. */
  quarantine: z.array(z.string().regex(/^[\w-]+\/[\w-]+$/, "use suite/case")).default([]),
});
export type Thresholds = z.infer<typeof thresholdsSchema>;
export type Limits = z.infer<typeof limits>;

const stability = z.enum(["stable-pass", "stable-fail", "flaky", "mixed", "inconclusive"]);
export const baselineSchema = z.object({
  updatedAt: z.string(),
  mode: z.enum(["mock", "live"]),
  model: z.string(),
  judgeModel: z.string(),
  suites: z.record(
    z.string(),
    z.object({
      datasetHash: z.string(),
      runsPerCase: z.number().int().positive(),
      passRate: z.number(),
      cases: z.record(z.string(), stability),
    }),
  ),
});
export type Baseline = z.infer<typeof baselineSchema>;

export interface GateResult {
  suite: string;
  passRate: number;
  flakeRate: number;
  minPassRate: number;
  maxFlakeRate: number;
  infraErrorRate: number;
  quarantined: string[];
  /** Pass-rate drop vs. baseline, when a compatible baseline exists. */
  regression?: number;
  ok: boolean;
  failures: string[];
}

export interface Gate {
  ok: boolean;
  results: GateResult[];
  /** Context that changes how to read the result (skipped checks, N=1). */
  notes: string[];
}

export function limitsFor(t: Thresholds, suite: string, mode: "mock" | "live"): Limits {
  return { ...t.default, ...t.suites[suite], ...t.modes[mode] };
}

/** Pass and flake rates with quarantined cases left out. */
export function gatedRates(r: SuiteReport, quarantine: string[]) {
  const quarantined = r.cases.filter((c) => quarantine.includes(`${r.suite}/${c.id}`)).map((c) => c.id);
  if (!quarantined.length) return { passRate: r.summary.passRate, flakeRate: r.summary.flakeRate, quarantined, gated: r.cases };
  const gated = r.cases.filter((c) => !quarantined.includes(c.id));
  const scored = gated.filter((c) => c.scoredRuns > 0);
  return {
    passRate: round(mean(scored.map((c) => c.passRate))),
    flakeRate: round(gated.length ? gated.filter((c) => c.flaky).length / gated.length : 0),
    quarantined,
    gated,
  };
}

/** Why a baseline cannot be compared with this run, if it can't. */
export function baselineMismatch(r: SuiteReport, b: Baseline): string | undefined {
  if (b.mode !== r.mode) return `baseline is ${b.mode} mode`;
  if (b.model !== r.model || b.judgeModel !== r.judgeModel) return `baseline models ${b.model} / ${b.judgeModel} differ`;
  const s = b.suites[r.suite];
  if (!s) return "no baseline for this suite";
  if (s.datasetHash !== r.datasetHash) return "dataset changed since baseline";
  return undefined;
}

const newlyFailing = (gated: CaseReport[], base: Baseline["suites"][string]) =>
  gated.filter((c) => c.stability === "stable-fail" && base.cases[c.id] === "stable-pass").map((c) => c.id);

export function evaluateGate(reports: SuiteReport[], thresholds: Thresholds, baseline?: Baseline): Gate {
  const notes: string[] = [];
  const results = reports.map((r): GateResult => {
    const t = limitsFor(thresholds, r.suite, r.mode);
    const { passRate, flakeRate, quarantined, gated } = gatedRates(r, thresholds.quarantine);
    const failures: string[] = [];
    if (passRate < t.minPassRate) failures.push(`pass rate ${pct(passRate)} < ${pct(t.minPassRate)}`);
    if (flakeRate > t.maxFlakeRate) failures.push(`flake rate ${pct(flakeRate)} > ${pct(t.maxFlakeRate)}`);
    if (r.summary.infraErrorRate > t.maxInfraErrorRate) {
      failures.push(`infra errors ${pct(r.summary.infraErrorRate)} > ${pct(t.maxInfraErrorRate)}`);
    }

    let regression: number | undefined;
    if (baseline) {
      const why = baselineMismatch(r, baseline);
      if (why) notes.push(`${r.suite}: regression check skipped (${why}).`);
      else {
        const base = baseline.suites[r.suite]!;
        regression = round(base.passRate - passRate);
        if (regression > t.maxRegression) failures.push(`regressed ${pct(regression)} vs baseline (max ${pct(t.maxRegression)})`);
        // A case that always passed and now always fails is a regression even
        // when the suite-level rate stays within tolerance.
        const lost = newlyFailing(gated, base);
        if (lost.length) failures.push(`newly failing: ${lost.join(", ")}`);
      }
    }
    return {
      suite: r.suite,
      passRate,
      flakeRate,
      minPassRate: t.minPassRate,
      maxFlakeRate: t.maxFlakeRate,
      infraErrorRate: r.summary.infraErrorRate,
      quarantined,
      ...(regression !== undefined ? { regression } : {}),
      ok: failures.length === 0,
      failures,
    };
  });
  if (!baseline && reports.length) notes.push(`No ${reports[0]!.mode} baseline; regression checks skipped.`);
  if (reports.some((r) => r.runsPerCase < 2)) notes.push("N=1: flaky detection is off. Use --runs 2 or more.");
  return { ok: results.every((r) => r.ok), results, notes };
}

/** Records the current reports as the baseline, keeping other suites from a compatible previous one. */
export function baselineFrom(reports: SuiteReport[], previous?: Baseline, quarantine: string[] = []): Baseline {
  const first = reports[0];
  if (!first) throw new Error("No reports to baseline");
  const compatible = previous && previous.mode === first.mode && previous.model === first.model && previous.judgeModel === first.judgeModel;
  const suites = { ...(compatible ? previous.suites : {}) };
  for (const r of reports) {
    suites[r.suite] = {
      datasetHash: r.datasetHash,
      runsPerCase: r.runsPerCase,
      passRate: gatedRates(r, quarantine).passRate,
      cases: Object.fromEntries(r.cases.map((c) => [c.id, c.stability])),
    };
  }
  return { updatedAt: new Date().toISOString(), mode: first.mode, model: first.model, judgeModel: first.judgeModel, suites };
}

export const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
