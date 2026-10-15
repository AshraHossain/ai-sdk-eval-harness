import { z } from "zod";
import { runAgent, type AgentResult } from "../../src/lib/ai/agent";
import { contains, lengthBudget, toolCallMatch } from "../scorers/deterministic";
import type { Suite } from "../runner/types";

export const agentCase = z.object({
  id: z.string(),
  task: z.string(),
  expectedCalls: z.array(z.object({ name: z.string(), args: z.record(z.string(), z.unknown()) })),
  ordered: z.boolean().default(false),
  answerContains: z.array(z.string()),
});
type Case = z.infer<typeof agentCase>;

export const agentSuite: Suite<Case, AgentResult> = {
  name: "agent",
  title: "Tool-calling agent",
  description: "Calls the right tools with the right arguments and reports their results.",
  caseSchema: agentCase,
  run: (model, c) => runAgent(model, { task: c.task }),
  async score({ case: c, output }) {
    return [
      toolCallMatch("tool-calls", output.toolCalls, c.expectedCalls, { ordered: c.ordered, exact: c.expectedCalls.length === 0 }),
      contains("answer", output.text, c.answerContains),
      lengthBudget("length", output.text, { maxWords: 80 }),
    ];
  },
};
