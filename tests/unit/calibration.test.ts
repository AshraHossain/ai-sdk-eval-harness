import { describe, expect, it } from "vitest";
import { bootstrapKappaCI, calibrate, cohensKappa, loadCalibrationSet, scoreAgreement } from "../../evals/calibration/calibrate";
import { createMockJudge } from "../../evals/mock/mockModel";

describe("cohensKappa", () => {
  it("is 1 for perfect agreement and 0 for chance", () => {
    expect(cohensKappa([true, false, true], [true, false, true])).toBe(1);
    expect(cohensKappa([true, true, false, false], [true, false, true, false])).toBe(0);
    expect(() => cohensKappa([], [])).toThrow();
  });
});

describe("bootstrapKappaCI", () => {
  it("is reproducible and brackets the point estimate", () => {
    const h = [true, true, false, false, true, false, true, false, true, true];
    const j = [true, true, false, true, true, false, true, false, false, true];
    const ci = bootstrapKappaCI(h, j);
    expect(bootstrapKappaCI(h, j)).toEqual(ci);
    expect(ci.low).toBeLessThanOrEqual(cohensKappa(h, j));
    expect(ci.high).toBeGreaterThanOrEqual(cohensKappa(h, j));
  });
});

describe("scoreAgreement", () => {
  it("passes an agreeing judge and fails a disagreeing one", () => {
    const agree = scoreAgreement([1, 2, 4, 5, 5, 1].map((s, i) => ({ id: `${i}`, human: s, judge: s })));
    expect(agree).toMatchObject({ ok: true, passFailKappa: 1, exactAgreement: 1, meanAbsError: 0 });
    const flipped = scoreAgreement([{ id: "a", human: 5, judge: 2 }, { id: "b", human: 1, judge: 5 }, { id: "c", human: 5, judge: 5 }, { id: "d", human: 1, judge: 1 }]);
    expect(flipped.ok).toBe(false);
    expect(flipped.meanAbsError).toBe(1.75);
  });
});

describe("calibration set", () => {
  it("is valid and leans on the 2-4 boundary", async () => {
    const items = await loadCalibrationSet();
    expect(items.length).toBeGreaterThanOrEqual(20);
    expect(new Set(items.map((i) => i.id)).size).toBe(items.length);
    expect(items.filter((i) => i.humanScore >= 2 && i.humanScore <= 4).length).toBeGreaterThanOrEqual(8);
  });

  it("runs end to end against the mock judge", async () => {
    const r = await calibrate(createMockJudge());
    expect(r.n).toBeGreaterThanOrEqual(20);
    expect(r.rows.every((x) => x.judge >= 1 && x.judge <= 5)).toBe(true);
    // The coverage heuristic cannot see invented facts: documented, not hidden.
    expect(r.rows.find((x) => x.id === "cal-012")!.judge).toBeGreaterThanOrEqual(4);
  });
});
