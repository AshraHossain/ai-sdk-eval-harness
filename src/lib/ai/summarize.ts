import { generateText, type LanguageModel } from "ai";
import { frameUntrusted, UNTRUSTED_NOTICE } from "../security/sanitize";

export interface SummarizeInput {
  text: string;
  maxWords: number;
}

export async function summarize(model: LanguageModel, input: SummarizeInput): Promise<string> {
  const { text } = await generateText({
    model,
    temperature: 0,
    system: "You write faithful, concise summaries. Never add facts that are not in the source. " + UNTRUSTED_NOTICE,
    prompt: `Summarize the text below in at most ${input.maxWords} words.\n\n${frameUntrusted("text", input.text)}`,
  });
  return text.trim();
}
