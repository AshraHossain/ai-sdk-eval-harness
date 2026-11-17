---
name: add-eval-suite
description: Use when adding a new AI feature and its eval suite to ai-sdk-eval-harness (system under test, dataset, fixtures, threshold, fault, tests).
---
# Add an eval suite

1. **Feature**: add `src/lib/ai/<feature>.ts` as a pure `(model, input)` function (see the
   `system-under-test` rule). Frame untrusted input with `frameUntrusted()`.
2. **Suite**: add `evals/suites/<name>.ts` with a Zod `caseSchema`, `run` and `score`. Use the scorers
   in `evals/scorers/deterministic.ts` first; add `llmJudge` only for qualities code cannot check.
3. **Register** it in `evals/suites/index.ts` (`SUITES`).
4. **Data**: add `evals/datasets/<name>.jsonl` and a `manifest.json` entry (version `1`).
5. **Fixtures**: add `evals/fixtures/<name>.json` with at least one reply per case id. Seed one
   case with a mixed reply list if you want a flaky example.
6. **Threshold**: add a `suites.<name>` override in `evals/thresholds.json` only if the default is wrong.
7. **Fault**: add a realistic regression to `evals/mock/faults.ts` for this suite.
8. **Scorecard**: if the suite has a headline metric, add it in `evals/runner/scorecard.ts` with
   a test in `tests/unit/scorecard.test.ts`.
9. **Verify**: run `make check`. `tests/unit/datasets.test.ts` fails on missing fixtures, and
   `eval:selftest` fails if the new fault is not caught.
10. **Baseline**: run the `rebaseline` skill. Update the README suite table and scorecard.
