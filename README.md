# ai-sdk-eval-harness

An evaluation harness for [Vercel AI SDK](https://ai-sdk.dev) features, built with Next.js 15 + AI SDK v6.
It runs five AI features against versioned golden datasets, scores them with deterministic checks and an
LLM-as-judge, repeats every case **N times** to detect flakiness, and gates CI on the result.

**Offline by default.** Without API keys, a fixture-replaying `MockLanguageModelV3` stands in for the
model and a deterministic mock judge stands in for the judge, so CI needs no secrets. Set `EVAL_MODE=live`
to hit real providers.

> The mock judge scores by reference-word coverage. It keeps the pipeline testable and deterministic;
> it is **not** a quality oracle. Trust live-mode numbers for model quality.

## Suites

| Suite | System under test (`src/lib/ai/`) | Scorers |
|---|---|---|
| `summarize` | `summarize` | keywords, length budget, LLM judge |
| `classify` | `classifyTicket` (structured) | schema validity, exact label |
| `extract` | `extractInvoice` (structured) | schema validity, exact fields, numeric tolerance |
| `rag` | `groundedQa` (grounded QA + citations + abstention) | schema, abstention, answer/citation contains, LLM judge (faithfulness) |
| `agent` | `runAgent` (tool calling, multi-step) | tool-call match (args, order), answer contains, length budget |

Each feature is a pure function `(model: LanguageModel, input) => result`, so the same code runs under a mock or a real model.

## Quick start

```bash
npm ci
npm test                 # unit tests (scorers, stats, runner, gate, datasets)
npm run eval             # run all suites offline (N=5), write reports/, apply the gate
npm run dev              # dashboard at http://localhost:3000
npm run e2e              # Playwright (builds the app, seeds reports first)
```

Useful flags: `npm run eval -- --suite rag --suite agent --runs 10 --no-gate`.

### Live mode

```bash
cp .env.example .env     # set ANTHROPIC_API_KEY and/or OPENAI_API_KEY
EVAL_MODE=live npm run eval -- --runs 3
```

`EVAL_MODEL` and `EVAL_JUDGE_MODEL` take `provider:model` (`anthropic:`, `openai:` or `bynara:`). Judges run at temperature 0 on a pinned model.
The `bynara:` provider uses the [Bynara router](https://router.bynara.id) through an OpenAI-compatible chat-completions client (set `BYNARA_API_KEY`; override the endpoint with `BYNARA_BASE_URL`, default `https://router.bynara.id/v1`). Example: `EVAL_MODEL=bynara:<model-id> EVAL_MODE=live npm run eval`.

The dashboard's "Run suite" button and `POST /api/eval` use live providers only if the **server** has `EVAL_MODE=live`.

## How it works

- **Datasets** — `evals/datasets/<suite>.jsonl`, one Zod-validated case per line; `manifest.json` carries a version and each report records a content hash.
- **Scorers** — `evals/scorers/`: `exactMatch`, `contains`, `notContains`, `matchesRegex`, `schemaValid`, `numericTolerance`, `toolCallMatch`, `lengthBudget`, and `llmJudge` (rubric → structured 1–5 score + rationale via `generateObject`). A run passes only if **every** scorer passes; judge passes at ≥ 4/5 by default.
- **Runner** — `evals/runner/`: each case runs N times; reports pass rate, mean score and σ per case. A case is **flaky** when its pass rate is strictly between 0 and 1. Provider errors count as failed runs.
- **Mock replay** — `evals/fixtures/<suite>.json` maps case id → list of recorded responses; run *i* uses entry `i mod len`, which is how flaky behavior is reproduced deterministically. A fixture is text, a structured object, or `{steps: [...]}` for tool-calling agents.
- **Gate** — `evals/thresholds.json` sets `minPassRate` / `maxFlakeRate` (defaults plus per-suite overrides). The CLI exits non-zero when any suite misses.

The committed fixtures deliberately include three flaky cases (`summarize/s05`, `extract/e04`, `rag/r06`) and one
always-failing case (`classify/c06`) so the flake detector and reports are exercised; the thresholds are set so the gate still passes.

## Adding a suite

1. Add `evals/suites/<name>.ts` (Zod case schema, `run`, `score`) and register it in `evals/suites/index.ts`.
2. Add `evals/datasets/<name>.jsonl`, a manifest entry, a `evals/fixtures/<name>.json`, and a threshold entry.
3. `tests/unit/datasets.test.ts` fails if any case lacks fixtures or a threshold is missing.

## CI (`.github/workflows`)

- `ci.yml`: lint → typecheck → Vitest → eval gate (mock) → Playwright. Posts/updates a PR comment with the summary and uploads `reports/`.
- `live-eval.yml`: manual (`workflow_dispatch`) live run; needs `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `BYNARA_API_KEY` repo secrets (and optionally a `BYNARA_BASE_URL` repo variable).

To make the gate block merges, mark the `checks` and `e2e` jobs as required in branch protection.
