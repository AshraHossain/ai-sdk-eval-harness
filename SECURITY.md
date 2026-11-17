# Security

This is a portfolio eval harness, not a hardened production service. The controls below are
real, tested, and scoped to what this app exposes: a dashboard, `POST /api/eval`, and two probes.

## Reporting

Open a private security advisory on GitHub (Security tab, "Report a vulnerability").
Do not file a public issue for an unpatched problem.

## Configuration

| Variable | Default | Effect |
|---|---|---|
| `API_AUTH_TOKEN` | unset | When set, every `/api/*` route except the probes requires `Authorization: Bearer <t>` or `X-API-Key: <t>` (401 otherwise) |
| `RATE_LIMIT_PER_MINUTE` | `120` | Sliding-window limit per client IP on `/api/*` except the probes (429, `Retry-After: 60`) |
| `EVAL_API_ENABLED`, `EVAL_API_TOKEN` | off | Live (token-spending) runs over HTTP need both, plus a matching bearer token |
| `EVAL_MODE` | `mock` | `live` calls real providers; keys come from env only |

## Threat model

| Threat | Mitigation | Where | Test |
|---|---|---|---|
| Unauthenticated use of the API | Optional `API_AUTH_TOKEN`, Bearer or X-API-Key, constant-time compare | `middleware.ts`, `src/lib/security/http.ts` | `tests/integration/middleware.test.ts`, `tests/unit/security.test.ts` |
| Token timing attack | `crypto.timingSafeEqual` after a length check | `tokenMatches()` | `security.test.ts` |
| Token spend by an attacker (live mode) | Live runs need `EVAL_API_ENABLED` + `EVAL_API_TOKEN`; one live run at a time (409) | `app/api/eval/route.ts` | `tests/integration/api.test.ts` |
| Request flooding, token brute force | Sliding-window limit per client before auth, 429 + `Retry-After: 60` | `middleware.ts` | `middleware.test.ts` |
| Oversized bodies | 4 KB cap by `Content-Length` and by bytes read (413) | `route.ts` | `api.test.ts` |
| Wrong media type, content sniffing | JSON-only (415); `X-Content-Type-Options: nosniff` | `route.ts`, middleware | `api.test.ts`, e2e |
| Malformed input | Strict Zod schema: known suite only, `runs` 1-10, no extra fields (400) | `route.ts` | `api.test.ts` |
| Path traversal via ids | Report file names use `safeId()`: basename + `^[a-z0-9][a-z0-9._-]{0,63}$` | `sanitize.ts`, `execute.ts` | `security.test.ts`, `live-path.test.ts` |
| Indirect prompt injection (documents, tickets, invoices) | Text is wrapped in `<untrusted_context>`, boundary tags and control chars stripped, length capped; system prompt says tag contents are data | `frameUntrusted()`, `src/lib/ai/*` | `security.test.ts`, `edges.test.ts` |
| Judge manipulation by the output under test | Each judge input in its own tag, closing tags escaped, judge told tags are data; pass/fail threshold applied in code | `evals/scorers/judge.ts` | `tests/unit/judge.test.ts` |
| Model output deciding the gate | Gate, thresholds, flake budgets and scorecard are code + `thresholds.json` | `evals/runner/` | `gate.test.ts`, `eval:selftest` |
| Clickjacking, framing, referrer leak | `X-Frame-Options: DENY`, CSP `frame-ancestors 'none'`, `Referrer-Policy: no-referrer` | middleware (API), `next.config.mjs` (pages) | `middleware.test.ts`, e2e |
| Caching of API responses | `Cache-Control: no-store` on `/api/*` | middleware | `middleware.test.ts` |
| Leaking internals in errors | 500s return a generic message; detail goes to the server log | `route.ts` | `api.test.ts` |
| Secrets in the repo | Keys only from env; `.env*` ignored; CI needs no secrets | `.gitignore`, `evals/models.ts` | CI runs offline |
| Container breakout impact | Non-root UID 10001, read-only rootfs, `cap_drop: ALL`, `no-new-privileges`, only `reports/` writable | `Dockerfile`, `docker-compose.yml` | CI `docker` job |

## Static analysis

`npm run lint` runs `eslint-plugin-security` with `--max-warnings 0`. Two rules are scoped:

- `detect-object-injection` is off. It flags every typed `obj[key]`, and TypeScript key types
  already constrain these accesses.
- `detect-non-literal-fs-filename` is off for `evals/`, `scripts/` and `tests/` only. That is
  offline tooling reading repo files, with paths from constants and `safeId()`-checked names.
  The rule stays on for `app/`, `src/` and `middleware.ts`.

## Dependencies

`npm audit --omit=dev` (runtime dependencies) is clean and runs in CI (`make audit`). As of 2026-11-17 the dev
toolchain carries GHSA-fc5q-39xc-vjpf (picomatch ReDoS, all versions up to 4.0.7, no patched release), pulled in by
Vitest/Vite and typescript-eslint. It runs only at build and test time on glob patterns from repo config, never on
request input. npm's suggested fix downgrades Vitest to 3.x, so it is not applied. Re-check when picomatch ships a fix.

## Known limits

- The rate limiter is per process. Behind several instances, use a shared store.
- With `API_AUTH_TOKEN` set, the dashboard's Run button gets 401 (browsers send no token). That is
  intended for headless deployments.
- Pages use a partial CSP (`frame-ancestors`, `object-src`, `base-uri`, `form-action`). A full
  `script-src` policy needs per-request nonces, which this demo does not add.
- The mock judge is a coverage heuristic, not a quality oracle.
