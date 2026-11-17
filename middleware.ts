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

const limit = createRateLimiter(rateLimitFrom(process.env.RATE_LIMIT_PER_MINUTE));
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
    if (!limit(clientKey(req.headers, trustedHops))) {
      const res = NextResponse.json({ error: "Too many requests" }, { status: 429 });
      res.headers.set("Retry-After", String(RETRY_AFTER_SECONDS));
      return finish(res, id);
    }
    const token = process.env.API_AUTH_TOKEN;
    if (token && !tokenMatches(presentedToken(req.headers), token)) {
      return finish(NextResponse.json({ error: "Unauthorized" }, { status: 401 }), id);
    }
  }
  const forwarded = new Headers(req.headers);
  forwarded.set("x-request-id", id);
  return finish(NextResponse.next({ request: { headers: forwarded } }), id);
}
