import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { EvalCase, Suite } from "./types";
import type { Fixture } from "../mock/mockModel";
import { baselineSchema, thresholdsSchema, type Baseline, type Thresholds } from "./gate";

export const EVALS_DIR = path.join(process.cwd(), "evals");

const manifestSchema = z.record(z.string(), z.object({ version: z.string(), file: z.string() }));

export function parseJsonl<C extends EvalCase>(raw: string, suite: Suite<C, unknown>, source = suite.name): C[] {
  const cases = raw
    .split("\n")
    .map((l, i) => ({ l: l.trim(), n: i + 1 }))
    .filter(({ l }) => l && !l.startsWith("//"))
    .map(({ l, n }) => {
      let json: unknown;
      try {
        json = JSON.parse(l);
      } catch {
        throw new Error(`${source}:${n}: invalid JSON`);
      }
      const parsed = suite.caseSchema.safeParse(json);
      if (!parsed.success) throw new Error(`${source}:${n}: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`);
      return parsed.data;
    });
  const dup = cases.map((c) => c.id).find((id, i, a) => a.indexOf(id) !== i);
  if (dup) throw new Error(`${source}: duplicate case id "${dup}"`);
  return cases;
}

export async function loadDataset<C extends EvalCase>(suite: Suite<C, unknown>, dir = EVALS_DIR) {
  const manifest = manifestSchema.parse(JSON.parse(await readFile(path.join(dir, "datasets", "manifest.json"), "utf8")));
  const entry = manifest[suite.name];
  if (!entry) throw new Error(`No dataset in manifest for suite "${suite.name}"`);
  const raw = await readFile(path.join(dir, "datasets", entry.file), "utf8");
  return {
    cases: parseJsonl(raw, suite, entry.file),
    version: entry.version,
    hash: createHash("sha256").update(raw).digest("hex").slice(0, 12),
  };
}

export async function loadFixtures(suite: string, dir = EVALS_DIR): Promise<Record<string, Fixture[]>> {
  return JSON.parse(await readFile(path.join(dir, "fixtures", `${suite}.json`), "utf8"));
}

export async function loadThresholds(dir = EVALS_DIR): Promise<Thresholds> {
  return thresholdsSchema.parse(JSON.parse(await readFile(path.join(dir, "thresholds.json"), "utf8")));
}

/** Baselines are per mode: a mock baseline says nothing about a live model. */
export const baselinePath = (mode: "mock" | "live", dir = EVALS_DIR) => path.join(dir, "baselines", `${mode}.json`);

export async function loadBaseline(mode: "mock" | "live", dir = EVALS_DIR): Promise<Baseline | undefined> {
  let raw: string;
  try {
    raw = await readFile(baselinePath(mode, dir), "utf8");
  } catch {
    return undefined;
  }
  return baselineSchema.parse(JSON.parse(raw));
}
