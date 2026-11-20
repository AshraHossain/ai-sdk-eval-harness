import { generateText, type LanguageModel } from "ai";
import { frameUntrusted, UNTRUSTED_NOTICE } from "../security/sanitize";
import { render, type FeaturePrompt } from "./prompt";

export interface SummarizeInput {
  text: string;
  maxWords: number;
}

export const SUMMARIZE_PROMPT: FeaturePrompt = {
  system: "You write faithful, concise summaries. Never add facts that are not in the source. " + UNTRUSTED_NOTICE,
  user: "Summarize the text below in at most {maxWords} words.\n\n{text}",
};

export async function summarize(model: LanguageModel, input: SummarizeInput): Promise<string> {
  const { text } = await generateText({
    model,
    temperature: 0,
    system: SUMMARIZE_PROMPT.system,
    prompt: render(SUMMARIZE_PROMPT.user, { maxWords: String(input.maxWords), text: frameUntrusted("text", input.text) }),
  });
  return text.trim();
}
