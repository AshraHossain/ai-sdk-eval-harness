import { generateObject, type LanguageModel } from "ai";
import { z } from "zod";

export interface Doc {
  id: string;
  text: string;
}

export const groundedAnswerSchema = z.object({
  answerable: z.boolean(),
  answer: z.string(),
  citations: z.array(z.string()),
});
export type GroundedAnswer = z.infer<typeof groundedAnswerSchema>;

export async function groundedQa(
  model: LanguageModel,
  input: { question: string; documents: Doc[] },
): Promise<GroundedAnswer> {
  const context = input.documents.map((d) => `[${d.id}] ${d.text}`).join("\n");
  const { object } = await generateObject({
    model,
    temperature: 0,
    schema: groundedAnswerSchema,
    system:
      "Answer ONLY from the provided documents and cite document ids. " +
      "If the documents do not contain the answer, set answerable=false, answer \"I don't know\", and cite nothing.",
    prompt: `DOCUMENTS:\n${context}\n\nQUESTION: ${input.question}`,
  });
  return object;
}
