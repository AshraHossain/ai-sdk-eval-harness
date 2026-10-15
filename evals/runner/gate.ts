import { z } from "zod";
import type { SuiteReport } from "./types";

const limits = z.object({ minPassRate: z.number().min(0).max(1), maxFlakeRate: z.number().min(0).max(1) });
export const thresholdsSchema = z.object({
  default: limits,
  suites: z.record(z.string(), limits.partial()).default({}),
});
export type Thresholds = z.infer<typeof thresholdsSchema>;

export interface GateResult {
  suite: string;
  passRate: number;
  flakeRate: number;
  minPassRate: number;
  maxFlakeRate: number;
  ok: boolean;
  failures: string[];
}

export function evaluateGate(reports: SuiteReport[], thresholds: Thresholds): { ok: boolean; results: GateResult[] } {
  const results = reports.map((r): GateResult => {
    const t = { ...thresholds.default, ...thresholds.suites[r.suite] };
    const failures: string[] = [];
    if (r.summary.passRate < t.minPassRate) failures.push(`pass rate ${pct(r.summary.passRate)} < ${pct(t.minPassRate)}`);
    if (r.summary.flakeRate > t.maxFlakeRate) failures.push(`flake rate ${pct(r.summary.flakeRate)} > ${pct(t.maxFlakeRate)}`);
    return {
      suite: r.suite,
      passRate: r.summary.passRate,
      flakeRate: r.summary.flakeRate,
      minPassRate: t.minPassRate,
      maxFlakeRate: t.maxFlakeRate,
      ok: failures.length === 0,
      failures,
    };
  });
  return { ok: results.every((r) => r.ok), results };
}

export const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
