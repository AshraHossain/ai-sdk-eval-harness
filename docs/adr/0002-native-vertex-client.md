# ADR-0002: Use the native Vertex client, not Vertex's OpenAI-compatible endpoint

**Status:** Accepted

## Context
Every other non-first-party provider in this harness (`bynara`, `openrouter`, `nim`) is reached
with one OpenAI-compatible client, which keeps `evals/models.ts` small. Vertex also publishes an
OpenAI-compatible endpoint, so the cheap move was to route Gemini through the same client.

Measured instead: on a live run of the `agent` suite, 5 of 6 cases failed with HTTP 400
`INVALID_ARGUMENT`. Gemini 3 tool calls carry a `thought_signature` that must be echoed back on the
next step of the loop. The OpenAI-compatible client has nowhere to put that field, so it drops it,
and the second step of every multi-step agent run is rejected. Single-shot suites were unaffected,
which is why the problem only showed up in tool calling.

## Decision
Add a distinct `vertex:` provider backed by `@ai-sdk/google-vertex`, which models the field
natively. Credentials come from Application Default Credentials plus `GOOGLE_CLOUD_PROJECT`, not
from an API-key env var like the other providers, so `KEY_ENV` maps `vertex` to the project
variable and `assertLiveKeys` checks that instead.

## Consequences
* + Tool calling works on Gemini, so the `agent` suite measures the model rather than a transport
  defect.
* + The failure is recorded in the README's live-run notes, so the next person does not re-derive it.
* − A second client and a second credential style to maintain; `resolveModel` now has a provider
  that is not OpenAI-compatible.
* − `vertex:` cannot run in Actions until Workload Identity Federation is configured (backlog
  item 8), because ADC is not available to the workflow.
