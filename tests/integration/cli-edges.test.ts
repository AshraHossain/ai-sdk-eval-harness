import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SuiteReport } from "../../evals/runner/types";

const infraReport: SuiteReport = {
  suite: "classify", title: "classify", mode: "mock", runsPerCase: 2, datasetVersion: "1", datasetHash: "h",
  promptHash: "p", model: "m", judgeModel: "j", startedAt: "", durationMs: 1, cases: [],
  usage: { model: { inputTokens: 0, outputTokens: 0 }, judge: { inputTokens: 0, outputTokens: 0 }, costUsd: 0 },
  summary: { cases: 0, passRate: 1, meanScore: 1, flakyCases: 0, flakeRate: 0, failingCases: 0, infraErrorRate: 0.25 },
};

vi.mock("../../evals/runner/execute", async (orig) => {
  const actual = await orig<typeof import("../../evals/runner/execute")>();
  return { ...actual, executeSuite: vi.fn(actual.executeSuite) };
});

const { runCli } = await import("../../evals/cli");
const execute = await import("../../evals/runner/execute");
const { spawnGate } = await import("../../scripts/gate-selftest");

const KEYS = ["ANTHROPIC_API_KEY", "EVAL_MODEL", "EVAL_JUDGE_MODEL", "EVAL_MODE"] as const;
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
let out: string;
let log: ReturnType<typeof vi.spyOn>;
beforeEach(async () => {
  log = vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  out = await mkdtemp(path.join(tmpdir(), "cli-edges-"));
});
afterEach(() => {
  vi.restoreAllMocks();
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("eval CLI edges", () => {
  it("prints the infra error rate when provider errors were separated out", async () => {
    vi.mocked(execute.executeSuite).mockResolvedValueOnce(infraReport);
    expect(await runCli(["--mode", "mock", "--suite", "classify", "--runs", "2", "--out", out, "--no-gate"])).toBe(0);
    expect(log.mock.calls.flat().join("\n")).toContain("infra errors 25.0%");
  });

  it("--mode live requires provider keys before any call is made", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.EVAL_MODEL;
    delete process.env.EVAL_JUDGE_MODEL;
    await expect(runCli(["--mode", "live", "--suite", "classify", "--runs", "1", "--out", out, "--no-gate"])).rejects.toThrow(/ANTHROPIC_API_KEY/);
  });

  it("executeSuite defaults to EVAL_MODE and 5 runs", async () => {
    delete process.env.EVAL_MODE;
    const r = await execute.executeSuite({ suite: "classify" });
    expect(r).toMatchObject({ mode: "mock", runsPerCase: 5 });
  });
});

describe("gate self-test runner", () => {
  it("reports exit code 2 when the CLI cannot be spawned", () => {
    vi.spyOn(process, "cwd").mockReturnValue(out);
    expect(spawnGate(out)()).toBe(2);
  });
});
