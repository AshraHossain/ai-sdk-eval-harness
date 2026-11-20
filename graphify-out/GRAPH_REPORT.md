# Graph Report - ai-sdk-eval-harness  (2026-11-19)

## Corpus Check
- 85 files · ~41,774 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 481 nodes · 1046 edges · 20 communities (13 shown, 6 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 2 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `bb8a2bb3`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- deterministic.ts
- faults.ts
- runner/types.ts
- execute.ts
- calibrate.ts
- PLANNING.md — ai-sdk-eval-harness
- http.ts
- compilerOptions
- package.json
- manifest.json
- scripts
- devDependencies
- [0.2.0] - 2026-11-19
- next.config.mjs
- api-edge.md
- evals.md
- system-under-test.md
- add-eval-suite/SKILL.md
- rebaseline/SKILL.md

## God Nodes (most connected - your core abstractions)
1. `zod` - 20 edges
2. `vitest` - 20 edges
3. `compilerOptions` - 17 edges
4. `executeSuite()` - 16 edges
5. `createMockJudge()` - 15 edges
6. `scripts` - 15 edges
7. `ai` - 15 edges
8. `Suite` - 14 edges
9. `runCli()` - 13 edges
10. `evaluateGate()` - 13 edges

## Surprising Connections (you probably didn't know these)
- `POST` --calls--> `resolveMode()`  [EXTRACTED]
  app/api/eval/route.ts → evals/models.ts
- `POST` --calls--> `executeSuite()`  [EXTRACTED]
  app/api/eval/route.ts → evals/runner/execute.ts
- `POST` --calls--> `writeReport()`  [EXTRACTED]
  app/api/eval/route.ts → evals/runner/execute.ts
- `GET` --calls--> `loadThresholds()`  [EXTRACTED]
  app/api/readyz/route.ts → evals/runner/load.ts
- `writeReport()` --calls--> `safeId()`  [EXTRACTED]
  evals/runner/execute.ts → src/lib/security/sanitize.ts

## Import Cycles
- None detected.

## Communities (20 total, 6 thin omitted)

### Community 0 - "deterministic.ts"
Cohesion: 0.06
Nodes (56): Suite, argsMatch(), contains(), countWords(), exactMatch(), lengthBudget(), matchesRegex(), norm() (+48 more)

### Community 1 - "faults.ts"
Cohesion: 0.26
Nodes (7): MOCK_FAULTS, MockFault, mockFaultNames, Obj, Fixture, GateRunner, selfTest()

### Community 2 - "runner/types.ts"
Cohesion: 0.13
Nodes (29): errorText(), isInfraError(), flakyScorers(), runOnce(), runSuite(), worker(), RunSuiteOptions, summarizeCase() (+21 more)

### Community 3 - "execute.ts"
Cohesion: 0.06
Nodes (57): dynamic, GET, Dashboard(), dynamic, runCli(), applyFault(), EvalMode, resolveMode() (+49 more)

### Community 4 - "calibrate.ts"
Cohesion: 0.07
Nodes (46): bootstrapKappaCI(), calibrate(), CalibrationItem, CalibrationResult, CalibrationRow, cohensKappa(), loadCalibrationSet(), MIN_KAPPA (+38 more)

### Community 5 - "PLANNING.md — ai-sdk-eval-harness"
Cohesion: 0.05
Nodes (37): AGENTS.md — ai-sdk-eval-harness, Commands (all verified offline, no API keys), Conventions, Invariants, Layout, What this is, Architecture, Design rules (+29 more)

### Community 6 - "http.ts"
Cohesion: 0.08
Nodes (40): authorizeLive(), body, dynamic, error(), maxDuration, parseBody(), POST, runtime (+32 more)

### Community 7 - "compilerOptions"
Cohesion: 0.10
Nodes (19): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+11 more)

### Community 8 - "package.json"
Cohesion: 0.05
Nodes (36): metadata, RunButton(), dependencies, ai, @ai-sdk/anthropic, @ai-sdk/google-vertex, @ai-sdk/openai, next (+28 more)

### Community 9 - "manifest.json"
Cohesion: 0.12
Nodes (15): agent, file, version, classify, file, version, extract, file (+7 more)

### Community 10 - "scripts"
Cohesion: 0.13
Nodes (15): scripts, build, dev, e2e, eval, eval:baseline, eval:calibrate, eval:gate (+7 more)

### Community 11 - "devDependencies"
Cohesion: 0.15
Nodes (13): devDependencies, eslint, @eslint/js, eslint-plugin-security, @playwright/test, tsx, @types/node, @types/react (+5 more)

### Community 13 - "[0.2.0] - 2026-11-19"
Cohesion: 0.25
Nodes (7): [0.1.0], [0.2.0] - 2026-11-19, Added, Changed, Changelog, Fixed, [Unreleased]

## Knowledge Gaps
- **192 isolated node(s):** `runtime`, `dynamic`, `maxDuration`, `body`, `dynamic` (+187 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 218 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **6 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `vitest` connect `http.ts` to `deterministic.ts`, `faults.ts`, `runner/types.ts`, `execute.ts`, `calibrate.ts`, `package.json`?**
  _High betweenness centrality (0.132) - this node is a cross-community bridge._
- **Why does `zod` connect `deterministic.ts` to `runner/types.ts`, `execute.ts`, `calibrate.ts`, `http.ts`, `package.json`?**
  _High betweenness centrality (0.104) - this node is a cross-community bridge._
- **Why does `ai` connect `runner/types.ts` to `package.json`, `deterministic.ts`, `execute.ts`, `calibrate.ts`?**
  _High betweenness centrality (0.047) - this node is a cross-community bridge._
- **What connects `runtime`, `dynamic`, `maxDuration` to the rest of the system?**
  _192 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `deterministic.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.06479081821547575 - nodes in this community are weakly interconnected._
- **Should `runner/types.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.12802275960170698 - nodes in this community are weakly interconnected._
- **Should `execute.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.06460206460206461 - nodes in this community are weakly interconnected._