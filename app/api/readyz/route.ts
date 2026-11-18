import { NextResponse } from "next/server";
import { loadThresholds } from "@/evals/runner/load";
import { withTiming } from "@/src/lib/security/http";

export const dynamic = "force-dynamic";

/** Readiness: eval config (thresholds.json) is present and parses. 503 otherwise. */
export const GET = withTiming(async () => {
  try {
    await loadThresholds();
    return NextResponse.json({ status: "ready" });
  } catch {
    return NextResponse.json({ status: "not ready" }, { status: 503 });
  }
});
