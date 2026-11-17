# Changelog

All notable changes to this project. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- API edge middleware: `X-Request-ID`, sliding-window rate limit (429 + `Retry-After: 60`), optional
  `API_AUTH_TOKEN` (Bearer or `X-API-Key`, constant-time), OWASP headers; `/api/health` and `/api/readyz` probes.
- Rate-limit keys trust `X-Forwarded-For` only through `TRUSTED_PROXY_HOPS` (right-most hop); key table capped.
- Route hardening: 415 for non-JSON, 413 byte cap, strict schema, `X-Process-Time-Ms`, generic 500s.
- `<untrusted_context>` framing for documents, tickets and invoices; `safeId()` for report paths.
- Eval scorecard (`reports/scorecard.json`, summary.md): citation recall, grounding rate, guardrail pass
  rate, tool-call accuracy, p50/p95 latency.
- Per-file 80% coverage gate (`npm run test:coverage`), integration tests, `eslint-plugin-security`.
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
