<!-- Keep this short. The diff shows what changed; this says why, and how you know it works. -->

## What and why

<!-- One or two sentences. Link the PLANNING.md backlog item when there is one. -->

Backlog item:

## How it was verified

- [ ] `make check` green (lint, typecheck, per-file 95% coverage, gate self-test, offline eval gate, README scorecard drift)
- [ ] `npm run e2e` green, or not affected
- [ ] Live run needed? If yes, say which model, suites and N, and link the run.

## Risk and review notes

<!-- What a reviewer should look at hardest. Delete the lines that do not apply. -->

- [ ] Decisions (thresholds, pass/fail, scoring) stayed in code, not in prompts or model output
- [ ] Dataset cases changed → version bumped in `evals/datasets/manifest.json` and baseline re-recorded
- [ ] Prompts changed → `promptHash` moves, so baseline regression checks skip until re-recorded
- [ ] Seeded flaky/failing cases (`summarize/s05`, `extract/e04`, `rag/r06`, `classify/c06`) still asserted in unit and e2e tests
- [ ] Docs that state numbers or commands updated (`README.md`, `PLANNING.md`, `AGENTS.md`, `CHANGELOG.md`)
