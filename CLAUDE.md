# CLAUDE.md — ai-sdk-eval-harness

Read [AGENTS.md](AGENTS.md) first: commands, layout and invariants live there.
Scoped rules load from `.claude/rules/` by path. Repo workflows: `/add-eval-suite`, `/rebaseline`.

## Planning
Plan non-trivial work with GSD (roadmap) → Superpowers (`brainstorming`, `writing-plans`) →
Ruflo (parallel execution), as set out in [PLANNING.md](PLANNING.md). Update its backlog when an
item ships or gets blocked. If a plugin is missing in the session, follow the same steps by hand.

## Repo specifics
- `make check` is the pre-push bar. It must be green, including the per-file 95% coverage gate.
- Providers: `anthropic:`, `openai:`, `bynara:`, `openrouter:`, `nim:` (the last three are
  OpenAI-compatible). `EVAL_MODEL` / `EVAL_JUDGE_MODEL` take `provider:model`.
- The seeded flaky cases (`summarize/s05`, `extract/e04`, `rag/r06`) and the failing case
  (`classify/c06`) are asserted in `tests/unit/mockSuites.test.ts` and `tests/e2e/dashboard.spec.ts`.
  Change them together.
- Process entry blocks (`isMain`) carry `v8 ignore`. Put logic in exported functions
  (`runCli`, `runCalibration`, `selfTest`) and test those.
- `API_AUTH_TOKEN` guards all of `/api/*` except the probes. The dashboard Run button sends no
  token, so it stops working when the variable is set. That is intended for headless deployments.
- The mock judge scores reference-word coverage. It is a plumbing check, not a quality oracle.
