import { generateText, stepCountIs, tool, type LanguageModel } from "ai";
import { z } from "zod";

const WEATHER: Record<string, { tempC: number; conditions: string }> = {
  paris: { tempC: 18, conditions: "cloudy" },
  tokyo: { tempC: 24, conditions: "sunny" },
  oslo: { tempC: 5, conditions: "snow" },
};
const RATES: Record<string, number> = { "USD:EUR": 0.9, "EUR:USD": 1.1, "USD:JPY": 150 };
const ORDERS: Record<string, { status: string; etaDays: number }> = {
  "A-100": { status: "shipped", etaDays: 2 },
  "A-200": { status: "processing", etaDays: 5 },
};

/** Deterministic, side-effect-free tools so agent runs are reproducible. */
export const agentTools = {
  getWeather: tool({
    description: "Get current weather for a city.",
    inputSchema: z.object({ city: z.string() }),
    execute: async ({ city }) => WEATHER[city.toLowerCase()] ?? { error: "unknown city" },
  }),
  convertCurrency: tool({
    description: "Convert an amount between currencies.",
    inputSchema: z.object({ amount: z.number(), from: z.string(), to: z.string() }),
    execute: async ({ amount, from, to }) => {
      const rate = RATES[`${from}:${to}`];
      return rate ? { converted: Math.round(amount * rate * 100) / 100 } : { error: "unsupported pair" };
    },
  }),
  lookupOrder: tool({
    description: "Look up an order by id.",
    inputSchema: z.object({ orderId: z.string() }),
    execute: async ({ orderId }) => ORDERS[orderId] ?? { error: "order not found" },
  }),
};

export interface AgentResult {
  text: string;
  toolCalls: { name: string; args: Record<string, unknown> }[];
}

export async function runAgent(model: LanguageModel, input: { task: string }): Promise<AgentResult> {
  const result = await generateText({
    model,
    temperature: 0,
    tools: agentTools,
    stopWhen: stepCountIs(5),
    system: "You are a helpful assistant. Use tools when they help; never invent tool results.",
    prompt: input.task,
  });
  const toolCalls = result.steps.flatMap((s) =>
    s.toolCalls.map((c) => ({ name: c.toolName, args: c.input as Record<string, unknown> })),
  );
  return { text: result.text.trim(), toolCalls };
}
