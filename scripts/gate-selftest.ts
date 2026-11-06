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
import { MOCK_FAULTS, mockFaultNames } from "../evals/mock/faults";

const out = mkdtempSync(path.join(tmpdir(), "gate-selftest-"));
const tsx = path.join(process.cwd(), "node_modules", ".bin", "tsx");

function gate(fault?: (typeof mockFaultNames)[number]): number {
  const args = ["evals/cli.ts", "--mode", "mock", "--runs", "5", "--out", out];
  if (fault) args.push("--suite", MOCK_FAULTS[fault].suite);
  const r = spawnSync(tsx, args, { env: { ...process.env, EVAL_MOCK_FAULT: fault ?? "" }, encoding: "utf8" });
  return r.status ?? 2;
}

let failures = 0;
const check = (label: string, got: number, want: number) => {
  if (got !== want) failures++;
  console.log(`${got === want ? "✓" : "✗"} ${label.padEnd(30)} exit ${got} (want ${want})`);
};

check("clean run", gate(), 0);
for (const f of mockFaultNames) check(`fault: ${f}`, gate(f), 1);

if (failures) {
  console.error(`\n${failures} self-test check(s) failed: the gate is not catching regressions it should.`);
  process.exit(1);
}
console.log("\nGate self-test passed: the clean run passes and every injected regression is blocked.");
