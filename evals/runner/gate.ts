import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { round } from './stats';
import type { EvalReport, GateCheck, GateResult, SuiteResult } from './types';

const thresholdsSchema = z.object({
  /** Minimum fraction of scored (case × run) executions that must pass, quarantined cases excluded. */
  minPassRate: z.number().min(0).max(1),
  /** Max fraction of non-quarantined cases that may be flaky. */
  maxFlakyRate: z.number().min(0).max(1),
  /** Max allowed drop in gated pass rate vs. a compatible baseline. */
  maxRegression: z.number().min(0).max(1),
  /** Max fraction of runs lost to infrastructure errors (429/5xx/timeouts). */
  maxInfraErrorRate: z.number().min(0).max(1).default(0.1),
  /** Minimum mean score per judge scorer (0..1). Ignored when absent. */
  minJudgeScore: z.number().min(0).max(1).optional(),
});
export type Thresholds = z.infer<typeof thresholdsSchema>;

export const gateConfigSchema = z.object({
  defaults: thresholdsSchema,
  /** Per-suite overrides. */
  suites: z.record(z.string(), thresholdsSchema.partial()).default({}),
  /** Per-mode overrides, applied last. Live models are noisier than the mock. */
  modes: z.object({ mock: thresholdsSchema.partial().optional(), live: thresholdsSchema.partial().optional() }).default({}),
});
export type GateConfig = z.infer<typeof gateConfigSchema>;

const stabilitySchema = z.enum(['stable-pass', 'stable-fail', 'flaky', 'inconclusive']);

export const baselineSchema = z.object({
  updatedAt: z.string(),
  mode: z.enum(['mock', 'live']),
  subjectModel: z.string(),
  judgeModel: z.string(),
  runsPerCase: z.number().int().positive(),
  suites: z.record(
    z.string(),
    z.object({
      gatedPassRate: z.number(),
      cases: z.record(z.string(), stabilitySchema),
    }),
  ),
});
export type Baseline = z.infer<typeof baselineSchema>;

type ReportMeta = Pick<EvalReport['meta'], 'mode' | 'subjectModel' | 'judgeModel' | 'runsPerCase'>;

export const GATE_CONFIG_PATH = path.join(/*turbopackIgnore: true*/ process.cwd(), 'evals', 'gate.config.json');

/** Baselines are per mode: a mock baseline says nothing about a live model. */
export function baselinePath(mode: ReportMeta['mode']): string {
  return path.join(/*turbopackIgnore: true*/ process.cwd(), 'evals', 'baselines', `${mode}.json`);
}

export function loadGateConfig(file = GATE_CONFIG_PATH): GateConfig {
  return gateConfigSchema.parse(JSON.parse(readFileSync(/*turbopackIgnore: true*/ file, 'utf8')));
}

export function loadBaseline(file: string): Baseline | undefined {
  if (!existsSync(/*turbopackIgnore: true*/ file)) return undefined;
  return baselineSchema.parse(JSON.parse(readFileSync(/*turbopackIgnore: true*/ file, 'utf8')));
}

export function thresholdsFor(config: GateConfig, suite: string, mode: ReportMeta['mode'] = 'mock'): Thresholds {
  return { ...config.defaults, ...config.suites[suite], ...config.modes[mode] };
}

/** A baseline only counts when it was recorded with the same mode and models. */
export function baselineMismatch(meta: ReportMeta, baseline: Baseline): string | undefined {
  if (baseline.mode !== meta.mode) return `baseline mode ${baseline.mode} ≠ ${meta.mode}`;
  if (baseline.subjectModel !== meta.subjectModel) return `baseline subject ${baseline.subjectModel} ≠ ${meta.subjectModel}`;
  if (baseline.judgeModel !== meta.judgeModel) return `baseline judge ${baseline.judgeModel} ≠ ${meta.judgeModel}`;
  return undefined;
}

export function evaluateSuiteGate(s: SuiteResult, t: Thresholds, baseline?: Baseline): GateCheck[] {
  const checks: GateCheck[] = [];
  const add = (check: string, ok: boolean, actual: GateCheck['actual'], threshold: GateCheck['threshold']) =>
    checks.push({ suite: s.name, check, ok, actual, threshold });

  // Quarantined cases are reported but excluded from every gate check.
  const gated = s.cases.filter((c) => !c.quarantined);
  add('pass_rate', s.gatedPassRate >= t.minPassRate, s.gatedPassRate, `>= ${t.minPassRate}`);

  const flaky = gated.filter((c) => c.stability === 'flaky');
  const flakyRate = round(flaky.length / Math.max(1, gated.length));
  add('flaky_rate', flakyRate <= t.maxFlakyRate, flaky.length ? `${flakyRate} (${flaky.map((c) => c.id).join(', ')})` : flakyRate, `<= ${t.maxFlakyRate}`);

  add('infra_error_rate', s.infraErrorRate <= t.maxInfraErrorRate, s.infraErrorRate, `<= ${t.maxInfraErrorRate}`);

  const base = baseline?.suites[s.name];
  if (base) {
    const drop = round(base.gatedPassRate - s.gatedPassRate);
    add('regression_vs_baseline', drop <= t.maxRegression, `${drop > 0 ? '-' : '+'}${Math.abs(drop)}`, `drop <= ${t.maxRegression}`);
    // Per-case regressions: a case that always passed and now always fails is a
    // real regression regardless of how the suite-level rate moved.
    const newlyFailing = gated.filter((c) => c.stability === 'stable-fail' && base.cases[c.id] === 'stable-pass').map((c) => c.id);
    add('newly_failing_cases', newlyFailing.length === 0, newlyFailing.length ? newlyFailing.join(', ') : 0, '0');
  }

  if (t.minJudgeScore !== undefined) {
    for (const sc of s.scorers.filter((x) => x.kind === 'judge')) {
      add(`judge:${sc.name}`, sc.meanScore >= t.minJudgeScore, sc.meanScore, `>= ${t.minJudgeScore}`);
    }
  }
  return checks;
}

export function evaluateGate(report: Pick<EvalReport, 'suites' | 'meta'>, config: GateConfig, baseline?: Baseline): GateResult {
  const notes: string[] = [];
  let usable = baseline;
  if (baseline) {
    const why = baselineMismatch(report.meta, baseline);
    if (why) {
      notes.push(`Regression checks skipped: ${why}.`);
      usable = undefined;
    }
  } else {
    notes.push(`No ${report.meta.mode} baseline; regression checks skipped.`);
  }
  if (report.meta.runsPerCase < 2) notes.push('N=1: flaky detection is off. Use --runs 2 or more.');
  const checks = report.suites.flatMap((s) => evaluateSuiteGate(s, thresholdsFor(config, s.name, report.meta.mode), usable));
  return { passed: checks.every((c) => c.ok), checks, notes };
}

export function baselineFrom(report: Pick<EvalReport, 'suites' | 'meta'>, previous?: Baseline): Baseline {
  const compatible = previous && !baselineMismatch(report.meta, previous);
  const suites = { ...(compatible ? previous.suites : {}) };
  for (const s of report.suites) {
    suites[s.name] = { gatedPassRate: s.gatedPassRate, cases: Object.fromEntries(s.cases.map((c) => [c.id, c.stability])) };
  }
  return {
    updatedAt: new Date().toISOString(),
    mode: report.meta.mode,
    subjectModel: report.meta.subjectModel,
    judgeModel: report.meta.judgeModel,
    runsPerCase: report.meta.runsPerCase,
    suites,
  };
}
