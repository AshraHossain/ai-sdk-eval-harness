import { describeModel, getEvalMode, getModel } from '../../src/lib/models';
import { getSuite, SUITES } from '../suites';
import { loadDataset } from './dataset';
import { runSuite, type RunSuiteOptions } from './run';
import type { EvalReport } from './types';

export interface RunEvalsOptions extends Omit<RunSuiteOptions, 'filter'> {
  suites?: string[];
  /** Case ids or tags to include; empty means all. */
  only?: string[];
  gitSha?: string;
}

/** Runs the selected suites and returns an (ungated) report. Shared by the CLI and the API route. */
export async function runEvals({ suites, only, gitSha, ...opts }: RunEvalsOptions = {}): Promise<EvalReport> {
  const selected = suites?.length ? suites.map(getSuite) : SUITES;
  const subject = getModel('subject');
  const judge = getModel('judge');
  const startedAt = new Date();
  const t0 = performance.now();
  const results = [];
  const match = (c: { id: string; tags?: string[] }) => !only?.length || only.some((o) => c.id === o || c.tags?.includes(o));
  for (const suite of selected) {
    const cases = loadDataset(suite).filter(match);
    // A filter that selects nothing from a suite leaves it out of the report,
    // rather than reporting a 0% pass rate that would fail the gate.
    if (cases.length === 0) continue;
    results.push(await runSuite(suite, cases, { subject, judge }, opts));
  }
  if (results.length === 0) throw new Error(`No cases matched${only?.length ? ` --only ${only.join(',')}` : ''}.`);
  const warnings: string[] = [];
  const family = (m: string) => m.split(/[.:]/)[0];
  if (getEvalMode() === 'live' && family(describeModel(subject)) === family(describeModel(judge))) {
    warnings.push('Judge and subject share a provider family, which risks self-preference bias. Consider EVAL_JUDGE_PROVIDER.');
  }
  return {
    meta: {
      mode: getEvalMode(),
      ...(warnings.length ? { warnings } : {}),
      subjectModel: describeModel(subject),
      judgeModel: describeModel(judge),
      runsPerCase: opts.runs ?? 1,
      startedAt: startedAt.toISOString(),
      durationMs: Math.round(performance.now() - t0),
      ...(gitSha ? { gitSha } : {}),
    },
    suites: results,
  };
}

export * from './gate';
export * from './report';
export * from './types';
