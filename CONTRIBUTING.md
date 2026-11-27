# Contributing

Read [PLANNING.md](PLANNING.md) for scope and the backlog, then [AGENTS.md](AGENTS.md) for the
verified commands, the module layout and the invariants. This file covers the mechanics.

## Setup

```bash
npm ci          # Node >= 20.9 (see "engines" in package.json)
make check      # the pre-push bar; runs offline, no API keys
```

`make check` = lint (0 warnings, includes `eslint-plugin-security`) → typecheck → Vitest with the
per-file 95% coverage gate → gate self-test → offline eval gate → README scorecard drift check.

## The rules that matter most

1. **Decisions live in code.** Thresholds, pass/fail logic, flake budgets and scorecard metrics
   belong in `evals/scorers`, `evals/runner` and `evals/thresholds.json`. Never in a prompt, and
   never read back out of model output.
2. **Offline is the default and must stay deterministic.** CI never needs a secret. Mock mode
   replays `evals/fixtures/<suite>.json`; run *i* uses entry `i mod len`.
3. **Never assert exact live-model output** in a test.
4. **`src/lib/ai/` is the system under test.** Pure `(model, input) => result`. No provider imports,
   no `process.env`, no I/O. Untrusted text reaches a model only through `frameUntrusted()`.
5. **Contracts are `readonly`.** Build new objects; never mutate a report.

## Common changes

| Change | Do this |
|---|---|
| New feature + suite | Follow `.claude/skills/add-eval-suite/SKILL.md` |
| Edited a dataset's cases | Bump its version in `evals/datasets/manifest.json`, then re-record the baseline |
| Edited a prompt in `src/lib/ai/` | Keep the text in that feature's `*_PROMPT` constant so `promptHash` moves; re-record the baseline |
| Re-record a baseline | Follow `.claude/skills/rebaseline/SKILL.md` (`npm run eval:baseline`, own commit) |
| A case is genuinely noisy | Quarantine it in `evals/thresholds.json` with a reason. Never edit data or fixtures to make the gate pass |
| Scorecard numbers moved | `npm run eval:gate && npm run readme:scorecard` and commit `README.md` |

## Pull requests

- Conventional commits: `feat|fix|test|refactor|docs|chore(scope): ...`.
- One concern per PR. Keep a baseline re-record in its own commit so the diff stays readable.
- Fill in the PR template, including how you verified the change.
- Live runs spend tokens. They are `workflow_dispatch` only; say in the PR which model, suites and
  N you used and link the run.
- Do not claim production readiness, in code, docs or a PR description.

## Releasing

1. Move the `[Unreleased]` entries in `CHANGELOG.md` under a new `## [x.y.z] - YYYY-MM-DD`.
2. Bump `version` in `package.json` to match.
3. Merge, then tag the merge commit `vx.y.z` and push the tag. The release workflow refuses a tag
   that disagrees with `package.json` or has no CHANGELOG section, then publishes the release with
   those notes and the image SBOM attached.

## Recording a decision

If a choice is non-obvious, was reversed, or cost a live run to establish, add a record under
[`docs/adr/`](docs/adr/README.md) and link it from the index. Context, decision, consequences —
including the bad ones.

## Reporting a vulnerability

See [SECURITY.md](SECURITY.md). Do not open a public issue for a security problem.
