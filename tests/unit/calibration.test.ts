import { describe, expect, it } from 'vitest';
import { bootstrapKappaCI, calibrate, cohensKappa, loadCalibrationSet, scoreAgreement } from '../../evals/calibration/calibrate';

describe('cohensKappa', () => {
  it('is 1 for perfect agreement and ~0 for chance', () => {
    expect(cohensKappa([true, false, true], [true, false, true])).toBe(1);
    expect(cohensKappa([true, true, false, false], [true, false, true, false])).toBe(0);
    expect(() => cohensKappa([], [])).toThrow();
  });
});

describe('bootstrapKappaCI', () => {
  it('is reproducible and brackets the point estimate', () => {
    const h = [true, true, false, false, true, false, true, false, true, true];
    const j = [true, true, false, true, true, false, true, false, false, true];
    const a = bootstrapKappaCI(h, j);
    expect(bootstrapKappaCI(h, j)).toEqual(a);
    const k = cohensKappa(h, j);
    expect(a.low).toBeLessThanOrEqual(k);
    expect(a.high).toBeGreaterThanOrEqual(k);
  });
});

describe('scoreAgreement', () => {
  it('fails a judge that disagrees with humans on pass/fail', () => {
    const r = scoreAgreement([
      { id: 'a', human: 5, judge: 2 },
      { id: 'b', human: 1, judge: 5 },
      { id: 'c', human: 5, judge: 5 },
      { id: 'd', human: 1, judge: 1 },
    ]);
    expect(r.ok).toBe(false);
    expect(r.meanAbsError).toBe(1.75);
  });
});

describe('judge calibration set', () => {
  it('has balanced, valid labels including the 3-4 pass/fail boundary', () => {
    const items = loadCalibrationSet();
    expect(items.length).toBeGreaterThanOrEqual(20);
    expect(items.filter((i) => i.humanScore === 3 || i.humanScore === 4).length).toBeGreaterThanOrEqual(6);
    expect(items.some((i) => i.humanScore >= 4)).toBe(true);
    expect(items.some((i) => i.humanScore <= 2)).toBe(true);
  });

  it('the mock judge meets the calibration bar', async () => {
    const r = await calibrate();
    expect(r.ok).toBe(true);
    expect(r.passFailKappa).toBeGreaterThanOrEqual(0.6);
  });
});
