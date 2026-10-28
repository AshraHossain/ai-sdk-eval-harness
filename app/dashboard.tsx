'use client';

import { Fragment, useState } from 'react';
import type { CaseResult, EvalReport, SuiteResult } from '@/evals/runner/types';

interface SuiteInfo {
  name: string;
  description: string;
  cases: number;
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

export function Dashboard({ suites, mode, initialReport }: { suites: SuiteInfo[]; mode: string; initialReport: EvalReport | null }) {
  const [selected, setSelected] = useState<string[]>(suites.map((s) => s.name));
  const [runs, setRuns] = useState(5);
  const [report, setReport] = useState<EvalReport | null>(initialReport);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/eval', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ suites: selected, runs }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setReport(body as EvalReport);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const toggle = (name: string) => setSelected((cur) => (cur.includes(name) ? cur.filter((n) => n !== name) : [...cur, name]));

  return (
    <main>
      <header className="top">
        <div>
          <h1>AI SDK Eval Harness</h1>
          <p className="muted">
            Golden datasets · deterministic + LLM-as-judge scorers · N-run flaky detection · CI gate
          </p>
        </div>
        <span className={`pill mode-${mode}`} data-testid="mode">
          {mode} mode
        </span>
      </header>

      <section className="panel" aria-label="Run evals">
        <div className="suite-picker">
          {suites.map((s) => (
            <label key={s.name} className={`suite-chip ${selected.includes(s.name) ? 'on' : ''}`} title={s.description}>
              <input type="checkbox" checked={selected.includes(s.name)} onChange={() => toggle(s.name)} data-testid={`suite-${s.name}`} />
              {s.name} <span className="muted">({s.cases})</span>
            </label>
          ))}
        </div>
        <div className="run-row">
          <label>
            Runs per case (N){' '}
            <input type="number" min={1} max={10} value={runs} onChange={(e) => setRuns(Number(e.target.value))} data-testid="runs" />
          </label>
          <button onClick={run} disabled={busy || selected.length === 0} data-testid="run">
            {busy ? 'Running…' : 'Run evals'}
          </button>
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </section>

      {report ? <ReportView report={report} /> : <p className="muted" data-testid="empty">No report yet. Run the evals above or `npm run eval`.</p>}
    </main>
  );
}

function ReportView({ report }: { report: EvalReport }) {
  const { meta, suites, gate } = report;
  return (
    <section data-testid="report">
      <div className="gate-row">
        {gate && (
          <span className={`pill ${gate.passed ? 'ok' : 'bad'}`} data-testid="gate">
            {gate.passed ? 'Gate passed' : 'Gate failed'}
          </span>
        )}
        <span className="muted">
          {meta.subjectModel} · judge {meta.judgeModel} · N={meta.runsPerCase} · {(meta.durationMs / 1000).toFixed(1)}s ·{' '}
          {new Date(meta.startedAt).toLocaleString()}
        </span>
      </div>

      <div className="table-wrap">
      <table className="suites" data-testid="suite-table">
        <thead>
          <tr>
            <th>Suite</th>
            <th className="num">Cases</th>
            <th className="num">Pass rate</th>
            <th className="num">Stable pass</th>
            <th>Flaky</th>
            <th>Scorers (mean)</th>
            <th className="num">p95</th>
          </tr>
        </thead>
        <tbody>
          {suites.map((s) => (
            <tr key={s.name} data-testid={`row-${s.name}`}>
              <td>
                <strong>{s.name}</strong>
              </td>
              <td className="num">{s.cases.length}</td>
              <td className="num">
                <Bar value={s.gatedPassRate} />
              </td>
              <td className="num">{pct(s.stablePassRate)}</td>
              <td>{s.flakyCaseIds.length ? s.flakyCaseIds.join(', ') : '—'}</td>
              <td>
                <div className="scorers">
                {s.scorers.map((sc) => (
                  <span key={sc.name} className={`tag ${sc.kind}`}>
                    {sc.name} {sc.meanScore.toFixed(2)}
                  </span>
                ))}
                </div>
              </td>
              <td className="num">{s.latency.p95}ms</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>

      {suites.map((s) => (
        <SuiteCases key={s.name} suite={s} />
      ))}

      {gate && (
        <details className="panel">
          <summary>Gate checks ({gate.checks.filter((c) => !c.ok).length} failing)</summary>
          <table>
            <tbody>
              {gate.notes.length > 0 && <p className="muted">{gate.notes.join(' ')}</p>}
          {gate.checks.map((c, i) => (
                <tr key={i} className={c.ok ? '' : 'fail'}>
                  <td>{c.suite}</td>
                  <td>{c.check}</td>
                  <td>{String(c.actual)}</td>
                  <td>{String(c.threshold)}</td>
                  <td>{c.ok ? '✓' : '✗'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </section>
  );
}

function SuiteCases({ suite }: { suite: SuiteResult }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <details className="panel" data-testid={`cases-${suite.name}`}>
      <summary>
        {suite.name} — {suite.description}
      </summary>
      <table>
        <thead>
          <tr>
            <th>Case</th>
            <th>Status</th>
            <th className="num">Passes</th>
            <th>95% CI</th>
            <th>Unstable scorers</th>
          </tr>
        </thead>
        <tbody>
          {suite.cases.map((c) => (
            <Fragment key={c.id}>
              <tr className="clickable" onClick={() => setOpen(open === c.id ? null : c.id)} data-testid={`case-${c.id}`}>
                <td>{c.id}</td>
                <td>
                  <Status c={c} />
                </td>
                <td className="num">
                  {c.passes}/{c.scoredRuns}
                </td>
                <td>
                  [{pct(c.ci95.low)}, {pct(c.ci95.high)}]
                </td>
                <td>{c.flakyScorers.join(', ') || '—'}</td>
              </tr>
              {open === c.id && (
                <tr>
                  <td colSpan={5}>
                    <ol className="runs">
                      {c.runs.map((r) => (
                        <li key={r.run}>
                          <span className={r.pass ? 'okt' : 'badt'}>{r.pass ? 'pass' : r.infra ? 'infra error' : 'fail'}</span> · {r.latencyMs}ms ·{' '}
                          {r.scores.map((s) => `${s.name}=${s.score}${s.pass ? '' : ` (${s.detail ?? 'fail'})`}`).join(' · ')}
                        </li>
                      ))}
                    </ol>
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </details>
  );
}

function Status({ c }: { c: CaseResult }) {
  const cls = c.stability === 'stable-pass' ? 'ok' : c.stability === 'stable-fail' ? 'bad' : 'warn';
  return (
    <span className={`pill small ${cls}`} data-testid={`status-${c.id}`}>
      {c.stability}
      {c.quarantined ? ' · quarantined' : ''}
    </span>
  );
}

function Bar({ value }: { value: number }) {
  return (
    <span className="bar" aria-label={pct(value)}>
      <span className="fill" style={{ width: pct(value) }} />
      <span className="label">{pct(value)}</span>
    </span>
  );
}
