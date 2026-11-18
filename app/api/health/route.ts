import { NextResponse } from "next/server";
import { withTiming } from "@/src/lib/security/http";

export const dynamic = "force-dynamic";

/** Liveness: the process is up. No auth, no rate limit (see middleware OPEN_PATHS). */
export const GET = withTiming(async () => NextResponse.json({ status: "ok" }));
