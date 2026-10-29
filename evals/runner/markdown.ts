import { pct, type Gate } from "./gate";
import type { SuiteReport } from "./types";

export function renderMarkdown(reports: SuiteReport[], gate: Gate): string {
  const lines: string[] = [];
  const mode = reports[0]?.mode ?? "mock";
  lines.push(`## Eval gate: ${gate.ok ? "PASSED ✅" : "FAILED ❌"}`, "");
  lines.push(`Mode: \`${mode}\` · runs/case: ${reports[0]?.runsPerCase ?? "-"}`, "");
  lines.push("| Suite | Pass rate | Min | Flaky cases | Flake rate | Max | vs baseline | Infra errors | Mean score | Status |");
  lines.push("|---|---|---|---|---|---|---|---|---|---|");
  for (const r of reports) {
    const g = gate.results.find((x) => x.suite === r.suite)!;
    lines.push(
      `| ${r.suite} | ${pct(g.passRate)} | ${pct(g.minPassRate)} | ${r.summary.flakyCases}/${r.summary.cases} | ${pct(g.flakeRate)} | ${pct(g.maxFlakeRate)} | ${g.regression === undefined ? "—" : (g.regression > 0 ? "−" : "+") + pct(Math.abs(g.regression))} | ${g.infraErrorRate ? pct(g.infraErrorRate) : "—"} | ${r.summary.meanScore.toFixed(2)} | ${g.ok ? "✅" : "❌ " + g.failures.join("; ")} |`,
    );
  }
  const flaky = reports.flatMap((r) =>
    r.cases
      .filter((c) => c.flaky)
      .map((c) => `${r.suite}/${c.id} (${pct(c.passRate)}, 95% CI ${pct(c.ci95.low)}–${pct(c.ci95.high)}${c.flakyScorers.length ? `, unstable: ${c.flakyScorers.join("/")}` : ""})`),
  );
  const quarantined = gate.results.flatMap((g) => g.quarantined.map((id) => `${g.suite}/${id}`));
  const failing = reports.flatMap((r) => r.cases.filter((c) => c.stability === "stable-fail").map((c) => `${r.suite}/${c.id}`));
  if (flaky.length) lines.push("", `**Flaky:** ${flaky.join(", ")}`);
  if (failing.length) lines.push("", `**Always failing:** ${failing.join(", ")}`);
  if (quarantined.length) lines.push("", `**Quarantined (reported, not gated):** ${quarantined.join(", ")}`);
  if (gate.notes.length) lines.push("", ...gate.notes.map((n) => `> ${n}`));
  return lines.join("\n") + "\n";
}
