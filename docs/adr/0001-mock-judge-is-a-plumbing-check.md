# ADR-0001: The offline judge is a plumbing check, not a quality oracle

**Status:** Accepted

## Context
Two suites (`summarize`, `rag`) score with an LLM judge. CI must run offline, deterministically
and without secrets, so something has to stand in for that judge. Whatever stands in decides
whether those suites pass, so it is load-bearing for the gate.

Options considered:
* A real judge in CI. Needs a key, costs tokens per push, and is non-deterministic, so the gate
  would flake on model drift rather than on code changes.
* Recorded judge verdicts as fixtures. Deterministic, but they go stale silently: a changed rubric
  or prompt keeps replaying verdicts recorded against the old one.
* A small local model. Heavy in CI, and still not deterministic across versions.
* A deterministic heuristic.

## Decision
Use a deterministic heuristic (`createMockJudge` in `evals/mock/mockModel.ts`): it scores how much
of the reference answer's content words the output covers, maps that to 1–5, and returns it in the
judge's real output shape. Say plainly, everywhere the number appears, that it measures plumbing
and not quality. `npm run eval:calibrate` reports the heuristic's agreement with 20 human labels
(κ ≈ 0.38) and only fails the build for a *live* judge.

## Consequences
* + CI exercises the whole judge path — prompt construction, schema validation, score
  normalisation, pass threshold, flake detection — with no key and no drift.
* + The seeded flaky case `summarize/s05` moves because of this judge, so the flake detector is
  exercised on every run.
* − Coverage cannot see an invented fact, and cannot credit a correct abstention. Offline numbers
  therefore say nothing about model quality; only `EVAL_MODE=live` does.
* − The honesty depends on documentation, not on code. README, PLANNING, AGENTS, CLAUDE and the
  generated scorecard all repeat the caveat; a reviewer should treat its removal as a regression.
