/**
 * Judge calibration: before trusting an LLM judge in the gate, measure how
 * well it agrees with human labels on a small, fixed set.
 *
 *   npm run eval:calibrate            # mock judge
 *   EVAL_MODE=live npm run eval:calibrate
 *
 * Reports exact agreement, within-1 agreement, mean absolute error and
 * Cohen's kappa on the pass/fail decision (score >= PASS_AT).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { judge } from '../../src/lib/judge';
import { describeModel, getEvalMode, getModel } from '../../src/lib/models';
import { mean, round } from '../runner/stats';

export const PASS_AT = 4;
export const MIN_KAPPA = 0.6;
export const MIN_WITHIN_ONE = 0.8;

const itemSchema = z.object({
  id: z.string(),
  criteria: z.string(),
  input: z.string(),
  reference: z.string().optional(),
  output: z.string(),
  humanScore: z.number().int().min(1).max(5),
});
export type CalibrationItem = z.infer<typeof itemSchema>;

export interface CalibrationResult {
  n: number;
  exactAgreement: number;
  withinOne: number;
  meanAbsError: number;
  passFailKappa: number;
  /** 95% percentile-bootstrap interval for kappa. Wide intervals mean "label more items". */
  kappaCI95: { low: number; high: number };
  ok: boolean;
  rows: Array<{ id: string; human: number; judge: number }>;
}

/** Cohen's kappa for two binary raters. 1 = perfect, 0 = chance-level. */
export function cohensKappa(a: boolean[], b: boolean[]): number {
  if (a.length !== b.length || a.length === 0) throw new Error('kappa needs two equal, non-empty label arrays');
  const n = a.length;
  const po = a.filter((x, i) => x === b[i]).length / n;
  const pa = a.filter(Boolean).length / n;
  const pb = b.filter(Boolean).length / n;
  const pe = pa * pb + (1 - pa) * (1 - pb);
  return pe === 1 ? 1 : (po - pe) / (1 - pe);
}

/** Deterministic PRNG so the bootstrap interval is reproducible run to run. */
function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function bootstrapKappaCI(human: boolean[], judge: boolean[], iterations = 2000, seed = 42): { low: number; high: number } {
  const rand = mulberry32(seed);
  const n = human.length;
  const ks: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const idx = Array.from({ length: n }, () => Math.floor(rand() * n));
    ks.push(cohensKappa(idx.map((j) => human[j]), idx.map((j) => judge[j])));
  }
  ks.sort((a, b) => a - b);
  return { low: round(ks[Math.floor(0.025 * iterations)]), high: round(ks[Math.ceil(0.975 * iterations) - 1]) };
}

export function scoreAgreement(rows: CalibrationResult['rows']): CalibrationResult {
  const diffs = rows.map((r) => Math.abs(r.human - r.judge));
  const human = rows.map((r) => r.human >= PASS_AT);
  const judged = rows.map((r) => r.judge >= PASS_AT);
  const kappa = cohensKappa(human, judged);
  const withinOne = diffs.filter((d) => d <= 1).length / rows.length;
  return {
    n: rows.length,
    exactAgreement: round(diffs.filter((d) => d === 0).length / rows.length),
    withinOne: round(withinOne),
    meanAbsError: round(mean(diffs)),
    passFailKappa: round(kappa),
    kappaCI95: bootstrapKappaCI(human, judged),
    ok: kappa >= MIN_KAPPA && withinOne >= MIN_WITHIN_ONE,
    rows,
  };
}

export function loadCalibrationSet(file = path.join(process.cwd(), 'evals', 'calibration', 'judge-calibration.jsonl')): CalibrationItem[] {
  return readFileSync(file, 'utf8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l, i) => {
      const r = itemSchema.safeParse(JSON.parse(l));
      if (!r.success) throw new Error(`calibration line ${i + 1}: ${r.error.issues[0]?.message}`);
      return r.data;
    });
}

export async function calibrate(items = loadCalibrationSet()): Promise<CalibrationResult> {
  const model = getModel('judge');
  const rows = [];
  for (const it of items) {
    const v = await judge(model, it);
    rows.push({ id: it.id, human: it.humanScore, judge: v.score });
  }
  return scoreAgreement(rows);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  calibrate()
    .then((r) => {
      console.log(`Judge: ${describeModel(getModel('judge'))}`);
      console.table(r.rows);
      console.log(
        `n=${r.n} exact=${r.exactAgreement} within±1=${r.withinOne} MAE=${r.meanAbsError} kappa(pass@${PASS_AT})=${r.passFailKappa} [95% CI ${r.kappaCI95.low}, ${r.kappaCI95.high}]`,
      );
      if (r.kappaCI95.low < MIN_KAPPA) {
        console.log(`⚠ kappa CI lower bound ${r.kappaCI95.low} < ${MIN_KAPPA}: label more boundary cases (scores 3-4) to tighten it.`);
      }
      if (getEvalMode() === 'mock') console.log('ℹ mock judge: this checks the calibration plumbing, not a real model. Run with EVAL_MODE=live to calibrate a judge.');
      console.log(r.ok ? '✅ judge calibrated' : `❌ judge below bar (kappa >= ${MIN_KAPPA}, within±1 >= ${MIN_WITHIN_ONE})`);
      process.exitCode = r.ok ? 0 : 1;
    })
    .catch((e) => {
      console.error(e);
      process.exitCode = 2;
    });
}
