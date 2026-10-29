import { TICKET_LABELS } from "../../src/lib/ai/classify";
import type { Fixture } from "./mockModel";

/**
 * Fault injection for the gate self-test. EVAL_MOCK_FAULT=<name> makes the
 * fixture model regress in one realistic way. CI runs the gate once per fault
 * and asserts it FAILS: a gate that never fails is worse than no gate.
 */
type Obj = Record<string, unknown>;
/** The fixture as a plain structured object, or undefined for text / agent-step fixtures. */
const asObj = (f: Fixture): Obj | undefined => (typeof f === "object" && f !== null && !("steps" in f) ? (f as Obj) : undefined);

export const MOCK_FAULTS = {
  /** Summaries cut to a few words: key facts go missing. */
  "summarize-truncate": { suite: "summarize", apply: (f: Fixture) => (typeof f === "string" ? f.split(/\s+/).slice(0, 4).join(" ") : f) },
  /** Classifier routes every ticket to the next label. */
  "classify-shift-label": {
    suite: "classify",
    apply: (f: Fixture) => {
      const o = asObj(f);
      if (!o) return f;
      const i = TICKET_LABELS.indexOf(o.label as (typeof TICKET_LABELS)[number]);
      return { ...o, label: TICKET_LABELS[(i + 1) % TICKET_LABELS.length] };
    },
  },
  /** Extractor misreads the total by an order of magnitude. */
  "extract-bad-total": {
    suite: "extract",
    apply: (f: Fixture) => {
      const o = asObj(f);
      return o && typeof o.total === "number" ? { ...o, total: o.total * 10 } : f;
    },
  },
  /** Grounded QA stops citing its sources. */
  "rag-no-citations": { suite: "rag", apply: (f: Fixture) => { const o = asObj(f); return o ? { ...o, citations: [] } : f; } },
  /** Agent answers from memory instead of calling tools. */
  "agent-skip-tools": {
    suite: "agent",
    apply: (f: Fixture): Fixture => {
      if (typeof f !== "object" || !("steps" in f) || !Array.isArray(f.steps)) return f;
      return { steps: [{ text: "I believe it is probably fine." }] };
    },
  },
} as const;

export type MockFault = keyof typeof MOCK_FAULTS;
export const mockFaultNames = Object.keys(MOCK_FAULTS) as MockFault[];

export function applyFault(fault: string | undefined, suite: string, fixture: Fixture): Fixture {
  if (!fault) return fixture;
  const spec = MOCK_FAULTS[fault as MockFault];
  if (!spec) throw new Error(`Unknown EVAL_MOCK_FAULT "${fault}". Known: ${mockFaultNames.join(", ")}`);
  return spec.suite === suite ? spec.apply(fixture) : fixture;
}
