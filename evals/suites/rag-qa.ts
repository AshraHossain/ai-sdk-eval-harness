import { z } from 'zod';
import { answerWithContext, formatDocs } from '../../src/lib/features/rag-qa';
import { containsAll, exactMatch, setMatch } from '../scorers/deterministic';
import { llmJudge } from '../scorers/llm-judge';
import { defineSuite } from './types';

const caseSchema = z.object({
  id: z.string(),
  tags: z.array(z.string()).optional(),
  input: z.object({
    question: z.string().min(1),
    docs: z.array(z.object({ id: z.string(), text: z.string() })).min(1),
  }),
  expected: z.object({
    answerable: z.boolean(),
    mustInclude: z.array(z.string()),
    citations: z.array(z.string()),
    reference: z.string(),
  }),
});

export const ragQaSuite = defineSuite({
  name: 'rag-qa',
  description: 'Grounded QA over supplied docs. Answerability (refusal) accuracy, citation precision/recall, and judged groundedness.',
  dataset: 'rag-qa.jsonl',
  caseSchema,
  run: (input, { subject }) => answerWithContext(subject, input.question, input.docs),
  score: async (c, output, { judge }) => [
    exactMatch('answerable', output.answerable, c.expected.answerable),
    containsAll('answer_content', output.answer, c.expected.mustInclude),
    setMatch('citations', output.citations, c.expected.citations),
    await llmJudge('groundedness', judge, {
      criteria:
        'Groundedness: OUTPUT answers the question using only INPUT documents, or correctly says it does not know when the documents lack the answer.',
      input: `${formatDocs(c.input.docs)}\n\nQUESTION: ${c.input.question}`,
      output: output.answer,
      reference: c.expected.reference,
    }),
  ],
});
