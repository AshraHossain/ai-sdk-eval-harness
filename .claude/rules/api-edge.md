---
paths:
  - "app/api/**/*.ts"
  - "middleware.ts"
  - "src/lib/security/**/*.ts"
  - "next.config.mjs"
---
# API edge and security (`app/api/`, `middleware.ts`, `src/lib/security/`)
1. `middleware.ts` owns the request id, the rate limit (429 + `Retry-After: 60`), the optional
   `API_AUTH_TOKEN` check (401) and the OWASP headers for `/api/*`. `/api/health` and
   `/api/readyz` stay open: no auth, no rate limit.
2. Compare tokens only with `tokenMatches()` (constant time). Never use `===` on secrets.
3. Wrap route handlers in `withTiming()` so responses carry `X-Process-Time-Ms`.
4. JSON routes check Content-Type (415), byte size by header and by bytes read (413), then a
   `.strict()` Zod schema (400). 500s return a generic message and log the detail server-side.
5. Never key anything on the left-most `X-Forwarded-For`. Use `clientKey(headers, TRUSTED_PROXY_HOPS)`.
6. Live runs spend tokens: keep `EVAL_API_ENABLED` + `EVAL_API_TOKEN` and the one-at-a-time lock.
7. Every new security branch gets a test in `tests/integration/` (status code and headers).
   Update the threat table in `SECURITY.md`.
