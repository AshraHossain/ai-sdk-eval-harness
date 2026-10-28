import { z } from 'zod';
import { extractInvoice, invoiceSchema } from '../../src/lib/features/extract';
import { exactMatch, fieldAccuracy, numericClose, schemaValid } from '../scorers/deterministic';
import { defineSuite } from './types';

const caseSchema = z.object({
  id: z.string(),
  tags: z.array(z.string()).optional(),
  input: z.object({ document: z.string().min(1) }),
  expected: z.object({
    vendor: z.string(),
    invoiceNumber: z.string(),
    date: z.string(),
    currency: z.string(),
    total: z.number(),
    lineItemCount: z.number().int().nonnegative(),
  }),
});

export const extractSuite = defineSuite({
  name: 'extract',
  description: 'Structured invoice extraction. Schema validity, per-field accuracy, line-item count, and arithmetic consistency.',
  dataset: 'extract.jsonl',
  caseSchema,
  run: (input, { subject }) => extractInvoice(subject, input.document),
  score: async (c, output) => {
    const { lineItemCount, ...fields } = c.expected;
    const lineSum = (output.lineItems ?? []).reduce((s, li) => s + li.quantity * li.unitPrice, 0);
    return [
      schemaValid('schema', output, invoiceSchema),
      fieldAccuracy('fields', output as unknown as Record<string, unknown>, fields),
      exactMatch('line_item_count', output.lineItems?.length ?? 0, lineItemCount),
      // Self-consistency: the extracted line items must add up to the extracted total.
      numericClose('line_items_sum_to_total', Math.round(lineSum * 100) / 100, output.total, 0.01),
    ];
  },
});
