import { APICallError } from 'ai';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { parseDataset } from '../../evals/runner/dataset';
import { mapPool, runSuite } from '../../evals/runner/run';
import { defineSuite, type SuiteContext } from '../../evals/suites/types';
import { getModel } from '../../src/lib/models';

const ctx: SuiteContext = { subject: getModel('subject'), judge: getModel('judge') };

const caseSchema = z.object({ id: z.string(), tags: z.array(z.string()).optional(), input: z.number(), expected: z.number() });

/** A toy suite whose behaviour is fully controlled by the test. */
function toySuite(run: (input: number, call: number) => Promise<number>) {
  const calls = new Map<number, number>();
  return defineSuite({
    name: 'toy',
    description: 'toy',
    dataset: 'toy.jsonl',
    caseSchema,
    run: async (input: number) => {
      const n = calls.get(input) ?? 0;
      calls.set(input, n + 1);
      return run(input, n);
    },
    score: async (c, output: number) => [
      { name: 'equal', kind: 'deterministic' as const, score: output === c.expected ? 1 : 0, pass: output === c.expected },
    ],
  });
}

const cases = [
  { id: 'stable', input: 1, expected: 1 },
  { id: 'flaky', input: 2, expected: 2, tags: ['known-flaky'] },
  { id: 'broken', input: 3, expected: 3 },
];

describe('runSuite (N-run)', () => {
  it('classifies stable, flaky and failing cases and computes rates', async () => {
    const suite = toySuite(async (input, call) => (input === 1 ? 1 : input === 2 ? (call % 2 === 0 ? 2 : -1) : -1));
    const r = await runSuite(suite, cases, ctx, { runs: 4 });
    const byId = Object.fromEntries(r.cases.map((c) => [c.id, c]));
    expect(byId.stable.stability).toBe('stable-pass');
    expect(byId.flaky).toMatchObject({ stability: 'flaky', passes: 2, quarantined: true, flakyScorers: ['equal'] });
    expect(byId.broken.stability).toBe('stable-fail');
    expect(r.flakyCaseIds).toEqual(['flaky']);
    expect(r.passRate).toBeCloseTo(6 / 12, 4);
    expect(r.stablePassRate).toBeCloseTo(1 / 3, 4);
    expect(byId.flaky.ci95.low).toBeLessThan(0.5);
    expect(byId.flaky.ci95.high).toBeGreaterThan(0.5);
  });

  it('captures thrown errors as failed runs rather than aborting the suite', async () => {
    const suite = toySuite(async (input) => {
      if (input === 3) throw new Error('rate limited');
      return input;
    });
    const r = await runSuite(suite, cases, ctx, { runs: 2 });
    const broken = r.cases.find((c) => c.id === 'broken')!;
    expect(broken.stability).toBe('stable-fail');
    expect(broken.runs[0].error).toBe('rate limited');
    expect(broken.runs[0].scores[0].name).toBe('execution');
    expect(r.cases.find((c) => c.id === 'stable')!.stability).toBe('stable-pass');
  });

  it('excludes infrastructure errors from pass rates and flaky detection', async () => {
    const rateLimited = () =>
      new APICallError({ message: 'rate limited', url: 'https://api', requestBodyValues: {}, statusCode: 429, isRetryable: true });
    const suite = toySuite(async (input, call) => {
      if (input === 1 && call === 1) throw rateLimited();
      if (input === 3) throw rateLimited();
      return input;
    });
    const r = await runSuite(suite, cases, ctx, { runs: 3 });
    const byId = Object.fromEntries(r.cases.map((c) => [c.id, c]));
    expect(byId.stable).toMatchObject({ stability: 'stable-pass', scoredRuns: 2, passes: 2 });
    expect(byId.stable.runs[1].infra).toBe(true);
    expect(byId.broken).toMatchObject({ stability: 'inconclusive', scoredRuns: 0 });
    expect(r.infraErrorRate).toBeCloseTo(4 / 9, 4);
    expect(r.passRate).toBe(1);
  });

  it('attributes intermittent exceptions to the execution scorer', async () => {
    const suite = toySuite(async (input, call) => {
      if (call === 1) throw new Error('NoObjectGeneratedError: could not parse');
      return input;
    });
    const r = await runSuite(suite, cases.slice(0, 1), ctx, { runs: 3 });
    expect(r.cases[0]).toMatchObject({ stability: 'flaky', flakyScorers: ['execution', 'equal'] });
  });

  it('computes the gated pass rate without quarantined cases', async () => {
    const suite = toySuite(async (input, call) => (input === 2 && call % 2 ? -1 : input));
    const r = await runSuite(suite, cases.slice(0, 2), ctx, { runs: 2 });
    expect(r.passRate).toBe(0.75);
    expect(r.gatedPassRate).toBe(1);
    expect(r.quarantinedCaseIds).toEqual(['flaky']);
  });

  it('applies filters and rejects bad run counts', async () => {
    const suite = toySuite(async (i) => i);
    const r = await runSuite(suite, cases, ctx, { runs: 1, filter: (c) => c.id === 'stable' });
    expect(r.cases.map((c) => c.id)).toEqual(['stable']);
    await expect(runSuite(suite, cases, ctx, { runs: 0 })).rejects.toThrow(RangeError);
  });

  it('keeps outputs only when asked', async () => {
    const suite = toySuite(async (i) => i);
    const without = await runSuite(suite, cases.slice(0, 1), ctx, { runs: 1 });
    expect(without.cases[0].runs[0].output).toBeUndefined();
    const withOut = await runSuite(suite, cases.slice(0, 1), ctx, { runs: 1, keepOutputs: true });
    expect(withOut.cases[0].runs[0].output).toBe(1);
  });
});

describe('mapPool', () => {
  it('preserves order and never exceeds the concurrency limit', async () => {
    let inFlight = 0;
    let peak = 0;
    const out = await mapPool([30, 10, 20, 5, 15], 2, async (ms, i) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, ms));
      inFlight--;
      return i;
    });
    expect(out).toEqual([0, 1, 2, 3, 4]);
    expect(peak).toBe(2);
  });
  it('rejects a non-integer concurrency instead of silently running nothing', async () => {
    await expect(mapPool([1], Number.NaN, async (x) => x)).rejects.toThrow(RangeError);
    await expect(mapPool([1], 0, async (x) => x)).rejects.toThrow(RangeError);
  });
});

describe('parseDataset', () => {
  const suite = toySuite(async (i) => i);
  it('reports the file and line of a bad row', () => {
    expect(() => parseDataset(suite, '{"id":"a","input":1,"expected":1}\n{"id":"b","input":"x","expected":1}', 'toy.jsonl')).toThrow(
      /toy\.jsonl:2: input/,
    );
    expect(() => parseDataset(suite, '{oops', 'toy.jsonl')).toThrow(/toy\.jsonl:1: invalid JSON/);
  });
  it('rejects duplicate ids and empty files', () => {
    const row = '{"id":"a","input":1,"expected":1}';
    expect(() => parseDataset(suite, `${row}\n${row}`)).toThrow(/duplicate case id/);
    expect(() => parseDataset(suite, '\n\n')).toThrow(/empty/);
  });
});
