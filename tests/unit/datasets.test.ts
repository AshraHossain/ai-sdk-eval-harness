import { describe, expect, it } from "vitest";
import { SUITES } from "../../evals/suites";
import { loadDataset, loadFixtures, loadThresholds, parseJsonl } from "../../evals/runner/load";
import { toSteps } from "../../evals/mock/mockModel";

describe.each(SUITES.map((s) => [s.name, s] as const))("golden dataset: %s", (name, suite) => {
  it("parses against the suite schema with unique ids", async () => {
    const ds = await loadDataset(suite);
    expect(ds.cases.length).toBeGreaterThanOrEqual(5);
    expect(ds.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(ds.hash).toHaveLength(12);
  });
  it("has mock fixtures for every case", async () => {
    const ds = await loadDataset(suite);
    const fx = await loadFixtures(name);
    for (const c of ds.cases) {
      expect(fx[c.id]?.length, `${name}/${c.id}`).toBeGreaterThan(0);
      for (const f of fx[c.id]!) expect(toSteps(f).length).toBeGreaterThan(0);
    }
    const stale = Object.keys(fx).filter((id) => !ds.cases.some((c) => c.id === id));
    expect(stale, "fixtures without a dataset case").toEqual([]);
  });
});

describe("parseJsonl", () => {
  const suite = SUITES.find((s) => s.name === "classify")!;
  it("rejects invalid JSON with a line number", () => expect(() => parseJsonl("{nope", suite)).toThrow(/classify:1: invalid JSON/));
  it("rejects schema violations", () => expect(() => parseJsonl('{"id":"a","text":"t","label":"zzz"}', suite)).toThrow(/label/));
  it("rejects duplicate ids", () => {
    const line = '{"id":"a","text":"t","label":"other"}';
    expect(() => parseJsonl(`${line}\n${line}`, suite)).toThrow(/duplicate case id/);
  });
  it("skips blank lines and comments", () => expect(parseJsonl('// c\n\n{"id":"a","text":"t","label":"other"}\n', suite)).toHaveLength(1));
});

describe("thresholds.json", () => {
  it("is valid and covers every suite", async () => {
    const t = await loadThresholds();
    for (const s of SUITES) expect(t.suites[s.name], s.name).toBeDefined();
  });
});
