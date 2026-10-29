import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveMode } from "@/evals/models";
import { executeSuite, writeReport } from "@/evals/runner/execute";
import { suiteNames } from "@/evals/suites";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const body = z.object({
  suite: z.string().refine((s) => suiteNames.includes(s), { message: `suite must be one of: ${suiteNames.join(", ")}` }),
  runs: z.number().int().min(1).max(10).default(5),
});

/** Live runs spend tokens: allow one at a time per server instance. */
let liveRunInFlight = false;

/**
 * Mock mode costs only CPU, so the route is open. Live mode spends tokens, so it
 * needs EVAL_API_ENABLED=true and a bearer token matching EVAL_API_TOKEN.
 */
function authorizeLive(req: Request): NextResponse | null {
  const token = process.env.EVAL_API_TOKEN;
  if (process.env.EVAL_API_ENABLED !== "true" || !token) {
    return NextResponse.json({ error: "Live runs over HTTP are disabled. Set EVAL_API_ENABLED=true and EVAL_API_TOKEN." }, { status: 403 });
  }
  const given = Buffer.from(req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "");
  const want = Buffer.from(token);
  if (given.length !== want.length || !timingSafeEqual(given, want)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

/** Runs one suite. Mock fixtures by default; real providers only when the server has EVAL_MODE=live. */
export async function POST(req: Request) {
  const mode = resolveMode();
  if (mode === "live") {
    const denied = authorizeLive(req);
    if (denied) return denied;
    if (liveRunInFlight) return NextResponse.json({ error: "A live eval run is already in progress." }, { status: 409 });
  }
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues.map((i) => i.message).join("; ") }, { status: 400 });
  }
  if (mode === "live") liveRunInFlight = true;
  try {
    const report = await executeSuite({ suite: parsed.data.suite, runs: parsed.data.runs, mode });
    await writeReport(report);
    return NextResponse.json({ suite: report.suite, mode: report.mode, summary: report.summary });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  } finally {
    if (mode === "live") liveRunInFlight = false;
  }
}
