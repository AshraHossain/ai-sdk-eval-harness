import { parseArgs } from "node:util";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { suiteNames } from "./suites";
import { executeSuite, REPORTS_DIR, writeReport } from "./runner/execute";
import { baselineFrom, evaluateGate } from "./runner/gate";
import { renderMarkdown } from "./runner/markdown";
import { baselinePath, loadBaseline, loadThresholds } from "./runner/load";
import { resolveMode } from "./models";

const { values } = parseArgs({
  options: {
    suite: { type: "string", multiple: true },
    runs: { type: "string", default: "5" },
    mode: { type: "string" },
    out: { type: "string", default: REPORTS_DIR },
    "no-gate": { type: "boolean", default: false },
    /** Record this run as evals/baselines/<mode>.json. Refused when the gate fails, unless --force. */
    "update-baseline": { type: "boolean", default: false },
    force: { type: "boolean", default: false },
  },
});

const runs = Number(values.runs);
if (!Number.isInteger(runs) || runs < 1) throw new Error("--runs must be a positive integer");
if (runs === 1) console.warn("⚠ --runs 1: flaky detection is off. Use --runs 2 or more for a meaningful gate.");
const mode = values.mode ? (values.mode === "live" ? "live" : "mock") : resolveMode();
const names = values.suite?.length ? values.suite : suiteNames;
const outDir = path.resolve(values.out!);

const reports = [];
for (const name of names) {
  const report = await executeSuite({ suite: name, runs, mode, outDir });
  await writeReport(report, outDir);
  const infra = report.summary.infraErrorRate ? `  infra errors ${(report.summary.infraErrorRate * 100).toFixed(1)}%` : "";
  console.log(`${name.padEnd(10)} pass ${(report.summary.passRate * 100).toFixed(1)}%  flaky ${report.summary.flakyCases}/${report.summary.cases}${infra}  (${report.durationMs}ms)`);
  const errors = report.cases.flatMap((c) => c.runs.flatMap((r) => (r.error ? [r.error] : [])));
  if (errors.length) {
    const total = report.cases.reduce((n, c) => n + c.runs.length, 0);
    console.error(`  ${errors.length}/${total} runs errored. First error: ${errors[0]}`);
  }
  reports.push(report);
}

const thresholds = await loadThresholds();
const baseline = await loadBaseline(mode);
const gate = evaluateGate(reports, thresholds, baseline);
const md = renderMarkdown(reports, gate);
await mkdir(outDir, { recursive: true });
await writeFile(path.join(outDir, "summary.md"), md);
console.log("\n" + md);

if (values["update-baseline"]) {
  // A baseline recorded from a failing run would silently lower the bar.
  if (!gate.ok && !values.force) {
    console.error("Refusing to update the baseline because the gate failed. Pass --force to override.");
    process.exit(2);
  }
  const file = baselinePath(mode);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(baselineFrom(reports, baseline, thresholds.quarantine), null, 2) + "\n");
  console.log(`Baseline updated: ${path.relative(process.cwd(), file)}`);
}

if (!gate.ok && !values["no-gate"]) {
  console.error("Eval gate FAILED");
  process.exit(1);
}
