/**
 * Judge calibration: before trusting an LLM judge in the gate, measure how well
 * it agrees with human labels on a fixed set.
 *
 *   npm run eval:calibrate                         # mock judge: plumbing check, never fails CI
 *   EVAL_MODE=live npm run eval:calibrate           # real judge: exits 1 below the bar
 *
 * Reports exact and within-±1 agreement, mean absolute error, and Cohen's kappa
 * on the pass/fail decision (score >= PASS_AT) with a bootstrap 95% interval.
 * The set deliberately leans on scores 2-4, where judges actually disagree.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { LanguageModel } from "ai";
import { z } from "zod";
import { createMockJudge } from "../mock/mockModel";
import { assertLiveKeys, DEFAULT_JUDGE_MODEL, resolveMode, resolveModel } from "../models";
import { llmJudge } from "../scorers/judge";
import { EVALS_DIR } from "../runner/load";
import { mean, round } from "../runner/stats";

export const PASS_AT = 4;
export const MIN_KAPPA = 0.6;
export const MIN_WITHIN_ONE = 0.8;

export const calibrationItem = z.object({
  id: z.string(),
  name: z.string(),
  rubric: z.string(),
  input: z.string(),
  reference: z.string().optional(),
  output: z.string(),
  humanScore: z.number().int().min(1).max(5),
});
export type CalibrationItem = z.infer<typeof calibrationItem>;

export interface CalibrationRow {
  id: string;
  human: number;
  judge: number;
}

export interface CalibrationResult {
  n: number;
  exactAgreement: number;
  withinOne: number;
  meanAbsError: number;
  passFailKappa: number;
  /** Percentile-bootstrap 95% interval for kappa. Wide means "label more boundary cases". */
  kappaCI95: { low: number; high: number };
  ok: boolean;
  rows: CalibrationRow[];
}

/** Cohen's kappa for two binary raters: 1 = perfect, 0 = chance-level. */
export function cohensKappa(a: boolean[], b: boolean[]): number {
  if (a.length !== b.length || a.length === 0) throw new Error("kappa needs two equal, non-empty label arrays");
  const n = a.length;
  const po = a.filter((x, i) => x === b[i]).length / n;
  const pa = a.filter(Boolean).length / n;
  const pb = b.filter(Boolean).length / n;
  const pe = pa * pb + (1 - pa) * (1 - pb);
  return pe === 1 ? 1 : (po - pe) / (1 - pe);
}

/** Deterministic PRNG so the bootstrap interval is reproducible. */
function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function bootstrapKappaCI(human: boolean[], judge: boolean[], iterations = 2000, seed = 42) {
  const rand = mulberry32(seed);
  const n = human.length;
  const ks: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const idx = Array.from({ length: n }, () => Math.floor(rand() * n));
    ks.push(cohensKappa(idx.map((j) => human[j]!), idx.map((j) => judge[j]!)));
  }
  ks.sort((a, b) => a - b);
  return { low: round(ks[Math.floor(0.025 * iterations)]!), high: round(ks[Math.ceil(0.975 * iterations) - 1]!) };
}

export function scoreAgreement(rows: CalibrationRow[]): CalibrationResult {
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

export async function loadCalibrationSet(dir = EVALS_DIR): Promise<CalibrationItem[]> {
  const raw = await readFile(path.join(dir, "calibration", "judge-calibration.jsonl"), "utf8");
  return raw
    .split("\n")
    .filter((l) => l.trim())
    .map((l, i) => {
      const r = calibrationItem.safeParse(JSON.parse(l));
      if (!r.success) throw new Error(`judge-calibration.jsonl:${i + 1}: ${r.error.issues[0]?.message}`);
      return r.data;
    });
}

export async function calibrate(judge: LanguageModel, items?: CalibrationItem[]): Promise<CalibrationResult> {
  const rows: CalibrationRow[] = [];
  for (const it of items ?? (await loadCalibrationSet())) {
    const r = await llmJudge(judge, { name: it.name, rubric: it.rubric }, { input: it.input, reference: it.reference, output: it.output });
    if (r.detail?.startsWith("judge error")) throw new Error(`${it.id}: ${r.detail}`);
    rows.push({ id: it.id, human: it.humanScore, judge: Math.round(r.score * 4 + 1) });
  }
  return scoreAgreement(rows);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const mode = resolveMode();
  const spec = process.env.EVAL_JUDGE_MODEL || DEFAULT_JUDGE_MODEL;
  if (mode === "live") assertLiveKeys([spec]);
  const r = await calibrate(mode === "live" ? resolveModel(spec) : createMockJudge());
  console.log(`Judge: ${mode === "live" ? spec : "mock-judge"}`);
  console.table(r.rows);
  console.log(
    `n=${r.n} exact=${r.exactAgreement} within±1=${r.withinOne} MAE=${r.meanAbsError} ` +
      `kappa(pass@${PASS_AT})=${r.passFailKappa} [95% CI ${r.kappaCI95.low}, ${r.kappaCI95.high}]`,
  );
  if (r.kappaCI95.low < MIN_KAPPA) console.log(`⚠ kappa CI lower bound ${r.kappaCI95.low} < ${MIN_KAPPA}: label more boundary cases (scores 3-4).`);
  console.log(r.ok ? "✅ judge meets the bar" : `❌ judge below the bar (kappa >= ${MIN_KAPPA}, within±1 >= ${MIN_WITHIN_ONE})`);
  if (mode === "mock") {
    // The mock judge is a coverage heuristic, not a quality oracle: this run checks
    // the calibration plumbing and documents the heuristic's blind spots.
    console.log("ℹ mock judge: plumbing check only. Run with EVAL_MODE=live to calibrate a real judge.");
  } else if (!r.ok) {
    process.exit(1);
  }
}
