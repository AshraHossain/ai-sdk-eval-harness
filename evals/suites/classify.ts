import { z } from "zod";
import { classificationSchema, classifyTicket, TICKET_LABELS, type Classification } from "../../src/lib/ai/classify";
import { exactMatch, schemaValid } from "../scorers/deterministic";
import type { Suite } from "../runner/types";

export const classifyCase = z.object({ id: z.string(), text: z.string(), label: z.enum(TICKET_LABELS) });
type Case = z.infer<typeof classifyCase>;

export const classifySuite: Suite<Case, Classification> = {
  name: "classify",
  title: "Ticket classification",
  description: "Support-ticket routing into billing / technical / account / other. Fully deterministic scoring.",
  caseSchema: classifyCase,
  run: (model, c) => classifyTicket(model, { text: c.text }),
  async score({ case: c, output }) {
    return [schemaValid("schema", output, classificationSchema), exactMatch("label", output.label, c.label)];
  },
};
