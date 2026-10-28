import { generateText, Output, type LanguageModel } from 'ai';
import { z } from 'zod';

export const invoiceSchema = z.object({
  vendor: z.string(),
  invoiceNumber: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
  currency: z.string().length(3),
  total: z.number(),
  lineItems: z.array(
    z.object({
      description: z.string(),
      quantity: z.number(),
      unitPrice: z.number(),
    }),
  ),
});
export type Invoice = z.infer<typeof invoiceSchema>;

export const EXTRACT_INSTRUCTIONS = `Task: extract
Extract invoice fields from the document. Dates must be YYYY-MM-DD.
Currency must be an ISO 4217 code. Numbers must be plain numbers without symbols.`;

export async function extractInvoice(model: LanguageModel, document: string): Promise<Invoice> {
  const { output } = await generateText({
    model,
    instructions: EXTRACT_INSTRUCTIONS,
    prompt: `DOCUMENT:\n${document}`,
    output: Output.object({ schema: invoiceSchema }),
    temperature: 0,
  });
  return output;
}
