/**
 * Deterministic scorers: cheap, exact, and reproducible. Prefer these over an
 * LLM judge whenever the property can be checked mechanically.
 */
import type { ZodType } from 'zod';
import type { ScoreResult } from './types';

const det = (name: string, score: number, pass: boolean, detail?: string): ScoreResult => ({
  name,
  kind: 'deterministic',
  score: Math.max(0, Math.min(1, score)),
  pass,
  detail,
});

export function exactMatch(name: string, actual: unknown, expected: unknown): ScoreResult {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  return det(name, ok ? 1 : 0, ok, ok ? undefined : `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

export function containsAll(name: string, text: string, needles: string[]): ScoreResult {
  if (needles.length === 0) return det(name, 1, true);
  const hay = text.toLowerCase();
  const missing = needles.filter((n) => !hay.includes(n.toLowerCase()));
  const score = (needles.length - missing.length) / needles.length;
  return det(name, score, missing.length === 0, missing.length ? `missing: ${missing.join(', ')}` : undefined);
}

export function containsNone(name: string, text: string, forbidden: string[]): ScoreResult {
  // Word-boundary aware so forbidding "ten" does not trip on "often".
  const found = forbidden.filter((n) => {
    const esc = n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pre = /^\w/.test(n) ? '\\b' : '';
    const post = /\w$/.test(n) ? '\\b' : '';
    return new RegExp(`${pre}${esc}${post}`, 'i').test(text);
  });
  return det(name, found.length ? 0 : 1, found.length === 0, found.length ? `found forbidden: ${found.join(', ')}` : undefined);
}

export function regexMatch(name: string, text: string, pattern: RegExp): ScoreResult {
  const ok = pattern.test(text);
  return det(name, ok ? 1 : 0, ok, ok ? undefined : `did not match ${pattern}`);
}

export function wordCount(text: string): number {
  const t = text.trim();
  return t ? t.split(/\s+/).length : 0;
}

export function lengthBudget(name: string, text: string, maxWords: number, minWords = 1): ScoreResult {
  const n = wordCount(text);
  const ok = n >= minWords && n <= maxWords;
  const score = ok ? 1 : n > maxWords ? maxWords / n : n / Math.max(minWords, 1);
  return det(name, score, ok, ok ? undefined : `${n} words (allowed ${minWords}-${maxWords})`);
}

export function schemaValid(name: string, value: unknown, schema: ZodType): ScoreResult {
  const r = schema.safeParse(value);
  return det(name, r.success ? 1 : 0, r.success, r.success ? undefined : r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
}

export function numericClose(name: string, actual: number, expected: number, tolerance = 0.01): ScoreResult {
  const diff = Math.abs(actual - expected);
  const ok = diff <= tolerance;
  return det(name, ok ? 1 : 0, ok, ok ? undefined : `|${actual} - ${expected}| = ${diff} > ${tolerance}`);
}

/** Fraction of expected fields that match; numbers compared with tolerance, strings case-insensitively. */
export function fieldAccuracy(
  name: string,
  actual: Record<string, unknown>,
  expected: Record<string, unknown>,
  { tolerance = 0.01, minScore = 1 }: { tolerance?: number; minScore?: number } = {},
): ScoreResult {
  const keys = Object.keys(expected);
  const wrong: string[] = [];
  for (const k of keys) {
    const a = actual?.[k];
    const e = expected[k];
    const ok =
      typeof e === 'number' && typeof a === 'number'
        ? Math.abs(a - e) <= tolerance
        : typeof e === 'string' && typeof a === 'string'
          ? a.trim().toLowerCase() === e.trim().toLowerCase()
          : JSON.stringify(a) === JSON.stringify(e);
    if (!ok) wrong.push(`${k}=${JSON.stringify(a)}≠${JSON.stringify(e)}`);
  }
  const score = keys.length ? (keys.length - wrong.length) / keys.length : 1;
  return det(name, score, score >= minScore, wrong.length ? wrong.join('; ') : undefined);
}

export interface ToolCallLike {
  toolName: string;
  input: unknown;
}

/**
 * Checks the agent called the expected tools (in order) with arguments that
 * include the expected subset. `expected: []` asserts no tool was called.
 */
export function toolCallsMatch(
  name: string,
  actual: ToolCallLike[],
  expected: Array<{ toolName: string; inputIncludes?: Record<string, unknown> }>,
): ScoreResult {
  if (expected.length === 0) {
    const ok = actual.length === 0;
    return det(name, ok ? 1 : 0, ok, ok ? undefined : `expected no tool calls, got ${actual.map((c) => c.toolName).join(', ')}`);
  }
  const problems: string[] = [];
  expected.forEach((exp, i) => {
    const call = actual[i];
    if (!call) return problems.push(`missing call #${i + 1} (${exp.toolName})`);
    if (call.toolName !== exp.toolName) return problems.push(`call #${i + 1}: ${call.toolName} ≠ ${exp.toolName}`);
    for (const [k, v] of Object.entries(exp.inputIncludes ?? {})) {
      const got = (call.input as Record<string, unknown>)?.[k];
      const same = typeof v === 'string' && typeof got === 'string' ? got.toLowerCase() === v.toLowerCase() : JSON.stringify(got) === JSON.stringify(v);
      if (!same) problems.push(`call #${i + 1}.${k}: ${JSON.stringify(got)} ≠ ${JSON.stringify(v)}`);
    }
  });
  if (actual.length > expected.length) problems.push(`${actual.length - expected.length} unexpected extra call(s)`);
  const score = problems.length === 0 ? 1 : Math.max(0, 1 - problems.length / (expected.length + 1));
  return det(name, score, problems.length === 0, problems.join('; ') || undefined);
}

/** Set overlap for things like citations: passes when every expected id is present and nothing else is. */
export function setMatch(name: string, actual: string[], expected: string[]): ScoreResult {
  const a = new Set(actual);
  const e = new Set(expected);
  const missing = [...e].filter((x) => !a.has(x));
  const extra = [...a].filter((x) => !e.has(x));
  const union = new Set([...a, ...e]).size;
  const score = union === 0 ? 1 : (union - missing.length - extra.length) / union;
  const ok = missing.length === 0 && extra.length === 0;
  return det(name, score, ok, ok ? undefined : `missing [${missing}] extra [${extra}]`);
}
