# CLAUDE.md — ai-sdk-eval-harness

Guidance for Claude Code when working in this repository. See [README.md](README.md) for the overview.

## Commands

```bash
npm ci
npm run lint && npm run typecheck
npm test                       # Vitest (offline)
npm run eval                   # all suites, mock mode, N=5, applies the gate -> reports/
npm run eval -- --suite rag --runs 10 --no-gate
npm run e2e                    # Playwright; set PW_CHROMIUM_PATH to use a preinstalled Chromium
EVAL_MODE=live npm run eval    # real providers; needs keys (see .env.example)
```

## Layout and rules

- `src/lib/ai/` is the system under test. Each feature is a pure function `(model: LanguageModel, input)`; no
  provider imports and no environment access there.
- `evals/` must not import from `app/`. Suites, scorers, runner, gate and fixtures live here.
- Pass/fail logic, thresholds, flakiness and gating live in code (`evals/scorers`, `evals/runner`,
  `evals/thresholds.json`), never in prompts or model output.
- Offline mode must stay deterministic and key-free: fixtures in `evals/fixtures/<suite>.json` map case id to a
  list of responses (run *i* uses entry `i mod len`). CI must never require secrets.
- The mock judge is a coverage heuristic, not a quality oracle. Never assert exact live-model outputs in tests.
- Adding a suite: Zod case schema + `run` + `score` in `evals/suites/`, register it in `evals/suites/index.ts`,
  add dataset + manifest entry + fixtures + threshold. `tests/unit/datasets.test.ts` guards fixture coverage.
- Changing a dataset's cases: bump its version in `evals/datasets/manifest.json`.
- Providers: `anthropic:`, `openai:`, `bynara:` (OpenAI-compatible router). API keys come from env only;
  never commit keys or `.env`.
- The seeded flaky cases (`summarize/s05`, `extract/e04`, `rag/r06`) and failing case (`classify/c06`) are
  asserted in `tests/unit/mockSuites.test.ts` and `tests/e2e/dashboard.spec.ts`; change them together.

## Conventions

- Conventional commits: `feat|fix|test|refactor|docs|chore(scope): ...`.
- Run lint, typecheck and tests before pushing; keep the eval gate green.
- Do not claim production readiness.
