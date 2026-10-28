import { MockLanguageModelV4 } from 'ai/test';

/** One generated content part, in the provider (V4) content format. */
export type MockContent =
  | { type: 'text'; text: string }
  | { type: 'tool-call'; toolCallId: string; toolName: string; input: string };

export interface MockRequest {
  /** System / instructions text, joined. */
  instructions: string;
  /** All user text in the prompt, joined. */
  userText: string;
  /** Tool results already present in the prompt (agent loops). */
  toolResults: Array<{ toolName: string; output: unknown }>;
  /** Names of tools offered on this call. */
  toolNames: string[];
  /** Whether the caller asked for a JSON response format. */
  wantsJson: boolean;
  /** 0-based count of calls this model instance has served. */
  callIndex: number;
}

export type MockResponder = (req: MockRequest) => MockContent[];

const usage = {
  inputTokens: { total: 0, noCache: 0, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 0, text: 0, reasoning: undefined },
};

type PromptMessage = { role: string; content: unknown };

function textOf(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((p: { type?: string; text?: string }) => (p?.type === 'text' ? (p.text ?? '') : ''))
    .join('\n');
}

export function parseRequest(
  prompt: PromptMessage[],
  tools: Array<{ name: string }> | undefined,
  responseFormat: { type: string } | undefined,
  callIndex: number,
): MockRequest {
  const instructions = prompt.filter((m) => m.role === 'system').map((m) => textOf(m.content)).join('\n');
  const userText = prompt.filter((m) => m.role === 'user').map((m) => textOf(m.content)).join('\n');
  const toolResults: MockRequest['toolResults'] = [];
  for (const m of prompt) {
    if (m.role !== 'tool' || !Array.isArray(m.content)) continue;
    for (const part of m.content as Array<{ type: string; toolName: string; output: { value?: unknown } }>) {
      if (part.type === 'tool-result') toolResults.push({ toolName: part.toolName, output: part.output?.value ?? part.output });
    }
  }
  return {
    instructions,
    userText,
    toolResults,
    toolNames: (tools ?? []).map((t) => t.name),
    wantsJson: responseFormat?.type === 'json',
    callIndex,
  };
}

/**
 * A deterministic stand-in for a real LLM. The responder decides what the
 * "model" says given the parsed request, so evals run offline and repeatably.
 */
export function createMockModel(modelId: string, responder: MockResponder) {
  let calls = 0;
  return new MockLanguageModelV4({
    provider: 'mock',
    modelId,
    doGenerate: async (options) => {
      const req = parseRequest(
        options.prompt as PromptMessage[],
        options.tools as Array<{ name: string }> | undefined,
        options.responseFormat as { type: string } | undefined,
        calls++,
      );
      const content = responder(req);
      const hasToolCall = content.some((c) => c.type === 'tool-call');
      return {
        content,
        finishReason: { unified: hasToolCall ? 'tool-calls' : 'stop', raw: undefined },
        usage,
        warnings: [],
      };
    },
  });
}
