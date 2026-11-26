import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { assertLiveKeys, DEFAULT_JUDGE_MODEL, DEFAULT_MODEL, resolveMode, resolveModel, type EvalMode } from "../models";
import { createFixtureModel, createMockJudge } from "../mock/mockModel";
import { applyFault } from "../mock/faults";
import { getSuite } from "../suites";
import { safeId } from "../../src/lib/security/sanitize";
import { loadDataset, loadFixtures, loadPrices } from "./load";
import { promptHash } from "./prompts";
import { runSuite } from "./runner";
import type { SuiteReport } from "./types";

export interface ExecuteOptions {
  suite: string;
  runs?: number;
  mode?: EvalMode;
  /** Report output directory (default ./reports). */
  outDir?: string;
  model?: string;
  judgeModel?: string;
  /** Mock mode only: inject a regression (see evals/mock/faults.ts). Defaults to EVAL_MOCK_FAULT. */
  fault?: string;
}

export const REPORTS_DIR = path.join(process.cwd(), "reports");
/** Written next to the suite reports; not a SuiteReport, so readReports skips it. */
export const SCORECARD_FILE = "scorecard.json";

/** Runs one suite end-to-end (mock fixtures or live providers) and returns its report. */
export async function executeSuite(opts: ExecuteOptions): Promise<SuiteReport> {
  const suite = getSuite(opts.suite);
  const mode = opts.mode ?? resolveMode();
  const runs = opts.runs ?? 5;
  const [ds, prices] = await Promise.all([loadDataset(suite), loadPrices()]);
  const prompt = promptHash(suite);

  if (mode === "mock") {
    const fixtures = await loadFixtures(suite.name);
    const fault = opts.fault ?? (process.env.EVAL_MOCK_FAULT || undefined);
    const missing = ds.cases.filter((c) => !fixtures[c.id]?.length).map((c) => c.id);
    if (missing.length) throw new Error(`${suite.name}: no fixtures for cases: ${missing.join(", ")}`);
    return runSuite({
      suite,
      cases: ds.cases,
      runs,
      modelFor: (c, run) => {
        const list = fixtures[c.id]!;
        return createFixtureModel(applyFault(fault, suite.name, list[run % list.length]!));
      },
      judge: createMockJudge(),
      meta: { mode, datasetVersion: ds.version, datasetHash: ds.hash, promptHash: prompt, model: "mock-fixture", judgeModel: "mock-judge" },
      prices,
    });
  }

  const model = opts.model ?? process.env.EVAL_MODEL ?? DEFAULT_MODEL;
  const judgeModel = opts.judgeModel ?? process.env.EVAL_JUDGE_MODEL ?? DEFAULT_JUDGE_MODEL;
  assertLiveKeys([model, judgeModel]);
  const sut = resolveModel(model);
  return runSuite({
    suite,
    cases: ds.cases,
    runs,
    modelFor: () => sut,
    judge: resolveModel(judgeModel),
    meta: { mode, datasetVersion: ds.version, datasetHash: ds.hash, promptHash: prompt, model, judgeModel },
    prices,
    concurrency: 2,
  });
}

export async function writeReport(report: SuiteReport, dir = REPORTS_DIR): Promise<string> {
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, `${safeId(report.suite)}.json`);
  await writeFile(file, JSON.stringify(report, null, 2) + "\n");
  return file;
}

export async function readReports(dir = REPORTS_DIR): Promise<SuiteReport[]> {
  let files: string[];
  try {
    files = (await readdir(dir)).filter((f) => f.endsWith(".json") && f !== SCORECARD_FILE);
  } catch {
    return [];
  }
  const reports = await Promise.all(files.map(async (f) => JSON.parse(await readFile(path.join(dir, f), "utf8")) as SuiteReport));
  return reports.sort((a, b) => a.suite.localeCompare(b.suite));
}
