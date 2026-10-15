import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveMode } from "@/evals/models";
import { executeSuite, writeReport } from "@/evals/runner/execute";
import { suiteNames } from "@/evals/suites";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const body = z.object({
  suite: z.string().refine((s) => suiteNames.includes(s), { message: `suite must be one of: ${suiteNames.join(", ")}` }),
  runs: z.number().int().min(1).max(10).default(5),
});

/** Runs one suite. Mock fixtures by default; real providers only when the server has EVAL_MODE=live. */
export async function POST(req: Request) {
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues.map((i) => i.message).join("; ") }, { status: 400 });
  }
  try {
    const report = await executeSuite({ suite: parsed.data.suite, runs: parsed.data.runs, mode: resolveMode() });
    await writeReport(report);
    return NextResponse.json({ suite: report.suite, mode: report.mode, summary: report.summary });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
