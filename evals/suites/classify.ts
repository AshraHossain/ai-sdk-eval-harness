import { z } from 'zod';
import { classificationSchema, classifyTicket, TICKET_LABELS } from '../../src/lib/features/classify';
import { exactMatch, schemaValid } from '../scorers/deterministic';
import { defineSuite } from './types';

const caseSchema = z.object({
  id: z.string(),
  tags: z.array(z.string()).optional(),
  input: z.object({ ticket: z.string().min(1) }),
  expected: z.object({ label: z.enum(TICKET_LABELS) }),
});

export const classifySuite = defineSuite({
  name: 'classify',
  description: 'Support-ticket routing into 5 labels. Purely deterministic: schema + exact label match.',
  dataset: 'classify.jsonl',
  caseSchema,
  run: (input, { subject }) => classifyTicket(subject, input.ticket),
  score: async (c, output) => [
    schemaValid('schema', output, classificationSchema),
    exactMatch('label', output.label, c.expected.label),
  ],
});
