# Architecture decision records

One file per decision that a reviewer would otherwise have to reconstruct from the code. Format:
context (including what was measured or rejected), the decision, and the consequences, good and
bad. Add a record when a choice is non-obvious or was reversed; leave the routine ones out.

| # | Decision | Status |
|---|---|---|
| [0001](0001-mock-judge-is-a-plumbing-check.md) | The offline judge is a plumbing check, not a quality oracle | Accepted |
| [0002](0002-native-vertex-client.md) | Use the native Vertex client, not Vertex's OpenAI-compatible endpoint | Accepted |
| [0003](0003-per-file-coverage-gate.md) | Enforce coverage per file, not as a project average | Accepted |

Design overview: [ARCHITECTURE.md](../../ARCHITECTURE.md). Scope and backlog:
[PLANNING.md](../../PLANNING.md). Threat model: [SECURITY.md](../../SECURITY.md).
