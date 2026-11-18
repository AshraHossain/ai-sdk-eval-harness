# Graph Report - ai-sdk-eval-harness  (2026-11-18)

## Corpus Check
- 83 files · ~40,038 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 471 nodes · 1000 edges · 21 communities (14 shown, 6 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 2 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `f0696b4b`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- index.ts
- vitest
- runner/types.ts
- gate.ts
- execute.ts
- PLANNING.md — ai-sdk-eval-harness
- http.ts
- compilerOptions
- package.json
- manifest.json
- scripts
- devDependencies
- judge.ts
- Changelog
- next.config.mjs
- api-edge.md
- evals.md
- system-under-test.md
- add-eval-suite/SKILL.md
- rebaseline/SKILL.md

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
- `GET` --calls--> `loadThresholds()`  [EXTRACTED]
  app/api/readyz/route.ts → evals/runner/load.ts
- `authorizeLive()` --calls--> `presentedToken()`  [EXTRACTED]
  app/api/eval/route.ts → src/lib/security/http.ts
- `authorizeLive()` --calls--> `tokenMatches()`  [EXTRACTED]
  app/api/eval/route.ts → src/lib/security/http.ts
- `POST` --calls--> `writeReport()`  [EXTRACTED]
  app/api/eval/route.ts → evals/runner/execute.ts
- `POST` --calls--> `resolveMode()`  [EXTRACTED]
  app/api/eval/route.ts → evals/models.ts

## Import Cycles
- None detected.

## Communities (21 total, 6 thin omitted)

### Community 0 - "index.ts"
Cohesion: 0.06
Nodes (59): isInfraError(), EvalCase, argsMatch(), contains(), countWords(), exactMatch(), lengthBudget(), matchesRegex() (+51 more)

### Community 1 - "vitest"
Cohesion: 0.25
Nodes (8): applyFault(), MOCK_FAULTS, MockFault, mockFaultNames, Obj, vitest, GateRunner, selfTest()

### Community 2 - "runner/types.ts"
Cohesion: 0.13
Nodes (28): errorText(), flakyScorers(), runOnce(), runSuite(), worker(), RunSuiteOptions, summarizeCase(), classifyStability() (+20 more)

### Community 3 - "gate.ts"
Cohesion: 0.08
Nodes (44): Dashboard(), dynamic, runCli(), readReports(), REPORTS_DIR, SCORECARD_FILE, writeReport(), Baseline (+36 more)

### Community 4 - "execute.ts"
Cohesion: 0.08
Nodes (49): authorizeLive(), body, dynamic, error(), maxDuration, parseBody(), POST, runtime (+41 more)

### Community 5 - "PLANNING.md — ai-sdk-eval-harness"
Cohesion: 0.06
Nodes (33): AGENTS.md — ai-sdk-eval-harness, Commands (all verified offline, no API keys), Conventions, Invariants, Layout, What this is, Architecture, Design rules (+25 more)

### Community 6 - "http.ts"
Cohesion: 0.09
Nodes (33): dynamic, GET, dynamic, GET, config, finish(), limitAnonymous, limitAuthenticated (+25 more)

### Community 7 - "compilerOptions"
Cohesion: 0.10
Nodes (19): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+11 more)

### Community 8 - "package.json"
Cohesion: 0.04
Nodes (39): metadata, RunButton(), dependencies, ai, @ai-sdk/anthropic, @ai-sdk/google-vertex, @ai-sdk/openai, next (+31 more)

### Community 9 - "manifest.json"
Cohesion: 0.12
Nodes (15): agent, file, version, classify, file, version, extract, file (+7 more)

### Community 10 - "scripts"
Cohesion: 0.13
Nodes (15): scripts, build, dev, e2e, eval, eval:baseline, eval:calibrate, eval:gate (+7 more)

### Community 11 - "devDependencies"
Cohesion: 0.15
Nodes (13): devDependencies, eslint, @eslint/js, eslint-plugin-security, @playwright/test, tsx, @types/node, @types/react (+5 more)

### Community 12 - "judge.ts"
Cohesion: 0.25
Nodes (8): buildJudgePrompt(), escapeTags(), JUDGE_SECTIONS, JudgeInput, JudgeOptions, judgeSchema, llmJudge(), opts

### Community 13 - "Changelog"
Cohesion: 0.22
Nodes (8): [0.1.0], [0.2.0] - 2026-11-18, Added, Added, Changed, Changelog, Fixed, [Unreleased]

## Knowledge Gaps
- **186 isolated node(s):** `runtime`, `dynamic`, `maxDuration`, `body`, `dynamic` (+181 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 210 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **6 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `vitest` connect `vitest` to `index.ts`, `runner/types.ts`, `gate.ts`, `execute.ts`, `http.ts`, `package.json`, `judge.ts`?**
  _High betweenness centrality (0.131) - this node is a cross-community bridge._
- **Why does `zod` connect `index.ts` to `runner/types.ts`, `gate.ts`, `execute.ts`, `package.json`, `judge.ts`?**
  _High betweenness centrality (0.114) - this node is a cross-community bridge._
- **Why does `ai` connect `index.ts` to `package.json`, `runner/types.ts`, `execute.ts`, `judge.ts`?**
  _High betweenness centrality (0.048) - this node is a cross-community bridge._
- **What connects `runtime`, `dynamic`, `maxDuration` to the rest of the system?**
  _186 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `index.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.06220095693779904 - nodes in this community are weakly interconnected._
- **Should `runner/types.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.12912912912912913 - nodes in this community are weakly interconnected._
- **Should `gate.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.08166969147005444 - nodes in this community are weakly interconnected._