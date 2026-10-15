import { generateObject, type LanguageModel } from "ai";
import { z } from "zod";

export const invoiceSchema = z.object({
  vendor: z.string(),
  total: z.number(),
  currency: z.string().length(3),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
});
export type Invoice = z.infer<typeof invoiceSchema>;

export async function extractInvoice(model: LanguageModel, input: { text: string }): Promise<Invoice> {
  const { object } = await generateObject({
    model,
    temperature: 0,
    schema: invoiceSchema,
    system: "Extract invoice fields. Dates are ISO (YYYY-MM-DD); use null when no due date is stated.",
    prompt: `DOCUMENT:\n${input.text}`,
  });
  return object;
}
