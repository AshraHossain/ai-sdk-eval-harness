---
paths:
  - "src/lib/ai/**/*.ts"
---
# System under test (`src/lib/ai/`)
1. Each feature is a pure function `(model: LanguageModel, input) => Promise<result>`. No provider
   imports, no `process.env`, no I/O. The same code must run under a mock or a real model.
2. Use `temperature: 0`. Structured features validate output with a Zod schema via `generateObject`.
3. Any text that did not come from us (documents, tickets, invoices, tool output from outside)
   goes into the prompt only through `frameUntrusted(source, text)`, and the system prompt ends
   with `UNTRUSTED_NOTICE` (`src/lib/security/sanitize.ts`).
4. No thresholds, scores or pass/fail rules in prompts. Scoring lives in `evals/`.
5. Agent tools stay deterministic and side-effect free so agent runs replay from fixtures.
