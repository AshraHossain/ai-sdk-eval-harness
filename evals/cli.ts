import { parseArgs } from "node:util";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { suiteNames } from "./suites";
import { executeSuite, REPORTS_DIR, writeReport } from "./runner/execute";
import { evaluateGate } from "./runner/gate";
import { renderMarkdown } from "./runner/markdown";
import { loadThresholds } from "./runner/load";
import { resolveMode } from "./models";

const { values } = parseArgs({
  options: {
    suite: { type: "string", multiple: true },
    runs: { type: "string", default: "5" },
    mode: { type: "string" },
    out: { type: "string", default: REPORTS_DIR },
    "no-gate": { type: "boolean", default: false },
  },
});

const runs = Number(values.runs);
if (!Number.isInteger(runs) || runs < 1) throw new Error("--runs must be a positive integer");
const mode = values.mode ? (values.mode === "live" ? "live" : "mock") : resolveMode();
const names = values.suite?.length ? values.suite : suiteNames;
const outDir = path.resolve(values.out!);

const reports = [];
for (const name of names) {
  const report = await executeSuite({ suite: name, runs, mode, outDir });
  await writeReport(report, outDir);
  console.log(`${name.padEnd(10)} pass ${(report.summary.passRate * 100).toFixed(1)}%  flaky ${report.summary.flakyCases}/${report.summary.cases}  (${report.durationMs}ms)`);
  const errors = report.cases.flatMap((c) => c.runs.flatMap((r) => (r.error ? [r.error] : [])));
  if (errors.length) {
    const total = report.cases.reduce((n, c) => n + c.runs.length, 0);
    console.error(`  ${errors.length}/${total} runs errored. First error: ${errors[0]}`);
  }
  reports.push(report);
}

const gate = evaluateGate(reports, await loadThresholds());
const md = renderMarkdown(reports, gate);
await mkdir(outDir, { recursive: true });
await writeFile(path.join(outDir, "summary.md"), md);
console.log("\n" + md);

if (!gate.ok && !values["no-gate"]) {
  console.error("Eval gate FAILED");
  process.exit(1);
}
