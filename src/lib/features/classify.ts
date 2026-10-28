import { generateText, Output, type LanguageModel } from 'ai';
import { z } from 'zod';

export const TICKET_LABELS = ['billing', 'technical', 'account', 'shipping', 'other'] as const;
export type TicketLabel = (typeof TICKET_LABELS)[number];

export const classificationSchema = z.object({
  label: z.enum(TICKET_LABELS),
  confidence: z.number().min(0).max(1),
});
export type Classification = z.infer<typeof classificationSchema>;

export const CLASSIFY_INSTRUCTIONS = `Task: classify
You route customer support tickets. Pick exactly one label:
- billing: charges, refunds, invoices, payment methods
- technical: bugs, errors, crashes, performance
- account: login, password, profile, account access or deletion
- shipping: delivery, tracking, lost or damaged packages
- other: anything else
Return the label and your confidence from 0 to 1.`;

export async function classifyTicket(model: LanguageModel, ticket: string): Promise<Classification> {
  const { output } = await generateText({
    model,
    instructions: CLASSIFY_INSTRUCTIONS,
    prompt: `TICKET:\n${ticket}`,
    output: Output.object({ schema: classificationSchema }),
    temperature: 0,
  });
  return output;
}
