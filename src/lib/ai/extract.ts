import { generateObject, type LanguageModel } from "ai";
import { z } from "zod";
import { frameUntrusted, UNTRUSTED_NOTICE } from "../security/sanitize";
import { render, type FeaturePrompt } from "./prompt";

export const invoiceSchema = z.object({
  vendor: z.string(),
  total: z.number(),
  currency: z.string().length(3),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
});
export type Invoice = z.infer<typeof invoiceSchema>;

export const EXTRACT_PROMPT: FeaturePrompt = {
  system: "Extract invoice fields. Dates are ISO (YYYY-MM-DD); use null when no due date is stated. " + UNTRUSTED_NOTICE,
  user: "{invoice}",
};

export async function extractInvoice(model: LanguageModel, input: { text: string }): Promise<Invoice> {
  const { object } = await generateObject({
    model,
    temperature: 0,
    schema: invoiceSchema,
    system: EXTRACT_PROMPT.system,
    prompt: render(EXTRACT_PROMPT.user, { invoice: frameUntrusted("invoice", input.text) }),
  });
  return object;
}
