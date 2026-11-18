---
name: rebaseline
description: Use after an intended change to fixtures, datasets, scorers or thresholds in ai-sdk-eval-harness, to re-record evals/baselines/<mode>.json safely.
---
# Re-record the eval baseline

1. Confirm the change is intended. If a dataset's cases changed, bump its version in
   `evals/datasets/manifest.json`.
2. Run `npm run eval:gate`. If it fails, fix the cause or quarantine a noisy case in
   `evals/thresholds.json`. Never edit data or fixtures to make the gate pass.
3. Run `npm run eval:baseline` (mock, N=5). It refuses (exit 2) when the gate fails. Use `--force`
   only with a written reason in the commit body.
4. Live baseline: `EVAL_MODE=live npx tsx evals/cli.ts --mode live --runs 3 --update-baseline`.
   This spends tokens, so get the user's approval first.
5. Run `make check`, then commit `evals/baselines/<mode>.json` on its own:
   `chore(evals): re-record <mode> baseline (<why>)`.
6. If seeded flaky or failing cases moved, update `tests/unit/mockSuites.test.ts` and
   `tests/e2e/dashboard.spec.ts` in the same commit.
