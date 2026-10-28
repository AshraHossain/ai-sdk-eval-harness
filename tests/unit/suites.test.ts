/**
 * Integration: every real suite against the deterministic mock model.
 * This is the same path the CLI and the API route take.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { evaluateGate, loadGateConfig, runEvals } from '../../evals/runner';
import { loadDataset } from '../../evals/runner/dataset';
import { SUITES, getSuite } from '../../evals/suites';
import { evaluateExpression } from '../../src/lib/features/agent';
import { resetMockState } from '../../src/lib/mock/responders';

beforeEach(() => resetMockState());
afterEach(() => {
  delete process.env.EVAL_MOCK_FAULT;
});

describe('golden datasets', () => {
  it.each(SUITES.map((s) => [s.name, s] as const))('%s loads and validates', (_, suite) => {
    expect(loadDataset(suite).length).toBeGreaterThanOrEqual(5);
  });
  it('rejects unknown suite names', () => expect(() => getSuite('nope')).toThrow(/Unknown suite/));
});

describe('mock-mode eval run', () => {
  it('passes the gate with N=5 and flags only the known-flaky case', async () => {
    const report = await runEvals({ runs: 5 });
    report.gate = evaluateGate(report, loadGateConfig());
    expect(report.meta.mode).toBe('mock');
    expect(report.suites.map((s) => s.name)).toEqual(['summarize', 'classify', 'extract', 'rag-qa', 'agent']);
    expect(report.gate.passed).toBe(true);
    const flaky = report.suites.flatMap((s) => s.cases.filter((c) => c.stability === 'flaky'));
    expect(flaky.map((c) => c.id)).toEqual(['cls-010']);
    expect(flaky[0]).toMatchObject({ quarantined: true, flakyScorers: ['label'] });
  });

  it('does not see flakiness with a single run (why N > 1 matters)', async () => {
    const report = await runEvals({ suites: ['classify'], runs: 1 });
    expect(report.suites[0].flakyCaseIds).toEqual([]);
  });

  it('filters by case id or tag and leaves out suites with no matches', async () => {
    const r = await runEvals({ suites: ['rag-qa'], only: ['unanswerable'], runs: 1 });
    expect(r.suites[0].cases.map((c) => c.id)).toEqual(['rag-005', 'rag-006']);
    const one = await runEvals({ only: ['cls-001'], runs: 2 });
    expect(one.suites.map((s) => s.name)).toEqual(['classify']);
    expect(evaluateGate(one, loadGateConfig()).passed).toBe(true);
    await expect(runEvals({ only: ['no-such-case'], runs: 1 })).rejects.toThrow(/No cases matched/);
  });

  it.each([
    ['summarize-hallucinate', 'summarize', 'no_hallucinated_terms'],
    ['rag-no-citations', 'rag-qa', 'citations'],
    ['agent-skip-tools', 'agent', 'tool_trajectory'],
    // Output.object rejects the bad date inside the AI SDK, so it surfaces as an execution failure.
    ['extract-bad-date', 'extract', 'execution'],
  ])('fault %s fails suite %s via scorer %s', async (fault, suiteName, scorer) => {
    process.env.EVAL_MOCK_FAULT = fault;
    const report = await runEvals({ suites: [suiteName], runs: 2 });
    report.gate = evaluateGate(report, loadGateConfig());
    expect(report.gate.passed).toBe(false);
    const failing = report.suites[0].scorers.find((s) => s.name === scorer)!;
    expect(failing.passRate).toBeLessThan(1);
  });
});

describe('agent calculator tool', () => {
  it('evaluates arithmetic and refuses anything else', () => {
    expect(evaluateExpression('96 / 4 + 2.5')).toBe(26.5);
    expect(evaluateExpression('08 + 1')).toBe(9);
    expect(evaluateExpression('10.05 * 2')).toBe(20.1);
    expect(() => evaluateExpression('1+'.repeat(150) + '1')).toThrow(/too long/);
    expect(() => evaluateExpression('process.exit(1)')).toThrow(/Unsupported/);
    expect(() => evaluateExpression('1/0')).toThrow(/Non-finite/);
  });
});
