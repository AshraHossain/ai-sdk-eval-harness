import type { ZodType } from "zod";
import type { ScoreResult } from "./types";

const norm = (s: string, caseSensitive: boolean) => {
  const t = s.trim().replace(/\s+/g, " ");
  return caseSensitive ? t : t.toLowerCase();
};
const result = (name: string, pass: boolean, detail?: string, score = pass ? 1 : 0): ScoreResult => ({
  name,
  score,
  pass,
  detail,
});

export function exactMatch(name: string, actual: string, expected: string, opts: { caseSensitive?: boolean } = {}): ScoreResult {
  const cs = opts.caseSensitive ?? false;
  const pass = norm(actual, cs) === norm(expected, cs);
  return result(name, pass, pass ? undefined : `expected "${expected}", got "${actual}"`);
}

/** Passes when all (default) or any needles appear in the text, case-insensitively. */
export function contains(name: string, text: string, needles: string[], opts: { mode?: "all" | "any" } = {}): ScoreResult {
  const hay = text.toLowerCase();
  const hits = needles.filter((n) => hay.includes(n.toLowerCase()));
  const pass = needles.length === 0 || (opts.mode === "any" ? hits.length > 0 : hits.length === needles.length);
  const missing = needles.filter((n) => !hits.includes(n));
  return result(name, pass, pass ? undefined : `missing: ${missing.join(", ")}`, needles.length ? hits.length / needles.length : 1);
}

export function notContains(name: string, text: string, needles: string[]): ScoreResult {
  const hay = text.toLowerCase();
  const found = needles.filter((n) => hay.includes(n.toLowerCase()));
  return result(name, found.length === 0, found.length ? `forbidden present: ${found.join(", ")}` : undefined);
}

export function matchesRegex(name: string, text: string, pattern: RegExp): ScoreResult {
  const pass = pattern.test(text);
  return result(name, pass, pass ? undefined : `no match for ${pattern}`);
}

export function schemaValid(name: string, value: unknown, schema: ZodType): ScoreResult {
  const parsed = schema.safeParse(value);
  return result(name, parsed.success, parsed.success ? undefined : parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
}

/** Passes when |actual - expected| <= max(abs, rel * |expected|). */
export function numericTolerance(
  name: string,
  actual: number,
  expected: number,
  opts: { abs?: number; rel?: number } = {},
): ScoreResult {
  const tol = Math.max(opts.abs ?? 0, (opts.rel ?? 0) * Math.abs(expected));
  const diff = Math.abs(actual - expected);
  const pass = Number.isFinite(diff) && diff <= tol;
  return result(name, pass, pass ? undefined : `|${actual} - ${expected}| = ${diff} > ${tol}`);
}

export interface ToolCallLike {
  name: string;
  args: Record<string, unknown>;
}

const argsMatch = (actual: Record<string, unknown>, expected: Record<string, unknown>) =>
  Object.entries(expected).every(([k, v]) => {
    const a = actual[k];
    return typeof v === "string" && typeof a === "string" ? a.toLowerCase() === v.toLowerCase() : JSON.stringify(a) === JSON.stringify(v);
  });

/**
 * Every expected call must be present (args are a subset match). With `ordered`, expected calls
 * must also appear in order. Extra calls are allowed unless `exact` is set.
 */
export function toolCallMatch(
  name: string,
  actual: ToolCallLike[],
  expected: ToolCallLike[],
  opts: { ordered?: boolean; exact?: boolean } = {},
): ScoreResult {
  if (opts.exact && actual.length !== expected.length) {
    return result(name, false, `expected ${expected.length} calls, got ${actual.length}`);
  }
  let cursor = 0;
  const missing: string[] = [];
  for (const exp of expected) {
    const start = opts.ordered ? cursor : 0;
    const idx = actual.findIndex((a, i) => i >= start && a.name === exp.name && argsMatch(a.args, exp.args));
    if (idx === -1) missing.push(exp.name);
    else if (opts.ordered) cursor = idx + 1;
  }
  const pass = missing.length === 0;
  return result(name, pass, pass ? undefined : `missing/misordered calls: ${missing.join(", ")}`, expected.length ? (expected.length - missing.length) / expected.length : 1);
}

export const countWords = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

export function lengthBudget(name: string, text: string, opts: { maxWords?: number; minWords?: number; maxChars?: number }): ScoreResult {
  const words = countWords(text);
  const problems: string[] = [];
  if (opts.maxWords !== undefined && words > opts.maxWords) problems.push(`${words} words > max ${opts.maxWords}`);
  if (opts.minWords !== undefined && words < opts.minWords) problems.push(`${words} words < min ${opts.minWords}`);
  if (opts.maxChars !== undefined && text.length > opts.maxChars) problems.push(`${text.length} chars > max ${opts.maxChars}`);
  return result(name, problems.length === 0, problems.join("; ") || undefined);
}
