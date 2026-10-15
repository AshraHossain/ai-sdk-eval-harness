import { z } from "zod";
import { extractInvoice, invoiceSchema, type Invoice } from "../../src/lib/ai/extract";
import { exactMatch, numericTolerance, schemaValid } from "../scorers/deterministic";
import type { Suite } from "../runner/types";

export const extractCase = z.object({ id: z.string(), text: z.string(), expected: invoiceSchema });
type Case = z.infer<typeof extractCase>;

export const extractSuite: Suite<Case, Invoice> = {
  name: "extract",
  title: "Structured extraction",
  description: "Invoice fields -> typed object. Schema validity, exact fields and numeric tolerance.",
  caseSchema: extractCase,
  run: (model, c) => extractInvoice(model, { text: c.text }),
  async score({ case: c, output }) {
    return [
      schemaValid("schema", output, invoiceSchema),
      exactMatch("vendor", output.vendor, c.expected.vendor),
      numericTolerance("total", output.total, c.expected.total, { abs: 0.01 }),
      exactMatch("currency", output.currency, c.expected.currency),
      exactMatch("dueDate", String(output.dueDate), String(c.expected.dueDate)),
    ];
  },
};
