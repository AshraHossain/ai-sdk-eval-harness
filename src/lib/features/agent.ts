import { generateText, isStepCount, tool, type LanguageModel } from 'ai';
import { z } from 'zod';

/** Fixture backends so agent evals are reproducible. */
export const WEATHER: Record<string, { tempF: number; condition: string }> = {
  denver: { tempF: 58, condition: 'sunny' },
  seattle: { tempF: 52, condition: 'rain' },
  miami: { tempF: 84, condition: 'humid' },
};

export const ORDERS: Record<string, { status: string; eta: string }> = {
  'A-1001': { status: 'shipped', eta: '2026-10-18' },
  'A-1002': { status: 'processing', eta: '2026-10-22' },
  'A-1003': { status: 'delivered', eta: '2026-10-10' },
};

/**
 * Safe arithmetic: digits, operators, parentheses, dots and spaces only, so no
 * identifiers can reach Function(). Leading zeros are stripped ("08" → "8"),
 * which strict mode would otherwise reject, and input length is capped.
 */
export function evaluateExpression(expression: string): number {
  if (expression.length > 200) throw new Error('Expression too long (max 200 characters)');
  if (!/^[\d+\-*/().\s]+$/.test(expression)) throw new Error(`Unsupported expression: ${expression}`);
  const normalized = expression.replace(/(?<![\d.])0+(?=\d)/g, '');
  const value = Function(`"use strict"; return (${normalized});`)() as unknown;
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`Non-finite result for ${expression}`);
  return Math.round(value * 1e6) / 1e6;
}

export const agentTools = {
  calculator: tool({
    description: 'Evaluate an arithmetic expression, e.g. "(12 + 3) * 4".',
    inputSchema: z.object({ expression: z.string() }),
    execute: async ({ expression }) => ({ result: evaluateExpression(expression) }),
  }),
  getWeather: tool({
    description: 'Get the current weather for a city.',
    inputSchema: z.object({ city: z.string() }),
    execute: async ({ city }) => WEATHER[city.toLowerCase()] ?? { error: `No weather data for ${city}` },
  }),
  lookupOrder: tool({
    description: 'Look up an order by id, e.g. "A-1001".',
    inputSchema: z.object({ orderId: z.string() }),
    execute: async ({ orderId }) => ORDERS[orderId.toUpperCase()] ?? { error: `Order ${orderId} not found` },
  }),
};

export const AGENT_INSTRUCTIONS = `Task: agent
You are a support assistant. Use the tools for any arithmetic, weather or order question.
Never guess values a tool can provide. Answer in one or two sentences.`;

export interface AgentRun {
  text: string;
  /** Valid tool calls, in order. */
  toolCalls: Array<{ toolName: string; input: unknown }>;
  /** Calls the SDK rejected (unknown tool or input failing the schema). */
  invalidToolCalls: number;
  steps: number;
}

export async function runAgent(model: LanguageModel, question: string): Promise<AgentRun> {
  const result = await generateText({
    model,
    instructions: AGENT_INSTRUCTIONS,
    prompt: question,
    tools: agentTools,
    stopWhen: isStepCount(5),
    temperature: 0,
  });
  const calls = result.steps.flatMap((s) => s.toolCalls);
  return {
    text: result.text.trim(),
    toolCalls: calls.filter((c) => !c.invalid).map((c) => ({ toolName: c.toolName, input: c.input })),
    invalidToolCalls: calls.filter((c) => c.invalid).length,
    steps: result.steps.length,
  };
}
