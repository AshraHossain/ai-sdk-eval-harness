import { pct, type GateResult } from "./gate";
import type { SuiteReport } from "./types";

export function renderMarkdown(reports: SuiteReport[], gate: { ok: boolean; results: GateResult[] }): string {
  const lines: string[] = [];
  const mode = reports[0]?.mode ?? "mock";
  lines.push(`## Eval gate: ${gate.ok ? "PASSED ✅" : "FAILED ❌"}`, "");
  lines.push(`Mode: \`${mode}\` · runs/case: ${reports[0]?.runsPerCase ?? "-"}`, "");
  lines.push("| Suite | Pass rate | Min | Flaky cases | Flake rate | Max | Mean score | Status |");
  lines.push("|---|---|---|---|---|---|---|---|");
  for (const r of reports) {
    const g = gate.results.find((x) => x.suite === r.suite)!;
    lines.push(
      `| ${r.suite} | ${pct(r.summary.passRate)} | ${pct(g.minPassRate)} | ${r.summary.flakyCases}/${r.summary.cases} | ${pct(r.summary.flakeRate)} | ${pct(g.maxFlakeRate)} | ${r.summary.meanScore.toFixed(2)} | ${g.ok ? "✅" : "❌ " + g.failures.join("; ")} |`,
    );
  }
  const flaky = reports.flatMap((r) => r.cases.filter((c) => c.flaky).map((c) => `${r.suite}/${c.id} (${pct(c.passRate)})`));
  const failing = reports.flatMap((r) => r.cases.filter((c) => c.passRate === 0).map((c) => `${r.suite}/${c.id}`));
  if (flaky.length) lines.push("", `**Flaky:** ${flaky.join(", ")}`);
  if (failing.length) lines.push("", `**Always failing:** ${failing.join(", ")}`);
  return lines.join("\n") + "\n";
}
