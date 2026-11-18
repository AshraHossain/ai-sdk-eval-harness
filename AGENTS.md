# AGENTS.md — ai-sdk-eval-harness

Portable source of truth for coding agents (Claude Code, Antigravity, others).

## What this is
An eval harness for Vercel AI SDK features. Five features (`summarize`, `classify`, `extract`,
`rag`, `agent`) run against versioned golden datasets. Deterministic scorers and an LLM judge
score them. Every case runs N times so flaky cases show up, and a code-defined gate fails CI.
A Next.js dashboard and `POST /api/eval` show and trigger runs. It is a portfolio project,
not a production service.

## Commands (all verified offline, no API keys)
```bash
npm ci
make check                 # lint + typecheck + tests (per-file 80% coverage) + gate self-test + eval gate
npm run lint               # eslint, 0 warnings allowed, includes eslint-plugin-security
npm run typecheck
npm test                   # Vitest: tests/unit + tests/integration
npm run test:coverage      # same, with the per-file coverage gate
npm run eval:gate          # all suites, mock mode, N=5 -> reports/{<suite>,scorecard}.json, summary.md
npm run eval:selftest      # the gate must fail on every injected fault
npm run eval:calibrate     # judge vs. human labels (fails only for a live judge)
npm run e2e                # Playwright; set PW_CHROMIUM_PATH to use a preinstalled Chromium
npm run build && make docker
EVAL_MODE=live npm run eval -- --runs 3   # real providers; keys from env (see .env.example)
```

## Layout
| Path | Role |
|---|---|
| `src/lib/ai/` | System under test: pure `(model, input) => result` features |
| `src/lib/security/` | Pure helpers: token check, sliding-window limiter, headers, untrusted-text framing, `safeId` |
| `middleware.ts` | API edge: request id, 429, optional 401, OWASP headers (Node runtime) |
| `app/` | Dashboard + `api/eval`, `api/health`, `api/readyz` |
| `evals/suites/` | One suite per feature: Zod case schema + `run` + `score` |
| `evals/scorers/` | Deterministic scorers + LLM judge |
| `evals/runner/` | Execute, N-run stats, gate, scorecard, markdown |
| `evals/{datasets,fixtures,baselines}/`, `evals/thresholds.json` | Data, mock replies, baselines, gate config |
| `evals/mock/` | Fixture-replay model, mock judge, gate fault injection |
| `tests/unit`, `tests/integration`, `tests/e2e` | Offline Vitest; Playwright |

## Invariants
1. Pass/fail logic, thresholds, flakiness, scorecard metrics and gating live in code
   (`evals/scorers`, `evals/runner`, `evals/thresholds.json`), never in prompts or model output.
2. `src/lib/ai/` never imports a provider and never reads env. `evals/` never imports `app/`.
3. Offline mode is the default and is deterministic. CI never needs secrets. Never assert exact
   live-model outputs in tests.
4. Untrusted text (documents, tickets, invoices) reaches a model only through `frameUntrusted()`.
   Judge inputs go through `buildJudgePrompt()` tag escaping.
5. Report/baseline file names derive from `safeId()`-checked ids only.
6. Contracts (`evals/runner/types.ts`, `evals/scorers/types.ts`, gate/calibration results) are
   `readonly`. Build new objects; do not mutate reports.
7. Changing a dataset's cases means bumping its version in `evals/datasets/manifest.json`.
   Quarantine noisy cases in `thresholds.json`, never by editing data.
8. API keys come from env only. Never commit keys or `.env`.

## Conventions
Conventional commits (`feat|fix|test|refactor|docs|chore(scope): ...`). Run `make check` before
pushing. Do not claim production readiness. Security model: [SECURITY.md](SECURITY.md).
Architecture: [ARCHITECTURE.md](ARCHITECTURE.md). Goals, scope, milestones and known gaps:
[PLANNING.md](PLANNING.md); keep it in step with any change to scope or architecture.
