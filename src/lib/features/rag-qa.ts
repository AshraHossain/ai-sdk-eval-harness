import { generateText, Output, type LanguageModel } from 'ai';
import { z } from 'zod';

export interface ContextDoc {
  id: string;
  text: string;
}

export const ragAnswerSchema = z.object({
  answer: z.string(),
  citations: z.array(z.string()),
  answerable: z.boolean(),
});
export type RagAnswer = z.infer<typeof ragAnswerSchema>;

export const RAG_INSTRUCTIONS = `Task: rag-qa
Answer the question using ONLY the provided documents.
Cite the id of every document you used in "citations".
If the documents do not contain the answer, set answerable=false,
answer "I don't know based on the provided documents.", and cite nothing.`;

export function formatDocs(docs: ContextDoc[]): string {
  return docs.map((d) => `[${d.id}] ${d.text}`).join('\n');
}

export async function answerWithContext(
  model: LanguageModel,
  question: string,
  docs: ContextDoc[],
): Promise<RagAnswer> {
  const { output } = await generateText({
    model,
    instructions: RAG_INSTRUCTIONS,
    prompt: `DOCUMENTS:\n${formatDocs(docs)}\n\nQUESTION: ${question}`,
    output: Output.object({ schema: ragAnswerSchema }),
    temperature: 0,
  });
  return output;
}
