import { generateObject, type LanguageModel } from "ai";
import { z } from "zod";
import { frameUntrusted, UNTRUSTED_NOTICE } from "../security/sanitize";
import { render, type FeaturePrompt } from "./prompt";

export const TICKET_LABELS = ["billing", "technical", "account", "other"] as const;
export type TicketLabel = (typeof TICKET_LABELS)[number];

export const classificationSchema = z.object({
  label: z.enum(TICKET_LABELS),
  confidence: z.number().min(0).max(1),
});
export type Classification = z.infer<typeof classificationSchema>;

export const CLASSIFY_PROMPT: FeaturePrompt = {
  system: `Classify the support ticket into exactly one of: ${TICKET_LABELS.join(", ")}. ${UNTRUSTED_NOTICE}`,
  user: "{ticket}",
};

export async function classifyTicket(model: LanguageModel, input: { text: string }): Promise<Classification> {
  const { object } = await generateObject({
    model,
    temperature: 0,
    schema: classificationSchema,
    system: CLASSIFY_PROMPT.system,
    prompt: render(CLASSIFY_PROMPT.user, { ticket: frameUntrusted("ticket", input.text) }),
  });
  return object;
}
