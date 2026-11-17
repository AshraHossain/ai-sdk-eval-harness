import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFixtureModel, createMockJudge } from "../../evals/mock/mockModel";

// The live path with providers swapped for offline fixtures: exercises wiring, never the network.
vi.mock("../../evals/models", async (orig) => ({
  ...(await orig<typeof import("../../evals/models")>()),
  assertLiveKeys: vi.fn(),
  resolveModel: vi.fn((spec: string) =>
    spec.includes("judge") ? createMockJudge() : createFixtureModel({ label: "billing", confidence: 0.9 }),
  ),
}));

const { executeSuite, readReports } = await import("../../evals/runner/execute");
const load = await import("../../evals/runner/load");
const { runCalibration } = await import("../../evals/calibration/calibrate");
const models = await import("../../evals/models");

afterEach(() => vi.restoreAllMocks());

describe("executeSuite: live wiring (providers mocked)", () => {
  it("resolves the target and judge models from options and records them", async () => {
    const r = await executeSuite({ suite: "classify", runs: 1, mode: "live", model: "x:target", judgeModel: "x:judge" });
    expect(r).toMatchObject({ mode: "live", model: "x:target", judgeModel: "x:judge" });
    expect(models.assertLiveKeys).toHaveBeenCalledWith(["x:target", "x:judge"]);
    expect(r.summary.cases).toBeGreaterThan(0);
  });

  it("falls back to EVAL_MODEL / defaults", async () => {
    vi.stubEnv("EVAL_MODEL", "x:from-env");
    const r = await executeSuite({ suite: "classify", runs: 1, mode: "live" });
    expect(r.model).toBe("x:from-env");
    expect(r.judgeModel).toBe(models.DEFAULT_JUDGE_MODEL);
    vi.unstubAllEnvs();
  });

  it("refuses mock runs with missing fixtures", async () => {
    vi.spyOn(load, "loadFixtures").mockResolvedValueOnce({});
    await expect(executeSuite({ suite: "classify", runs: 1, mode: "mock" })).rejects.toThrow(/no fixtures for cases/);
  });

  it("reads no reports from a missing directory", async () => {
    expect(await readReports(path.join(await mkdtemp(path.join(tmpdir(), "r-")), "missing"))).toEqual([]);
  });

  it("rejects a report whose suite name would escape the reports dir", async () => {
    const { writeReport } = await import("../../evals/runner/execute");
    const r = await executeSuite({ suite: "classify", runs: 1, mode: "mock" });
    await expect(writeReport({ ...r, suite: "../evil" }, await mkdtemp(path.join(tmpdir(), "w-")))).rejects.toThrow(/unsafe identifier/);
  });
});

describe("runCalibration", () => {
  const item = (id: string, output: string, humanScore: number) => ({ id, name: "faithfulness", rubric: "r", input: "q", reference: "paris france capital city", output, humanScore });
  const agreeing = [item("a", "paris france capital city", 5), item("b", "zzz", 1), item("c", "paris france capital city", 5), item("d", "qqq", 1)];

  it("never fails CI in mock mode", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "table").mockImplementation(() => {});
    expect(await runCalibration("mock")).toBe(0);
  });

  it("fails a live judge below the bar and passes one that agrees", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "table").mockImplementation(() => {});
    vi.stubEnv("EVAL_JUDGE_MODEL", "x:judge");
    expect(await runCalibration("live")).toBe(1);
    expect(await runCalibration("live", agreeing)).toBe(0);
    vi.unstubAllEnvs();
  });
});
