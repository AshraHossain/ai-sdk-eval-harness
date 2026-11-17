import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const req = (path: string, headers: Record<string, string> = {}) => new NextRequest(`http://x${path}`, { headers });

/** Fresh module per test: the limiter is created at import time from RATE_LIMIT_PER_MINUTE. */
async function load(env: Record<string, string> = {}) {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) process.env[k] = v;
  return (await import("../../middleware")).middleware;
}

const ENV = ["API_AUTH_TOKEN", "RATE_LIMIT_PER_MINUTE"] as const;
beforeEach(() => ENV.forEach((k) => delete process.env[k]));
afterEach(() => ENV.forEach((k) => delete process.env[k]));

describe("middleware", () => {
  it("attaches OWASP and telemetry headers and forwards the request id", async () => {
    const res = (await load())(req("/api/eval", { "x-request-id": "trace-1" }));
    expect(res.headers.get("X-Request-ID")).toBe("trace-1");
    expect(res.headers.get("x-middleware-request-x-request-id")).toBe("trace-1");
    expect(res.headers.get("Content-Security-Policy")).toBe("default-src 'none'; frame-ancestors 'none'");
    expect(res.headers.get("X-Frame-Options")).toBe("DENY");
    expect(res.headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it("requires a token when API_AUTH_TOKEN is set (401), via Bearer or X-API-Key", async () => {
    const mw = await load({ API_AUTH_TOKEN: "tok" });
    const denied = mw(req("/api/eval"));
    expect(denied.status).toBe(401);
    expect(denied.headers.get("X-Request-ID")).toBeTruthy();
    expect(mw(req("/api/eval", { authorization: "Bearer nope" })).status).toBe(401);
    expect(mw(req("/api/eval", { authorization: "Bearer tok" })).status).toBe(200);
    expect(mw(req("/api/eval", { "x-api-key": "tok" })).status).toBe(200);
  });

  it("keeps probes open even with auth on", async () => {
    const mw = await load({ API_AUTH_TOKEN: "tok", RATE_LIMIT_PER_MINUTE: "1" });
    for (let i = 0; i < 3; i++) {
      expect(mw(req("/api/health")).status).toBe(200);
      expect(mw(req("/api/readyz")).status).toBe(200);
    }
  });

  it("rate limits per client with 429 and Retry-After: 60", async () => {
    const mw = await load({ RATE_LIMIT_PER_MINUTE: "2" });
    const a = { "x-forwarded-for": "1.1.1.1" };
    expect(mw(req("/api/eval", a)).status).toBe(200);
    expect(mw(req("/api/eval", a)).status).toBe(200);
    const limited = mw(req("/api/eval", a));
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toBe("60");
    expect(limited.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(mw(req("/api/eval", { "x-forwarded-for": "2.2.2.2" })).status).toBe(200);
  });
});
