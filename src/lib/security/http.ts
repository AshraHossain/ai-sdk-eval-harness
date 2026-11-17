import { randomUUID, timingSafeEqual } from "node:crypto";

/** OWASP response headers for JSON API routes. The API serves no HTML, so CSP denies everything. */
export const API_SECURITY_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Cache-Control": "no-store",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
});

/** Probe routes stay open (no auth, no rate limit) so orchestrators can reach them. */
export const OPEN_PATHS: ReadonlySet<string> = new Set(["/api/health", "/api/readyz"]);

export const DEFAULT_RATE_LIMIT_PER_MINUTE = 120;
export const RATE_WINDOW_MS = 60_000;
export const RETRY_AFTER_SECONDS = 60;

const REQUEST_ID = /^[\w-]{1,64}$/;

/** Reuses a well-formed incoming X-Request-ID, otherwise mints one. */
export function requestId(incoming: string | null): string {
  return incoming && REQUEST_ID.test(incoming) ? incoming : randomUUID();
}

/** Token from `Authorization: Bearer <t>` or `X-API-Key: <t>`. */
export function presentedToken(headers: Headers): string | null {
  const bearer = headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  return bearer ?? headers.get("x-api-key");
}

/** Constant-time comparison. A length mismatch returns false without comparing contents. */
export function tokenMatches(given: string | null, expected: string): boolean {
  if (!given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Parses RATE_LIMIT_PER_MINUTE; falls back to the default on missing or invalid values. */
export function rateLimitFrom(raw: string | undefined): number {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_RATE_LIMIT_PER_MINUTE;
}

/** Client key for rate limiting: first X-Forwarded-For hop, else X-Real-IP, else "anonymous". */
export function clientKey(headers: Headers): string {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || "anonymous";
}

export interface RateDecision {
  readonly allowed: boolean;
  /** Timestamps kept for this key after the decision. */
  readonly hits: readonly number[];
}

/** Sliding-window decision. Pure: returns the new hit list instead of mutating the old one. */
export function slidingWindow(hits: readonly number[], now: number, limit: number, windowMs = RATE_WINDOW_MS): RateDecision {
  const recent = hits.filter((t) => now - t < windowMs);
  return recent.length >= limit ? { allowed: false, hits: recent } : { allowed: true, hits: [...recent, now] };
}

/**
 * In-memory limiter keyed by client.
 * ponytail: per-process memory; behind several instances use a shared store (Redis) instead.
 */
export function createRateLimiter(limit: number, windowMs = RATE_WINDOW_MS) {
  const log = new Map<string, readonly number[]>();
  return (key: string, now = Date.now()): boolean => {
    const d = slidingWindow(log.get(key) ?? [], now, limit, windowMs);
    log.set(key, d.hits);
    if (log.size > 10_000) for (const [k, v] of log) if (!v.some((t) => now - t < windowMs)) log.delete(k);
    return d.allowed;
  };
}

/** Wraps a route handler and stamps X-Process-Time-Ms on its response. */
export function withTiming<A extends unknown[]>(handler: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    const start = performance.now();
    const res = await handler(...args);
    res.headers.set("X-Process-Time-Ms", (performance.now() - start).toFixed(1));
    return res;
  };
}
