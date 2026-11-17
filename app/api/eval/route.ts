import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveMode } from "@/evals/models";
import { executeSuite, writeReport } from "@/evals/runner/execute";
import { suiteNames } from "@/evals/suites";
import { presentedToken, tokenMatches, withTiming } from "@/src/lib/security/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** A valid body is ~40 bytes; anything near this cap is not a real request. */
const MAX_BODY_BYTES = 4096;

const body = z.object({
  suite: z
    .string()
    .max(32)
    .refine((s) => suiteNames.includes(s), { message: `suite must be one of: ${suiteNames.join(", ")}` }),
  runs: z.number().int().min(1).max(10).default(5),
}).strict();

/** Live runs spend tokens: allow one at a time per server instance. */
let liveRunInFlight = false;

const error = (message: string, status: number) => NextResponse.json({ error: message }, { status });

/**
 * Mock mode costs only CPU, so the route is open (unless API_AUTH_TOKEN is set; see middleware.ts).
 * Live mode spends tokens, so it also needs EVAL_API_ENABLED=true and a token matching EVAL_API_TOKEN.
 */
function authorizeLive(req: Request): NextResponse | null {
  const token = process.env.EVAL_API_TOKEN;
  if (process.env.EVAL_API_ENABLED !== "true" || !token) {
    return error("Live runs over HTTP are disabled. Set EVAL_API_ENABLED=true and EVAL_API_TOKEN.", 403);
  }
  return tokenMatches(presentedToken(req.headers), token) ? null : error("Unauthorized", 401);
}

/** Content-Type (415), byte cap (413), JSON + schema (400). */
async function parseBody(req: Request): Promise<z.infer<typeof body> | NextResponse> {
  if (!req.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return error("Content-Type must be application/json", 415);
  }
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) return error("Payload too large", 413);
  const raw = await req.text();
  // Content-Length can be absent or wrong (chunked bodies), so check the bytes actually read.
  if (Buffer.byteLength(raw) > MAX_BODY_BYTES) return error("Payload too large", 413);
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return error("Body must be valid JSON", 400);
  }
  const parsed = body.safeParse(json);
  return parsed.success ? parsed.data : error(parsed.error.issues.map((i) => i.message).join("; "), 400);
}

/** Runs one suite. Mock fixtures by default; real providers only when the server has EVAL_MODE=live. */
export const POST = withTiming(async (req: Request) => {
  const mode = resolveMode();
  if (mode === "live") {
    const denied = authorizeLive(req);
    if (denied) return denied;
    if (liveRunInFlight) return error("A live eval run is already in progress.", 409);
  }
  const input = await parseBody(req);
  if (input instanceof NextResponse) return input;
  if (mode === "live") liveRunInFlight = true;
  try {
    const report = await executeSuite({ suite: input.suite, runs: input.runs, mode });
    await writeReport(report);
    return NextResponse.json({ suite: report.suite, mode: report.mode, summary: report.summary });
  } catch (err) {
    // Log the detail server-side; return a generic message so internals do not leak.
    console.error(`[api/eval] ${input.suite}:`, err);
    return error("Eval run failed. See server logs.", 500);
  } finally {
    if (mode === "live") liveRunInFlight = false;
  }
});
