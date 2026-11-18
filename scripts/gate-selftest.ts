/**
 * Gate self-test: a gate that never fails is worse than no gate.
 *
 * Runs the mock gate once clean (must exit 0) and once per injected fault in
 * evals/mock/faults.ts (each must exit 1). CI runs this on every push.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MOCK_FAULTS, mockFaultNames, type MockFault } from "../evals/mock/faults";

/** Runs the gate (optionally with one fault injected) and returns its exit code. */
export type GateRunner = (fault?: MockFault) => number;

/** Spawns the real CLI in a child process, so exit codes are exactly what CI sees. */
export function spawnGate(out = mkdtempSync(path.join(tmpdir(), "gate-selftest-"))): GateRunner {
  const tsx = path.join(process.cwd(), "node_modules", ".bin", "tsx");
  return (fault) => {
    const args = ["evals/cli.ts", "--mode", "mock", "--runs", "5", "--out", out];
    if (fault) args.push("--suite", MOCK_FAULTS[fault].suite);
    const r = spawnSync(tsx, args, { env: { ...process.env, EVAL_MOCK_FAULT: fault ?? "" }, encoding: "utf8" });
    return r.status ?? 2;
  };
}

/** Returns the number of failed checks: 0 means the clean run passed and every fault was blocked. */
export function selfTest(gate: GateRunner, log: (line: string) => void = console.log): number {
  let failures = 0;
  const check = (label: string, got: number, want: number) => {
    if (got !== want) failures++;
    log(`${got === want ? "✓" : "✗"} ${label.padEnd(30)} exit ${got} (want ${want})`);
  };
  check("clean run", gate(), 0);
  for (const f of mockFaultNames) check(`fault: ${f}`, gate(f), 1);
  return failures;
}

/* v8 ignore start -- process entry point; CI runs it for real (npm run eval / eval:calibrate / eval:selftest) */
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const failures = selfTest(spawnGate());
  if (failures) {
    console.error(`\n${failures} self-test check(s) failed: the gate is not catching regressions it should.`);
    process.exitCode = 1;
  } else {
    console.log("\nGate self-test passed: the clean run passes and every injected regression is blocked.");
  }
}
/* v8 ignore stop */
