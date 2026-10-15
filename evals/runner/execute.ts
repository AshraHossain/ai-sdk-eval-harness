import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { assertLiveKeys, DEFAULT_JUDGE_MODEL, DEFAULT_MODEL, resolveMode, resolveModel, type EvalMode } from "../models";
import { createFixtureModel, createMockJudge } from "../mock/mockModel";
import { getSuite } from "../suites";
import { loadDataset, loadFixtures } from "./load";
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
}

export const REPORTS_DIR = path.join(process.cwd(), "reports");

/** Runs one suite end-to-end (mock fixtures or live providers) and returns its report. */
export async function executeSuite(opts: ExecuteOptions): Promise<SuiteReport> {
  const suite = getSuite(opts.suite);
  const mode = opts.mode ?? resolveMode();
  const runs = opts.runs ?? 5;
  const ds = await loadDataset(suite);

  if (mode === "mock") {
    const fixtures = await loadFixtures(suite.name);
    const missing = ds.cases.filter((c) => !fixtures[c.id]?.length).map((c) => c.id);
    if (missing.length) throw new Error(`${suite.name}: no fixtures for cases: ${missing.join(", ")}`);
    return runSuite({
      suite,
      cases: ds.cases,
      runs,
      modelFor: (c, run) => {
        const list = fixtures[c.id]!;
        return createFixtureModel(list[run % list.length]!);
      },
      judge: createMockJudge(),
      meta: { mode, datasetVersion: ds.version, datasetHash: ds.hash, model: "mock-fixture", judgeModel: "mock-judge" },
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
    meta: { mode, datasetVersion: ds.version, datasetHash: ds.hash, model, judgeModel },
    concurrency: 2,
  });
}

export async function writeReport(report: SuiteReport, dir = REPORTS_DIR): Promise<string> {
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, `${report.suite}.json`);
  await writeFile(file, JSON.stringify(report, null, 2) + "\n");
  return file;
}

export async function readReports(dir = REPORTS_DIR): Promise<SuiteReport[]> {
  let files: string[] = [];
  try {
    files = (await readdir(dir)).filter((f) => f.endsWith(".json"));
  } catch {
    return [];
  }
  const reports = await Promise.all(files.map(async (f) => JSON.parse(await readFile(path.join(dir, f), "utf8")) as SuiteReport));
  return reports.sort((a, b) => a.suite.localeCompare(b.suite));
}
