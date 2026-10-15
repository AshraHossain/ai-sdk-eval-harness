import { z } from "zod";
import { groundedAnswerSchema, groundedQa, type GroundedAnswer } from "../../src/lib/ai/groundedQa";
import { contains, schemaValid } from "../scorers/deterministic";
import { llmJudge } from "../scorers/judge";
import type { Suite } from "../runner/types";

export const ragCase = z.object({
  id: z.string(),
  question: z.string(),
  documents: z.array(z.object({ id: z.string(), text: z.string() })),
  answerable: z.boolean(),
  answerContains: z.array(z.string()),
  citations: z.array(z.string()),
  reference: z.string(),
});
type Case = z.infer<typeof ragCase>;

export const ragSuite: Suite<Case, GroundedAnswer> = {
  name: "rag",
  title: "Grounded QA (RAG)",
  description: "Answers only from supplied documents, cites sources, abstains when unanswerable.",
  caseSchema: ragCase,
  run: (model, c) => groundedQa(model, { question: c.question, documents: c.documents }),
  async score({ case: c, output, judge }) {
    const base = [
      schemaValid("schema", output, groundedAnswerSchema),
      { name: "abstention", score: output.answerable === c.answerable ? 1 : 0, pass: output.answerable === c.answerable, detail: `answerable=${output.answerable}, expected ${c.answerable}` },
    ];
    if (!c.answerable) {
      const cited = output.citations.length === 0;
      return [...base, { name: "no-citations", score: cited ? 1 : 0, pass: cited, detail: cited ? undefined : `cited ${output.citations.join(",")}` }];
    }
    return [
      ...base,
      contains("answer", output.answer, c.answerContains),
      contains("citations", output.citations.join(" "), c.citations),
      await llmJudge(judge, {
        name: "faithfulness",
        rubric: "5 = every claim in the output is supported by the reference answer and nothing is invented. Subtract for unsupported claims.",
      }, { input: c.question, output: output.answer, reference: c.reference }),
    ];
  },
};
