import { cp, mkdtemp, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runCli } from "../../evals/cli";
import { readReports } from "../../evals/runner/execute";
import { selfTest } from "../../scripts/gate-selftest";
import { mockFaultNames } from "../../evals/mock/faults";

let out: string;
let evalsDir: string;
beforeEach(async () => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  out = await mkdtemp(path.join(tmpdir(), "cli-out-"));
  // Baseline writes go to a scratch copy, never the committed evals/baselines.
  evalsDir = await mkdtemp(path.join(tmpdir(), "cli-evals-"));
  await cp("evals/thresholds.json", path.join(evalsDir, "thresholds.json"));
  await cp("evals/baselines", path.join(evalsDir, "baselines"), { recursive: true });
});
afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.EVAL_MOCK_FAULT;
});

describe("eval CLI (offline)", () => {
  it("runs every suite, writes reports, summary and scorecard, and passes the gate", async () => {
    expect(await runCli(["--mode", "mock", "--runs", "5", "--out", out], evalsDir)).toBe(0);
    const files = await readdir(out);
    expect(files).toEqual(expect.arrayContaining(["summary.md", "scorecard.json", "rag.json", "agent.json"]));
    const card = JSON.parse(await readFile(path.join(out, "scorecard.json"), "utf8"));
    expect(card).toMatchObject({ mode: "mock", runsPerCase: 5, citationRecall: 1, toolCallAccuracy: 1 });
    expect(await readFile(path.join(out, "summary.md"), "utf8")).toContain("### Scorecard (mock, N=5)");
    // The scorecard is not mistaken for a suite report.
    expect((await readReports(out)).map((r) => r.suite)).toEqual(["agent", "classify", "extract", "rag", "summarize"]);
  });

  it("fails the gate (exit 1) on an injected regression, unless --no-gate", async () => {
    process.env.EVAL_MOCK_FAULT = "rag-no-citations";
    expect(await runCli(["--mode", "mock", "--suite", "rag", "--out", out], evalsDir)).toBe(1);
    expect(await runCli(["--mode", "mock", "--suite", "rag", "--out", out, "--no-gate"], evalsDir)).toBe(0);
  });

  it("refuses to record a baseline from a failing run (exit 2) unless --force", async () => {
    process.env.EVAL_MOCK_FAULT = "agent-skip-tools";
    const args = ["--mode", "mock", "--suite", "agent", "--out", out, "--update-baseline"];
    const file = path.join(evalsDir, "baselines", "mock.json");
    const before = await readFile(file, "utf8");
    expect(await runCli(args, evalsDir)).toBe(2);
    expect(await readFile(file, "utf8")).toBe(before);
    expect(await runCli([...args, "--force", "--no-gate"], evalsDir)).toBe(0);
    expect(await readFile(file, "utf8")).not.toBe(before);
  });

  it("records a baseline from a passing run", async () => {
    expect(await runCli(["--mode", "mock", "--suite", "classify", "--out", out, "--update-baseline"], evalsDir)).toBe(0);
  });

  it("warns at N=1 and rejects invalid --runs", async () => {
    expect(await runCli(["--mode", "mock", "--suite", "classify", "--runs", "1", "--out", out, "--no-gate"], evalsDir)).toBe(0);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("flaky detection is off"));
    await expect(runCli(["--runs", "0"])).rejects.toThrow(/positive integer/);
  });

  it("falls back to EVAL_MODE when --mode is absent", async () => {
    vi.stubEnv("EVAL_MODE", "mock");
    expect(await runCli(["--suite", "classify", "--out", out, "--no-gate"], evalsDir)).toBe(0);
    vi.unstubAllEnvs();
  });
});

describe("gate self-test", () => {
  it("passes when the clean run passes and every fault fails", () => {
    expect(selfTest((f) => (f ? 1 : 0), () => {})).toBe(0);
  });

  it("counts a gate that misses a regression", () => {
    const lines: string[] = [];
    expect(selfTest(() => 0, (l) => lines.push(l))).toBe(mockFaultNames.length);
    expect(lines.filter((l) => l.startsWith("✗"))).toHaveLength(mockFaultNames.length);
  });
});

describe("eval CLI error reporting", () => {
  it("prints how many runs errored and the first error", async () => {
    const execute = await import("../../evals/runner/execute");
    const real = await execute.executeSuite({ suite: "classify", runs: 1, mode: "mock" });
    const [first, ...rest] = real.cases;
    const broken = { ...real, cases: [{ ...first!, runs: [{ ...first!.runs[0]!, error: "model does not exist" }] }, ...rest] };
    vi.spyOn(execute, "executeSuite").mockResolvedValueOnce(broken);
    await runCli(["--mode", "mock", "--suite", "classify", "--out", out, "--no-gate"], evalsDir);
    expect(console.error).toHaveBeenCalledWith(expect.stringMatching(/1\/\d+ runs errored\. First error: model does not exist/));
  });
});

describe("spawnGate (real child process)", () => {
  it("returns exit 0 for a clean run and 1 for an injected fault", async () => {
    const { spawnGate } = await import("../../scripts/gate-selftest");
    const gate = spawnGate();
    expect(gate()).toBe(0);
    expect(gate("classify-shift-label")).toBe(1);
  }, 120_000);
});
