import type { EvalReport } from './types';

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

/** Markdown summary for humans: PR comments, the Actions job summary, terminals. */
export function renderMarkdown(report: EvalReport): string {
  const { meta, suites, gate } = report;
  const lines: string[] = [];
  lines.push(`## ${gate ? (gate.passed ? '✅ Eval gate passed' : '❌ Eval gate failed') : 'Eval report'}`);
  lines.push('');
  lines.push(`Mode **${meta.mode}** · subject \`${meta.subjectModel}\` · judge \`${meta.judgeModel}\` · **N=${meta.runsPerCase}** runs/case · ${(meta.durationMs / 1000).toFixed(1)}s${meta.gitSha ? ` · \`${meta.gitSha.slice(0, 7)}\`` : ''}`);
  lines.push('');
  lines.push('| Suite | Cases | Pass rate (gated) | Stable pass | Flaky | Infra errors | p95 latency |');
  lines.push('|---|---:|---:|---:|---|---:|---:|');
  for (const s of suites) {
    const flaky = s.flakyCaseIds.length
      ? s.flakyCaseIds.map((id) => (s.cases.find((c) => c.id === id)?.quarantined ? `${id} (quarantined)` : `**${id}**`)).join(', ')
      : '—';
    lines.push(`| ${s.name} | ${s.cases.length} | ${pct(s.gatedPassRate)} | ${pct(s.stablePassRate)} | ${flaky} | ${s.infraErrorRate ? pct(s.infraErrorRate) : '—'} | ${s.latency.p95} ms |`);
  }

  const failing = suites.flatMap((s) => s.cases.filter((c) => c.stability !== 'stable-pass').map((c) => ({ s, c })));
  if (failing.length) {
    lines.push('');
    lines.push('### Unstable or failing cases');
    lines.push('');
    lines.push('| Suite | Case | Passes | 95% CI | Status | Unstable scorers | First failure |');
    lines.push('|---|---|---:|---|---|---|---|');
    for (const { s, c } of failing) {
      const firstFail = c.runs.find((r) => !r.pass);
      const why = firstFail?.scores.filter((x) => !x.pass).map((x) => `${x.name}: ${x.detail ?? 'failed'}`).join('; ') ?? '';
      lines.push(
        `| ${s.name} | ${c.id} | ${c.passes}/${c.scoredRuns} | [${pct(c.ci95.low)}, ${pct(c.ci95.high)}] | ${c.stability}${c.quarantined ? ' (quarantined)' : ''} | ${c.flakyScorers.join(', ') || '—'} | ${escapeCell(why)} |`,
      );
    }
  }

  if (meta.warnings?.length) {
    lines.push('');
    lines.push(...meta.warnings.map((w) => `> ⚠ ${w}`));
  }

  if (gate) {
    if (gate.notes.length) {
      lines.push('');
      lines.push(...gate.notes.map((n) => `> ${n}`));
    }
    lines.push('');
    lines.push('### Gate checks');
    lines.push('');
    lines.push('| Suite | Check | Actual | Threshold | |');
    lines.push('|---|---|---|---|---|');
    for (const c of gate.checks) lines.push(`| ${c.suite} | ${c.check} | ${c.actual} | ${c.threshold} | ${c.ok ? '✅' : '❌'} |`);
  }
  return lines.join('\n') + '\n';
}

function escapeCell(s: string): string {
  const t = s.replace(/\|/g, '\\|').replace(/\n/g, ' ');
  return t.length > 140 ? `${t.slice(0, 137)}...` : t;
}
