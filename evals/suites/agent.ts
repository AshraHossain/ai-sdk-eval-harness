import { z } from 'zod';
import { runAgent } from '../../src/lib/features/agent';
import { containsAll, toolCallsMatch } from '../scorers/deterministic';
import type { ScoreResult } from '../scorers/types';
import { defineSuite } from './types';

const caseSchema = z.object({
  id: z.string(),
  tags: z.array(z.string()).optional(),
  input: z.object({ question: z.string().min(1) }),
  expected: z.object({
    toolCalls: z.array(z.object({ toolName: z.string(), inputIncludes: z.record(z.string(), z.unknown()).optional() })),
    mustInclude: z.array(z.string()),
    maxSteps: z.number().int().positive(),
  }),
});

export const agentSuite = defineSuite({
  name: 'agent',
  description: 'Multi-step tool-calling agent. Trajectory checks (right tool, right args), step budget, and final-answer content.',
  dataset: 'agent.jsonl',
  caseSchema,
  run: (input, { subject }) => runAgent(subject, input.question),
  score: async (c, output) => {
    const steps: ScoreResult = {
      name: 'step_budget',
      kind: 'deterministic',
      score: output.steps <= c.expected.maxSteps ? 1 : c.expected.maxSteps / output.steps,
      pass: output.steps <= c.expected.maxSteps,
      detail: output.steps <= c.expected.maxSteps ? undefined : `${output.steps} steps > ${c.expected.maxSteps}`,
    };
    const invalid: ScoreResult = {
      name: 'valid_tool_calls',
      kind: 'deterministic',
      score: output.invalidToolCalls === 0 ? 1 : 0,
      pass: output.invalidToolCalls === 0,
      detail: output.invalidToolCalls ? `${output.invalidToolCalls} invalid tool call(s)` : undefined,
    };
    return [
      toolCallsMatch('tool_trajectory', output.toolCalls, c.expected.toolCalls),
      invalid,
      steps,
      containsAll('final_answer', output.text, c.expected.mustInclude),
    ];
  },
});
