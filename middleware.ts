import { NextResponse, type NextRequest } from "next/server";
import {
  API_SECURITY_HEADERS,
  clientKey,
  createRateLimiter,
  OPEN_PATHS,
  presentedToken,
  rateLimitFrom,
  requestId,
  RETRY_AFTER_SECONDS,
  tokenMatches,
  trustedHopsFrom,
} from "@/src/lib/security/http";

// Node runtime: timingSafeEqual and a process-local limiter need Node APIs.
export const config = { matcher: "/api/:path*", runtime: "nodejs" };

const perMinute = rateLimitFrom(process.env.RATE_LIMIT_PER_MINUTE);
/** Anonymous traffic, keyed by clientKey(). */
const limitAnonymous = createRateLimiter(perMinute);
/** Token holders: a separate limiter, so no anonymous key or overflow can ever share this budget. */
const limitAuthenticated = createRateLimiter(perMinute, undefined, 1);
const trustedHops = trustedHopsFrom(process.env.TRUSTED_PROXY_HOPS);

function finish(res: NextResponse, id: string): NextResponse {
  for (const [k, v] of Object.entries(API_SECURITY_HEADERS)) res.headers.set(k, v);
  res.headers.set("X-Request-ID", id);
  return res;
}

/** Edge of the API: request id, rate limit (429), optional token auth (401), OWASP headers. */
export function middleware(req: NextRequest): NextResponse {
  const id = requestId(req.headers.get("x-request-id"));
  if (!OPEN_PATHS.has(req.nextUrl.pathname)) {
    const token = process.env.API_AUTH_TOKEN;
    const authed = !!token && tokenMatches(presentedToken(req.headers), token);
    // Authenticated callers get their own bucket, so anonymous floods of the shared bucket cannot lock them out.
    // Unauthenticated requests (including bad tokens) are limited before the 401, which also throttles brute force.
    const allowed = authed ? limitAuthenticated("token") : limitAnonymous(clientKey(req.headers, trustedHops));
    if (!allowed) {
      const res = NextResponse.json({ error: "Too many requests" }, { status: 429 });
      res.headers.set("Retry-After", String(RETRY_AFTER_SECONDS));
      return finish(res, id);
    }
    if (token && !authed) {
      return finish(NextResponse.json({ error: "Unauthorized" }, { status: 401 }), id);
    }
  }
  const forwarded = new Headers(req.headers);
  forwarded.set("x-request-id", id);
  return finish(NextResponse.next({ request: { headers: forwarded } }), id);
}
