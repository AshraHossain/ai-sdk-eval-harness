/**
 * Gate self-test: a gate that never fails is worse than no gate.
 *
 * For every injected fault, run the evals in mock mode and assert the gate
 * exits 1. Then run clean and assert it exits 0. CI runs this on every PR.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { MOCK_FAULTS } from '../src/lib/mock/responders';

const out = mkdtempSync(path.join(tmpdir(), 'gate-selftest-'));
const tsx = path.join(process.cwd(), 'node_modules', '.bin', 'tsx');

function runGate(fault?: string): number {
  const r = spawnSync(tsx, ['evals/runner/cli.ts', '--runs', '3', '--out', out], {
    env: { ...process.env, EVAL_MODE: 'mock', EVAL_MOCK_FAULT: fault ?? '', GITHUB_STEP_SUMMARY: '' },
    encoding: 'utf8',
  });
  return r.status ?? 2;
}

let failures = 0;
const check = (label: string, got: number, want: number) => {
  const ok = got === want;
  if (!ok) failures++;
  console.log(`${ok ? '✓' : '✗'} ${label.padEnd(28)} exit ${got} (want ${want})`);
};

check('clean run', runGate(), 0);
for (const f of MOCK_FAULTS) check(`fault: ${f}`, runGate(f), 1);

if (failures) {
  console.error(`\n${failures} gate self-test(s) failed: the gate is not catching regressions it should.`);
  process.exit(1);
}
console.log('\nGate self-test passed: clean run passes, every injected regression is blocked.');
