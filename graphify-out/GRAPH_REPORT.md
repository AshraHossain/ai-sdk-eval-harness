# Graph Report - ai-sdk-eval-harness  (2026-11-17)

## Corpus Check
- 82 files · ~25,830 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 450 nodes · 968 edges · 25 communities (15 shown, 9 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 2 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `04e9b354`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- index.ts
- execute.ts
- runner/types.ts
- gate.ts
- calibrate.ts
- Security
- http.ts
- compilerOptions
- package.json
- manifest.json
- scripts
- devDependencies
- dependencies
- Changelog
- layout.tsx
- next.config.mjs
- @playwright/test
- overrides
- api-edge.md
- evals.md
- system-under-test.md
- add-eval-suite/SKILL.md
- rebaseline/SKILL.md
- engines

## God Nodes (most connected - your core abstractions)
1. `zod` - 19 edges
2. `vitest` - 18 edges
3. `compilerOptions` - 17 edges
4. `executeSuite()` - 16 edges
5. `scripts` - 15 edges
6. `createMockJudge()` - 14 edges
7. `ai` - 14 edges
8. `runCli()` - 13 edges
9. `evaluateGate()` - 13 edges
10. `Suite` - 13 edges

## Surprising Connections (you probably didn't know these)
- `authorizeLive()` --calls--> `presentedToken()`  [EXTRACTED]
  app/api/eval/route.ts → src/lib/security/http.ts
- `authorizeLive()` --calls--> `tokenMatches()`  [EXTRACTED]
  app/api/eval/route.ts → src/lib/security/http.ts
- `GET` --calls--> `loadThresholds()`  [EXTRACTED]
  app/api/readyz/route.ts → evals/runner/load.ts
- `POST` --calls--> `resolveMode()`  [EXTRACTED]
  app/api/eval/route.ts → evals/models.ts
- `POST` --calls--> `executeSuite()`  [EXTRACTED]
  app/api/eval/route.ts → evals/runner/execute.ts

## Import Cycles
- None detected.

## Communities (25 total, 9 thin omitted)

### Community 0 - "index.ts"
Cohesion: 0.06
Nodes (57): isInfraError(), EvalCase, argsMatch(), contains(), countWords(), exactMatch(), lengthBudget(), matchesRegex() (+49 more)

### Community 1 - "execute.ts"
Cohesion: 0.07
Nodes (44): authorizeLive(), body, dynamic, error(), maxDuration, parseBody(), POST, runtime (+36 more)

### Community 2 - "runner/types.ts"
Cohesion: 0.10
Nodes (34): flakyScorers(), runOnce(), runSuite(), worker(), RunSuiteOptions, summarizeCase(), buildScorecard(), fmt() (+26 more)

### Community 3 - "gate.ts"
Cohesion: 0.09
Nodes (36): dynamic, GET, Dashboard(), dynamic, RunButton(), readReports(), Baseline, baselineFrom() (+28 more)

### Community 4 - "calibrate.ts"
Cohesion: 0.09
Nodes (32): bootstrapKappaCI(), calibrate(), CalibrationItem, CalibrationResult, CalibrationRow, cohensKappa(), loadCalibrationSet(), MIN_KAPPA (+24 more)

### Community 5 - "Security"
Cohesion: 0.07
Nodes (25): AGENTS.md — ai-sdk-eval-harness, Commands (all verified offline, no API keys), Conventions, Invariants, Layout, What this is, Architecture, Design rules (+17 more)

### Community 6 - "http.ts"
Cohesion: 0.14
Nodes (23): dynamic, GET, config, finish(), limit, middleware(), API_SECURITY_HEADERS, clientKey() (+15 more)

### Community 7 - "compilerOptions"
Cohesion: 0.10
Nodes (19): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+11 more)

### Community 8 - "package.json"
Cohesion: 0.12
Nodes (16): description, name, private, type, version, eslint, @eslint/js, eslint-plugin-security (+8 more)

### Community 9 - "manifest.json"
Cohesion: 0.12
Nodes (15): agent, file, version, classify, file, version, extract, file (+7 more)

### Community 10 - "scripts"
Cohesion: 0.13
Nodes (15): scripts, build, dev, e2e, eval, eval:baseline, eval:calibrate, eval:gate (+7 more)

### Community 11 - "devDependencies"
Cohesion: 0.15
Nodes (13): devDependencies, eslint, @eslint/js, eslint-plugin-security, @playwright/test, tsx, @types/node, @types/react (+5 more)

### Community 12 - "dependencies"
Cohesion: 0.25
Nodes (8): dependencies, ai, @ai-sdk/anthropic, @ai-sdk/openai, next, react, react-dom, zod

### Community 13 - "Changelog"
Cohesion: 0.33
Nodes (5): [0.1.0], Added, Changed, Changelog, [Unreleased]

### Community 17 - "overrides"
Cohesion: 0.67
Nodes (3): postcss, overrides, next

## Knowledge Gaps
- **173 isolated node(s):** `runtime`, `dynamic`, `maxDuration`, `body`, `dynamic` (+168 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 197 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **9 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `vitest` connect `execute.ts` to `index.ts`, `runner/types.ts`, `gate.ts`, `calibrate.ts`, `http.ts`, `package.json`?**
  _High betweenness centrality (0.131) - this node is a cross-community bridge._
- **Why does `zod` connect `index.ts` to `execute.ts`, `runner/types.ts`, `gate.ts`, `calibrate.ts`, `package.json`?**
  _High betweenness centrality (0.121) - this node is a cross-community bridge._
- **Why does `ai` connect `index.ts` to `package.json`, `execute.ts`, `runner/types.ts`, `calibrate.ts`?**
  _High betweenness centrality (0.052) - this node is a cross-community bridge._
- **What connects `runtime`, `dynamic`, `maxDuration` to the rest of the system?**
  _173 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `index.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.06486486486486487 - nodes in this community are weakly interconnected._
- **Should `execute.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.07320024198427103 - nodes in this community are weakly interconnected._
- **Should `runner/types.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.09523809523809523 - nodes in this community are weakly interconnected._