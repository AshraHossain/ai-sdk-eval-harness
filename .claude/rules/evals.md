---
paths:
  - "evals/**"
  - "scripts/**"
---
# Eval harness (`evals/`, `scripts/`)
1. `evals/` must not import from `app/`.
2. Pass/fail, thresholds, flake budgets, regression checks and scorecard metrics are code or
   `evals/thresholds.json`. Never move them into prompts or read them from model output.
3. Offline mode stays deterministic and key-free. `evals/fixtures/<suite>.json` maps case id to a
   list of replies; run *i* uses entry `i mod len`. `tests/unit/datasets.test.ts` checks coverage.
4. Changing a dataset's cases means bumping its version in `evals/datasets/manifest.json`.
5. Every suite has a fault in `evals/mock/faults.ts`, and `npm run eval:selftest` must pass.
6. Report and baseline paths use `safeId()`. Contracts in `runner/types.ts` are `readonly`:
   build new objects (spread), never mutate a report.
7. Quarantine noisy cases in `thresholds.json`, never by editing data or fixtures.
