import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { baselinePath, evaluateGate, loadBaseline, loadGateConfig, runEvals } from '@/evals/runner';
import { loadDataset } from '@/evals/runner/dataset';
import { SUITE_NAMES, SUITES } from '@/evals/suites';
import { getEvalMode } from '@/src/lib/models';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const bodySchema = z.object({
  suites: z.array(z.enum(SUITE_NAMES as [string, ...string[]])).min(1).optional(),
  runs: z.number().int().min(1).max(10).default(3),
  only: z.array(z.string()).min(1).optional(),
});

/** Total model executions (cases × runs) one request may trigger in live mode. */
const LIVE_EXECUTION_CAP = 120;

let running = false;

/**
 * Mock mode costs only CPU, so the API is open. Live mode spends tokens, so it
 * needs EVAL_API_ENABLED=true AND a bearer token matching EVAL_API_TOKEN.
 */
function authorize(req: Request): NextResponse | null {
  if (getEvalMode() === 'mock') return null;
  const token = process.env.EVAL_API_TOKEN;
  if (process.env.EVAL_API_ENABLED !== 'true' || !token) {
    return NextResponse.json({ error: 'Eval API is disabled in live mode. Set EVAL_API_ENABLED=true and EVAL_API_TOKEN.' }, { status: 403 });
  }
  const given = Buffer.from(req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '');
  const want = Buffer.from(token);
  if (given.length !== want.length || !timingSafeEqual(given, want)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}

export async function GET() {
  return NextResponse.json({
    mode: getEvalMode(),
    apiEnabled: getEvalMode() === 'mock' || (process.env.EVAL_API_ENABLED === 'true' && !!process.env.EVAL_API_TOKEN),
    suites: SUITES.map((s) => ({ name: s.name, description: s.description, cases: loadDataset(s).length })),
  });
}

export async function POST(req: Request) {
  const denied = authorize(req);
  if (denied) return denied;

  let json: unknown = {};
  try {
    json = await req.json();
  } catch {
    // An empty body means "defaults".
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', issues: parsed.error.issues }, { status: 400 });
  }

  const mode = getEvalMode();
  if (mode === 'live') {
    const chosen = parsed.data.suites ?? SUITE_NAMES;
    const cases = SUITES.filter((s) => chosen.includes(s.name)).reduce((n, s) => n + loadDataset(s).length, 0);
    if (cases * parsed.data.runs > LIVE_EXECUTION_CAP) {
      return NextResponse.json({ error: `Request would run ${cases * parsed.data.runs} executions; live cap is ${LIVE_EXECUTION_CAP}.` }, { status: 400 });
    }
  }
  // One live run at a time per server instance (mock runs are cheap and parallel-safe).
  const locks = mode === 'live';
  if (locks && running) return NextResponse.json({ error: 'An eval run is already in progress.' }, { status: 409 });

  if (locks) running = true;
  try {
    const report = await runEvals(parsed.data);
    report.gate = evaluateGate(report, loadGateConfig(), loadBaseline(baselinePath(mode)));
    return NextResponse.json(report);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  } finally {
    if (locks) running = false;
  }
}
