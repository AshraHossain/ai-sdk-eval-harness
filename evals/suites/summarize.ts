import { z } from "zod";
import { summarize } from "../../src/lib/ai/summarize";
import { contains, lengthBudget } from "../scorers/deterministic";
import { llmJudge } from "../scorers/judge";
import type { Suite } from "../runner/types";

export const summarizeCase = z.object({
  id: z.string(),
  text: z.string(),
  maxWords: z.number().int().positive(),
  mustContain: z.array(z.string()),
  reference: z.string(),
});
type Case = z.infer<typeof summarizeCase>;

export const summarizeSuite: Suite<Case, string> = {
  name: "summarize",
  title: "Summarization",
  description: "Faithful, length-bounded summaries. Deterministic keyword + length checks, plus an LLM judge.",
  caseSchema: summarizeCase,
  run: (model, c) => summarize(model, { text: c.text, maxWords: c.maxWords }),
  async score({ case: c, output, judge }) {
    return [
      contains("keywords", output, c.mustContain),
      lengthBudget("length", output, { maxWords: c.maxWords, minWords: 5 }),
      await llmJudge(judge, {
        name: "faithful-concise",
        rubric: "5 = covers the key points of the reference, adds no facts absent from the source, and is concise. Subtract for omissions, invented facts, or padding.",
      }, { input: c.text, output, reference: c.reference }),
    ];
  },
};
