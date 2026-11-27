# ADR-0003: Enforce coverage per file, not as a project average

**Status:** Accepted

## Context
A single project-wide coverage threshold is satisfiable while individual files are untested: a
large, well-tested module raises the average enough to hide a new file with no tests at all. In a
harness whose whole claim is that it detects regressions, an untested scorer or gate branch is
exactly the thing that must not slip through.

The gate's own logic is the sharpest case. `evals/scorers` and `evals/runner` decide pass or fail;
a wrong comparison there silently changes every number the project reports.

## Decision
Set `thresholds: { perFile: true, lines: 95, statements: 95, functions: 95, branches: 95 }` in
`vitest.config.ts`, over `src/**`, `evals/**`, `app/api/**`, `middleware.ts` and `scripts/**`. Every
file clears the bar on its own or `make check` fails. Process entry points (`isMain` blocks) carry
`/* v8 ignore */` and the logic they call lives in exported functions (`runCli`, `runCalibration`,
`selfTest`, `syncReadme`) that tests drive directly.

## Consequences
* + Branch coverage is 100% in every file, so the fallbacks (`?? 0`, `?? null`, missing baseline,
  non-Error throws) are all exercised rather than assumed.
* + It catches omissions during development: adding the token-metering fallbacks dropped
  `scorecard.ts` branch coverage to 93.5% and the gate failed until the case was covered.
* − Coverage still only proves a line ran, not that a wrong operator would be caught. That is what
  backlog item 22 (mutation testing on the scorers and runner) is for.
* − `v8 ignore` on entry points is a deliberate hole. It is narrow by convention: the block may
  only parse arguments and call an exported, tested function.
