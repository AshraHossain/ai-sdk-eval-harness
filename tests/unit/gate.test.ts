import { describe, expect, it } from 'vitest';
import { baselineFrom, evaluateGate, gateConfigSchema, loadGateConfig, thresholdsFor, type Baseline } from '../../evals/runner/gate';
import { renderMarkdown } from '../../evals/runner/report';
import type { CaseResult, EvalReport, SuiteResult } from '../../evals/runner/types';

const config = gateConfigSchema.parse({
  defaults: { minPassRate: 0.9, maxFlakyRate: 0, maxRegression: 0.05, maxInfraErrorRate: 0.1, minJudgeScore: 0.75 },
  suites: { lenient: { minPassRate: 0.5 } },
  modes: { live: { maxFlakyRate: 0.5 } },
});

const meta: EvalReport['meta'] = { mode: 'mock', subjectModel: 'mock:s', judgeModel: 'mock:j', runsPerCase: 3, startedAt: 'now', durationMs: 1 };

function kase(id: string, stability: CaseResult['stability'], quarantined = false): CaseResult {
  const passes = stability === 'stable-pass' ? 3 : stability === 'flaky' ? 2 : 0;
  return {
    id,
    tags: quarantined ? ['known-flaky'] : [],
    runs: Array.from({ length: 3 }, (_, i) => ({ run: i, pass: i < passes, latencyMs: 1, scores: [] })),
    scoredRuns: 3,
    passes,
    passRate: passes / 3,
    ci95: { low: 0, high: 1 },
    stability,
    quarantined,
    flakyScorers: stability === 'flaky' ? ['label'] : [],
    meanScore: passes / 3,
  };
}

function suite(name: string, gatedPassRate: number, cases: CaseResult[], extra: Partial<SuiteResult> & { judgeMean?: number } = {}): SuiteResult {
  const { judgeMean, ...rest } = extra;
  return {
    name,
    description: name,
    runsPerCase: 3,
    cases,
    passRate: gatedPassRate,
    gatedPassRate,
    infraErrorRate: 0,
    quarantinedCaseIds: cases.filter((c) => c.quarantined).map((c) => c.id),
    stablePassRate: cases.filter((c) => c.stability === 'stable-pass').length / cases.length,
    flakyCaseIds: cases.filter((c) => c.stability === 'flaky').map((c) => c.id),
    scorers: judgeMean === undefined ? [] : [{ name: 'faithfulness', kind: 'judge', meanScore: judgeMean, passRate: 1 }],
    latency: { p50: 1, p95: 2 },
    durationMs: 10,
    ...rest,
  };
}

const report = (suites: SuiteResult[], m: Partial<EvalReport['meta']> = {}) => ({ meta: { ...meta, ...m }, suites });
const baseline = (b: Partial<Baseline> = {}): Baseline => ({
  updatedAt: 'x',
  mode: 'mock',
  subjectModel: 'mock:s',
  judgeModel: 'mock:j',
  runsPerCase: 3,
  suites: { s: { gatedPassRate: 1, cases: { a: 'stable-pass', b: 'stable-pass' } } },
  ...b,
});

