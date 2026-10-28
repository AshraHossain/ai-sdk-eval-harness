/**
 * npm run eval -- [--suite a,b] [--runs N] [--only id|tag,...] [--concurrency C]
 *                 [--out reports] [--update-baseline [--force]] [--no-gate] [--keep-outputs]
 *
 * Exit codes: 0 gate passed (or --no-gate), 1 gate failed, 2 harness/usage error.
 */
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { baselineFrom, baselinePath, evaluateGate, loadBaseline, loadGateConfig, renderMarkdown, runEvals } from './index';

const csv = (v?: string) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : undefined);

function positiveInt(name: string, raw: string): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) throw new UsageError(`--${name} must be a positive integer, got "${raw}"`);
  return n;
}

class UsageError extends Error {}

async function main() {
  const { values } = parseArgs({
    options: {
      suite: { type: 'string' },
      runs: { type: 'string', default: process.env.EVAL_RUNS || '5' },
      only: { type: 'string' },
      concurrency: { type: 'string', default: '4' },
      out: { type: 'string', default: 'reports' },
      'update-baseline': { type: 'boolean', default: false },
      force: { type: 'boolean', default: false },
      'no-gate': { type: 'boolean', default: false },
      'keep-outputs': { type: 'boolean', default: false },
    },
  });

  const runs = positiveInt('runs', values.runs);
  const concurrency = positiveInt('concurrency', values.concurrency);
  const only = csv(values.only);
  if (runs === 1 && !values['no-gate']) console.warn('⚠ --runs 1: flaky detection is off. Use --runs 2 or more for a meaningful gate.\n');

  const report = await runEvals({
    suites: csv(values.suite),
    only,
    runs,
    concurrency,
    keepOutputs: values['keep-outputs'],
    gitSha: process.env.GITHUB_SHA,
    onCaseDone: (c) => {
      const mark = { 'stable-pass': '✓', flaky: '~', 'stable-fail': '✗', inconclusive: '?' }[c.stability];
      const extra = c.stability === 'flaky' ? `  flaky${c.quarantined ? ' (quarantined)' : ''} [${c.flakyScorers.join(', ')}]` : '';
      process.stdout.write(`  ${mark} ${c.id.padEnd(10)} ${c.passes}/${c.scoredRuns}${extra}\n`);
    },
  });

  const bPath = baselinePath(report.meta.mode);
  const baseline = loadBaseline(bPath);
  if (!values['no-gate']) report.gate = evaluateGate(report, loadGateConfig(), baseline);

  const outDir = path.resolve(values.out);
  mkdirSync(outDir, { recursive: true });
  const md = renderMarkdown(report);
  writeFileSync(path.join(outDir, 'latest.json'), JSON.stringify(report, null, 2));
  writeFileSync(path.join(outDir, 'summary.md'), md);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);

  console.log('\n' + md);
  console.log(`Report: ${path.relative(process.cwd(), path.join(outDir, 'latest.json'))}`);

  if (values['update-baseline']) {
    // A baseline recorded from a failing or partial run would silently lower the bar.
    const refuse =
      only?.length ? 'a --only filter is set' : report.gate && !report.gate.passed ? 'the gate failed' : values['no-gate'] ? '--no-gate is set' : undefined;
    if (refuse && !values.force) {
      console.error(`Refusing to update the baseline because ${refuse}. Pass --force to override.`);
      process.exitCode = 2;
      return;
    }
    mkdirSync(path.dirname(bPath), { recursive: true });
    writeFileSync(bPath, JSON.stringify(baselineFrom(report, baseline), null, 2) + '\n');
    console.log(`Baseline updated: ${path.relative(process.cwd(), bPath)}`);
  }
  process.exitCode = report.gate && !report.gate.passed ? 1 : 0;
}

main().catch((err) => {
  console.error(err instanceof UsageError ? `Usage error: ${err.message}` : err instanceof Error ? err.stack : err);
  process.exitCode = 2;
});
