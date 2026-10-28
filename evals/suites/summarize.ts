import { z } from 'zod';
import { summarize } from '../../src/lib/features/summarize';
import { containsAll, containsNone, lengthBudget } from '../scorers/deterministic';
import { llmJudge } from '../scorers/llm-judge';
import { defineSuite } from './types';

const caseSchema = z.object({
  id: z.string(),
  tags: z.array(z.string()).optional(),
  input: z.object({ text: z.string().min(1), maxWords: z.number().int().positive() }),
  expected: z.object({
    mustInclude: z.array(z.string()),
    mustNotInclude: z.array(z.string()),
    reference: z.string(),
  }),
});

export const summarizeSuite = defineSuite({
  name: 'summarize',
  description: 'Faithful, length-bounded summaries. Deterministic coverage + hallucination guards, judged for faithfulness.',
  dataset: 'summarize.jsonl',
  caseSchema,
  run: (input, { subject }) => summarize(subject, input.text, input.maxWords),
  score: async (c, output, { judge }) => [
    lengthBudget('length_budget', output, c.input.maxWords),
    containsAll('key_facts', output, c.expected.mustInclude),
    containsNone('no_hallucinated_terms', output, c.expected.mustNotInclude),
    await llmJudge('faithfulness', judge, {
      criteria: 'Faithfulness: every claim in OUTPUT is stated in INPUT, and the main point of INPUT is covered.',
      input: c.input.text,
      output,
      reference: c.expected.reference,
    }),
  ],
});
