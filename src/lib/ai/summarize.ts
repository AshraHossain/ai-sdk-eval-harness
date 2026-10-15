import { generateText, type LanguageModel } from "ai";

export interface SummarizeInput {
  text: string;
  maxWords: number;
}

export async function summarize(model: LanguageModel, input: SummarizeInput): Promise<string> {
  const { text } = await generateText({
    model,
    temperature: 0,
    system: "You write faithful, concise summaries. Never add facts that are not in the source.",
    prompt: `Summarize the text below in at most ${input.maxWords} words.\n\nTEXT:\n${input.text}`,
  });
  return text.trim();
}
