import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { EvalReport } from '@/evals/runner/types';
import { loadDataset } from '@/evals/runner/dataset';
import { SUITES } from '@/evals/suites';
import { getEvalMode } from '@/src/lib/models';
import { Dashboard } from './dashboard';

export const dynamic = 'force-dynamic';

function readLatestReport(): EvalReport | null {
  const file = path.join(process.cwd(), 'reports', 'latest.json');
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as EvalReport;
  } catch {
    return null;
  }
}

export default function Page() {
  const suites = SUITES.map((s) => ({ name: s.name, description: s.description, cases: loadDataset(s).length }));
  return <Dashboard suites={suites} mode={getEvalMode()} initialReport={readLatestReport()} />;
}
