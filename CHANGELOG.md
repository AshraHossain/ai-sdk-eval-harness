# Changelog

All notable changes to this project. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- `promptHash` on every report: a hash of each suite's prompt surface (feature system prompt, user
  template and judge rubrics, declared as `Suite.promptSurface`). Baselines record it, and a changed
  prompt skips the regression check the same way a changed dataset does. Prompt text now lives in one
  `*_PROMPT` constant per feature, so the hash cannot drift from what is sent.
- Token usage and estimated cost per run and per suite, metered by middleware the runner wraps around
  the model, so `src/lib/ai/` stays provider- and metering-free. Prices come from `evals/prices.json`;
  a model with no entry reports `unpriced` instead of zero. Optional `maxCostUsd` gate budget.
- Review governance: pull request template, `CODEOWNERS`, `CONTRIBUTING.md`.

### Changed
- Golden datasets grow from 6 to 15 cases per suite (manifest 1.1.0): negations and bad-news
  summaries, harder tickets, European number formats and written dates, multi-document citations, a
  prompt-injection document, unknown orders and no-tool agent tasks. One case now moves a suite 6.7
  points instead of ~17. Mock baseline re-recorded.

### Added
- `npm run readme:scorecard` generates the README scorecard tables from `reports/`; `make check`
  fails when they drift (`readme-check`).

## [0.2.0] - 2026-11-19

### Fixed
- Architecture diagrams in README and ARCHITECTURE.md now list Vertex among the live backends.

### Security
- `next` 15.5.29: fixes GHSA-7qx7-33qx-rqx2, GHSA-f3mh-rxg3-f5g2 and GHSA-pc58-hwjq-p385 (moderate).

### Added
- Live comparison in the README: Claude Haiku 5.5 (Sonnet judge, calibrated) and Gemini 3.8 Flash, N=3.
- Dashboard screenshot (`docs/dashboard.png`).
- CodeQL workflow, Dependabot (npm, Actions, Docker), SPDX SBOM artifact for the container image.
- Every GitHub Action pinned to a full commit SHA.
- `vertex:` provider (native `@ai-sdk/google-vertex`, ADC credentials, `GOOGLE_CLOUD_PROJECT`/`GOOGLE_CLOUD_LOCATION`)
  and a measured live run of Gemini 3.8 Flash in the README.
- Runner records the provider response body when an API error has an empty message (`errorText`).
- API edge middleware: `X-Request-ID`, sliding-window rate limit (429 + `Retry-After: 60`), optional
  `API_AUTH_TOKEN` (Bearer or `X-API-Key`, constant-time), OWASP headers; `/api/health` and `/api/readyz` probes.
- Rate-limit keys trust `X-Forwarded-For` only through `TRUSTED_PROXY_HOPS` (right-most hop); key table capped.
- Route hardening: 415 for non-JSON, 413 byte cap, strict schema, `X-Process-Time-Ms`, generic 500s.
- `<untrusted_context>` framing for documents, tickets and invoices; `safeId()` for report paths.
- Eval scorecard (`reports/scorecard.json`, summary.md): citation recall, grounding rate, guardrail pass
  rate, tool-call accuracy, p50/p95 latency.
- Per-file coverage gate (`npm run test:coverage`), integration tests, `eslint-plugin-security`.
  The gate is 95% lines/branches/functions/statements; every branch is covered.
- `PLANNING.md`: goals, scope, non-goals, GSD → Superpowers → Ruflo workflow, definition of done, backlog and known gaps, global-rule mapping.
- `Makefile` (`make check`), multi-stage non-root Dockerfile with HEALTHCHECK, `docker-compose.yml`,
  CI docker job and runtime dependency audit.
- `AGENTS.md`, `GEMINI.md`, `.claude/rules`, `.claude/skills` (`add-eval-suite`, `rebaseline`),
  `SECURITY.md`, `ARCHITECTURE.md`.

### Changed
- Report, case, run, gate and calibration contracts are `readonly`.
- `evals/cli.ts`, calibration and the gate self-test expose testable functions (`runCli`,
  `runCalibration`, `selfTest`).

## [0.1.0]
- Five suites, deterministic and LLM-judge scorers, N-run flaky detection, Wilson intervals,
  baseline regression gate, judge calibration, gate self-test, dashboard, CI gate.
