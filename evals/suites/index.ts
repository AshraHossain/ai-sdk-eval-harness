import type { EvalCase, Suite } from "../runner/types";
import { agentSuite } from "./agent";
import { classifySuite } from "./classify";
import { extractSuite } from "./extract";
import { ragSuite } from "./rag";
import { summarizeSuite } from "./summarize";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnySuite = Suite<any, any>;

export const SUITES: AnySuite[] = [summarizeSuite, classifySuite, extractSuite, ragSuite, agentSuite];
export const suiteNames = SUITES.map((s) => s.name);

export function getSuite(name: string): AnySuite {
  const s = SUITES.find((x) => x.name === name);
  if (!s) throw new Error(`Unknown suite "${name}". Available: ${suiteNames.join(", ")}`);
  return s;
}
export type { EvalCase };
