import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { AnySuite, EvalCase } from '../suites/types';

export const DATASETS_DIR = path.join(/*turbopackIgnore: true*/ process.cwd(), 'evals', 'datasets');

/**
 * Parses a JSONL golden dataset and validates every row against the suite's
 * schema. Errors name the file and line so a bad edit is a one-glance fix.
 */
export function parseDataset(suite: AnySuite, raw: string, source = suite.dataset): EvalCase<unknown, unknown>[] {
  const cases: EvalCase<unknown, unknown>[] = [];
  const seen = new Set<string>();
  raw.split('\n').forEach((line, i) => {
    if (!line.trim()) return;
    let json: unknown;
    try {
      json = JSON.parse(line);
    } catch (e) {
      throw new Error(`${source}:${i + 1}: invalid JSON (${(e as Error).message})`);
    }
    const parsed = suite.caseSchema.safeParse(json);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((x) => `${x.path.join('.') || '(root)'}: ${x.message}`).join('; ');
      throw new Error(`${source}:${i + 1}: ${issues}`);
    }
    if (seen.has(parsed.data.id)) throw new Error(`${source}:${i + 1}: duplicate case id "${parsed.data.id}"`);
    seen.add(parsed.data.id);
    cases.push(parsed.data);
  });
  if (cases.length === 0) throw new Error(`${source}: dataset is empty`);
  return cases;
}

export function loadDataset(suite: AnySuite, dir = DATASETS_DIR): EvalCase<unknown, unknown>[] {
  const file = path.join(dir, suite.dataset);
  return parseDataset(suite, readFileSync(/*turbopackIgnore: true*/ file, 'utf8'), path.relative(process.cwd(), file));
}