describe('evaluateGate', () => {
  it('passes a healthy suite and notes the missing baseline', () => {
    const g = evaluateGate(report([suite('s', 1, [kase('a', 'stable-pass')], { judgeMean: 0.9 })]), config);
    expect(g.passed).toBe(true);
    expect(g.checks.map((c) => c.check)).toEqual(['pass_rate', 'flaky_rate', 'infra_error_rate', 'judge:faithfulness']);
    expect(g.notes.join(' ')).toMatch(/No mock baseline/);
  });

  it('fails on low pass rate, honouring per-suite overrides', () => {
    expect(evaluateGate(report([suite('s', 0.8, [kase('a', 'stable-pass')])]), config).passed).toBe(false);
    expect(evaluateGate(report([suite('lenient', 0.8, [kase('a', 'stable-pass')])]), config).passed).toBe(true);
  });

  it('fails on new flaky cases but not quarantined ones', () => {
    const newFlaky = evaluateGate(report([suite('s', 0.95, [kase('a', 'stable-pass'), kase('b', 'flaky')])]), config);
    expect(newFlaky.passed).toBe(false);
    expect(String(newFlaky.checks.find((c) => c.check === 'flaky_rate')!.actual)).toContain('b');
    const quarantined = evaluateGate(report([suite('s', 0.95, [kase('a', 'stable-pass'), kase('b', 'flaky', true)])]), config);
    expect(quarantined.passed).toBe(true);
  });

  it('applies mode overrides last (live tolerates more flakiness)', () => {
    expect(thresholdsFor(config, 'lenient', 'live')).toMatchObject({ minPassRate: 0.5, maxFlakyRate: 0.5 });
    const flaky = [suite('s', 0.95, [kase('a', 'stable-pass'), kase('b', 'flaky')])];
    expect(evaluateGate(report(flaky), config).passed).toBe(false);
    expect(evaluateGate(report(flaky, { mode: 'live' }), config).passed).toBe(true);
  });

  it('fails when too many runs hit infrastructure errors', () => {
    const g = evaluateGate(report([suite('s', 1, [kase('a', 'stable-pass')], { infraErrorRate: 0.3 })]), config);
    expect(g.checks.find((c) => c.check === 'infra_error_rate')!.ok).toBe(false);
  });

  it('fails on suite-level regression beyond tolerance', () => {
    const cases = [kase('a', 'stable-pass'), kase('b', 'stable-pass')];
    expect(evaluateGate(report([suite('s', 0.96, cases)]), config, baseline()).passed).toBe(true);
    const r = evaluateGate(report([suite('s', 0.92, cases)]), config, baseline());
    expect(r.checks.find((c) => c.check === 'regression_vs_baseline')!.ok).toBe(false);
  });

  it('fails on a case that went from stable-pass to stable-fail even when the rate is within tolerance', () => {
    const lenientBase = baseline({ suites: { lenient: { gatedPassRate: 0.6, cases: { a: 'stable-pass', b: 'stable-pass' } } } });
    const r = evaluateGate(report([suite('lenient', 0.6, [kase('a', 'stable-pass'), kase('b', 'stable-fail')])]), config, lenientBase);
    const check = r.checks.find((c) => c.check === 'newly_failing_cases')!;
    expect(check.ok).toBe(false);
    expect(check.actual).toBe('b');
  });

  it('skips regression checks when the baseline was recorded with a different mode or model', () => {
    const cases = [kase('a', 'stable-pass')];
    const live = evaluateGate(report([suite('s', 0.5, cases)], { mode: 'live' }), { ...config, defaults: { ...config.defaults, minPassRate: 0 } }, baseline());
    expect(live.checks.some((c) => c.check === 'regression_vs_baseline')).toBe(false);
    expect(live.notes.join(' ')).toMatch(/baseline mode mock ≠ live/);
    const otherModel = evaluateGate(report([suite('s', 1, cases)], { subjectModel: 'anthropic:x' }), config, baseline());
    expect(otherModel.notes.join(' ')).toMatch(/baseline subject/);
  });

  it('warns that N=1 disables flaky detection', () => {
    expect(evaluateGate(report([suite('s', 1, [kase('a', 'stable-pass')])], { runsPerCase: 1 }), config).notes.join(' ')).toMatch(/N=1/);
  });

  it('fails when a judge scorer mean drops below the bar', () => {
    expect(evaluateGate(report([suite('s', 1, [kase('a', 'stable-pass')], { judgeMean: 0.6 })]), config).passed).toBe(false);
  });

  it('builds a baseline with per-case stability, merging only compatible history', () => {
    const r = report([suite('s', 0.9, [kase('a', 'stable-pass'), kase('b', 'flaky')])]);
    const prev = baseline({ suites: { other: { gatedPassRate: 1, cases: {} } } });
    const b = baselineFrom(r, prev);
    expect(Object.keys(b.suites).sort()).toEqual(['other', 's']);
    expect(b.suites.s.cases).toEqual({ a: 'stable-pass', b: 'flaky' });
    expect(baselineFrom(r, { ...prev, subjectModel: 'different' }).suites.other).toBeUndefined();
  });

  it('loads and validates the committed gate config', () => {
    const c = loadGateConfig();
    expect(Object.keys(c.suites)).toEqual(expect.arrayContaining(['summarize', 'classify', 'extract', 'rag-qa', 'agent']));
    expect(c.modes.live?.maxFlakyRate).toBeGreaterThan(c.defaults.maxFlakyRate);
  });
});

describe('renderMarkdown', () => {
  it('summarizes suites, unstable cases, notes and gate checks', () => {
    const r: EvalReport = report([suite('s', 0.66, [kase('a', 'stable-pass'), kase('b', 'flaky', true)])]);
    r.gate = evaluateGate(r, config);
    const md = renderMarkdown(r);
    expect(md).toContain('❌ Eval gate failed');
    expect(md).toContain('b (quarantined)');
    expect(md).toContain('| s | pass_rate |');
    expect(md).toContain('> No mock baseline');
  });
});
