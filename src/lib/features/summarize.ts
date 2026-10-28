import { generateText, type LanguageModel } from 'ai';

export const SUMMARIZE_INSTRUCTIONS = `Task: summarize
You write faithful, concise summaries. Use only facts stated in the source text.
Never add information that is not in the source. Respond with the summary only.`;

export async function summarize(model: LanguageModel, text: string, maxWords: number): Promise<string> {
  const { text: summary } = await generateText({
    model,
    instructions: SUMMARIZE_INSTRUCTIONS,
    prompt: `Summarize the following text in at most ${maxWords} words.\n\nTEXT:\n${text}`,
    temperature: 0,
  });
  return summary.trim();
}
