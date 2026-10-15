import { RunButton } from "./RunButton";
import { SUITES } from "@/evals/suites";
import { readReports } from "@/evals/runner/execute";
import { evaluateGate, pct } from "@/evals/runner/gate";
import { loadThresholds } from "@/evals/runner/load";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const [reports, thresholds] = await Promise.all([readReports(), loadThresholds()]);
  const byName = new Map(reports.map((r) => [r.suite, r]));
  const gate = evaluateGate(reports, thresholds);
  const gateBySuite = new Map(gate.results.map((g) => [g.suite, g]));

  return (
    <main>
      <h1>AI SDK Eval Harness</h1>
      <p className="sub">Golden datasets · deterministic + LLM-judge scorers · N-run flaky detection</p>

      {reports.length === 0 ? (
        <div className="banner" data-testid="gate-banner">No reports yet. Run a suite below or <code>npm run eval</code>.</div>
      ) : (
        <div className={`banner ${gate.ok ? "ok" : "bad"}`} data-testid="gate-banner">
          Gate: <b>{gate.ok ? "PASSING" : "FAILING"}</b> across {reports.length} suite(s) · mode <code>{reports[0]?.mode}</code>
        </div>
      )}

      <div className="grid">
        {SUITES.map((s) => {
          const r = byName.get(s.name);
          const g = gateBySuite.get(s.name);
          return (
            <section className="card" key={s.name} data-testid={`suite-${s.name}`}>
              <header>
                <div>
                  <h2>{s.title}</h2>
                  <div className="muted">{s.description}</div>
                </div>
                <RunButton suite={s.name} />
              </header>
              {r && g ? (
                <>
                  <div className="stats">
                    <div className="stat"><b data-testid="pass-rate">{pct(r.summary.passRate)}</b><span className="muted">pass rate (min {pct(g.minPassRate)})</span></div>
                    <div className="stat"><b>{r.summary.flakyCases}/{r.summary.cases}</b><span className="muted">flaky (max {pct(g.maxFlakeRate)})</span></div>
                    <div className="stat"><b>{r.summary.meanScore.toFixed(2)}</b><span className="muted">mean score</span></div>
                    <div className="stat"><span className={`pill ${g.ok ? "ok" : "bad"}`}>{g.ok ? "pass" : "fail"}</span><div className="muted">{r.runsPerCase} runs · dataset v{r.datasetVersion} ({r.datasetHash})</div></div>
                  </div>
                  <table>
                    <thead><tr><th>Case</th><th>Pass rate</th><th>Score μ ± σ</th><th>Status</th></tr></thead>
                    <tbody>
                      {r.cases.map((c) => (
                        <tr key={c.id}>
                          <td>{c.id}</td>
                          <td>{pct(c.passRate)}</td>
                          <td>{c.meanScore.toFixed(2)} ± {c.scoreStdev.toFixed(2)}</td>
                          <td>
                            {c.flaky ? <span className="pill warn">flaky</span> : c.passRate === 1 ? <span className="pill ok">pass</span> : <span className="pill bad">fail</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              ) : (
                <p className="muted">No results yet.</p>
              )}
            </section>
          );
        })}
      </div>
    </main>
  );
}
