import type { ScoreResult } from '../scorers/types';
import type { Interval, Stability } from './stats';

export interface RunResult {
  run: number;
  pass: boolean;
  latencyMs: number;
  scores: ScoreResult[];
  output?: unknown;
  error?: string;
  /** Failed for infrastructure reasons; excluded from pass rates and flaky detection. */
  infra?: boolean;
}

export interface ScorerSummary {
  name: string;
  kind: ScoreResult['kind'];
  meanScore: number;
  passRate: number;
}

export interface CaseResult {
  id: string;
  tags: string[];
  runs: RunResult[];
  /** Runs that produced a quality signal (runs minus infra errors). */
  scoredRuns: number;
  passes: number;
  passRate: number;
  ci95: Interval;
  stability: Stability;
  /** Tagged `known-flaky`: reported, but excluded from the flaky gate. */
  quarantined: boolean;
  /** Scorers whose verdict changed across runs; tells you *where* the instability is. */
  flakyScorers: string[];
  meanScore: number;
}

export interface SuiteResult {
  name: string;
  description: string;
  runsPerCase: number;
  cases: CaseResult[];
  /** Fraction of all scored (case × run) executions that passed. */
  passRate: number;
  /** Same, excluding quarantined cases. This is what the gate uses. */
  gatedPassRate: number;
  infraErrorRate: number;
  quarantinedCaseIds: string[];
  /** Fraction of cases that passed on every run. */
  stablePassRate: number;
  flakyCaseIds: string[];
  scorers: ScorerSummary[];
  latency: { p50: number; p95: number };
  durationMs: number;
}

export interface GateCheck {
  suite: string;
  check: string;
  ok: boolean;
  actual: number | string;
  threshold: number | string;
}

export interface GateResult {
  passed: boolean;
  checks: GateCheck[];
  /** Context that changes how to read the result (skipped checks, N=1). */
  notes: string[];
}

export interface EvalReport {
  meta: {
    mode: 'mock' | 'live';
    warnings?: string[];
    subjectModel: string;
    judgeModel: string;
    runsPerCase: number;
    startedAt: string;
    durationMs: number;
    gitSha?: string;
  };
  suites: SuiteResult[];
  gate?: GateResult;
}
