# GEMINI.md — ai-sdk-eval-harness

Antigravity entrypoint. Read and follow [AGENTS.md](AGENTS.md) for what the project is, the
verified commands, the module layout and the invariants.

- Scoped rules: `.agents/rules/*.md` (symlink to `.claude/rules/`; each has a `paths:` filter).
- Repo workflows: `.agents/skills/*/SKILL.md` (symlink to `.claude/skills/`):
  `add-eval-suite`, `rebaseline`.
- Global protocol: the `gemini-core-workflow` plugin (Partnership Protocol, planning, release gates).
  This repo is TypeScript: apply its Python rules through the equivalents in AGENTS.md
  (Vitest coverage gate, eslint-plugin-security, `readonly` contracts, `EVAL_MODE=mock`).
- Relevant installed plugins: `vercel-plugin` (Next.js, AI SDK), `context7` (version-pinned docs),
  `arize-skills` (tracing and eval experiments).
- Planning: [PLANNING.md](PLANNING.md) (GSD roadmap → Superpowers plan → Ruflo execution; backlog).
- Security model: [SECURITY.md](SECURITY.md). Architecture: [ARCHITECTURE.md](ARCHITECTURE.md).
