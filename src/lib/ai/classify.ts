import { generateObject, type LanguageModel } from "ai";
import { z } from "zod";

export const TICKET_LABELS = ["billing", "technical", "account", "other"] as const;
export type TicketLabel = (typeof TICKET_LABELS)[number];

export const classificationSchema = z.object({
  label: z.enum(TICKET_LABELS),
  confidence: z.number().min(0).max(1),
});
export type Classification = z.infer<typeof classificationSchema>;

export async function classifyTicket(model: LanguageModel, input: { text: string }): Promise<Classification> {
  const { object } = await generateObject({
    model,
    temperature: 0,
    schema: classificationSchema,
    system: `Classify the support ticket into exactly one of: ${TICKET_LABELS.join(", ")}.`,
    prompt: `TICKET:\n${input.text}`,
  });
  return object;
}
