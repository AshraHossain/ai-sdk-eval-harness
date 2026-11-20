import { cp, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { runCli } from "../../evals/cli";
import { BEGIN, END, renderReadmeScorecard, replaceBlock, syncReadme } from "../../scripts/readme-scorecard";
import { buildScorecard } from "../../evals/runner/scorecard";
import { readReports } from "../../evals/runner/execute";
import type { Gate } from "../../evals/runner/gate";

let reportsDir: string;
let evalsDir: string;
beforeAll(async () => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  reportsDir = await mkdtemp(path.join(tmpdir(), "readme-reports-"));
  evalsDir = await mkdtemp(path.join(tmpdir(), "readme-evals-"));
  await cp("evals/thresholds.json", path.join(evalsDir, "thresholds.json"));
  await cp("evals/baselines", path.join(evalsDir, "baselines"), { recursive: true });
  expect(await runCli(["--mode", "mock", "--runs", "5", "--out", reportsDir], evalsDir)).toBe(0);
});

const readmeWith = async (body: string) => {
  const p = path.join(await mkdtemp(path.join(tmpdir(), "readme-")), "README.md");
  await writeFile(p, `# Title\n\n${BEGIN}\n${body}\n${END}\n\nAfter.\n`);
  return p;
};

describe("README scorecard generator", () => {
  it("renders every suite with its case count, seeded cases and gate status", async () => {
    const reports = await readReports(reportsDir);
    const gate = { ok: false, results: [{ suite: "agent", ok: false }], notes: [] } as unknown as Gate;
    const md = renderReadmeScorecard(buildScorecard(reports), reports, gate);
    expect(md).toContain("| classify | 15 | 93.3% | 0/15 | always failing: `c06` |");
    expect(md).toContain("flaky: `s05`");
    expect(md).toMatch(/\| agent \| 15 \| 100\.0% \| 0\/15 \| — \| ❌ \|/);
    expect(md).not.toMatch(/\d+ ms/);
  });

  it("labels live scorecards and shows missing metrics as a dash", async () => {
    const reports = await readReports(reportsDir);
    const card = { ...buildScorecard(reports), mode: "live" as const, citationRecall: null };
    const md = renderReadmeScorecard(card, [], { ok: true, results: [], notes: [] });
    expect(md).toMatch(/^Live run/);
    expect(md).toContain("| Citation recall (Recall@k, rag) | — |");
  });

  it("replaces only the text between the markers", () => {
    const out = replaceBlock(`a\n${BEGIN}\nold\n${END}\nz`, "new");
    expect(out).toBe(`a\n${BEGIN}\nnew\n${END}\nz`);
    expect(() => replaceBlock("no markers", "x")).toThrow(/missing/);
    expect(() => replaceBlock(`${END}\n${BEGIN}`, "x")).toThrow(/missing/);
  });

  it("rewrites a stale README, then --check passes; --check fails on drift", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const readmePath = await readmeWith("stale numbers");
    const opts = { readmePath, reportsDir, evalsDir };
    expect(await syncReadme({ ...opts, check: true })).toBe(1);
    expect(err).toHaveBeenCalled();
    expect(await syncReadme({ ...opts, check: false })).toBe(0);
    expect(await readFile(readmePath, "utf8")).toContain("| summarize | 15 |");
    expect(await syncReadme({ ...opts, check: true })).toBe(0);
    err.mockRestore();
  });

  it("refuses to run without reports", async () => {
    const empty = await mkdtemp(path.join(tmpdir(), "readme-empty-"));
    await expect(syncReadme({ check: true, readmePath: await readmeWith(""), reportsDir: empty, evalsDir })).rejects.toThrow(/No reports/);
  });

  it("the committed README matches the committed fixtures", async () => {
    expect(await syncReadme({ check: true, readmePath: "README.md", reportsDir, evalsDir })).toBe(0);
  });
});
