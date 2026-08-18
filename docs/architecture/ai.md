# AI architecture

## The boundary

```
AiController
     │  permission: AI_TASK_CREATE
AiOrchestrator
     │  validate → authorise → select agent → budget → record task
ResearchAgent
     │  receives: AIProvider + AgentContext.  Nothing else.
AIProvider  (interface)
     ├── NullProvider            no provider configured
     ├── OllamaProvider          local, free, no account
     └── OpenAICompatibleProvider  any OpenAI-shaped endpoint
```

Nothing above `packages/ai-core` knows which provider is in use. Adding a vendor
is an adapter plus a case in `createAIProvider` — no change anywhere else.

## The null provider is a real implementation

It is not a stub that returns plausible text. Every generation method fails with
`AI_PROVIDER_NOT_CONFIGURED`, and `healthCheck` reports `not_configured` rather
than pretending to be healthy.

This is what lets MOLIDO boot, serve and tell the truth on its status page with
no AI backend at all — and it guarantees that a misconfigured deployment
produces a clear error instead of a plausible hallucination.

Incomplete configuration (a provider named but no model) resolves to the null
provider rather than throwing: half-configured is a real deployment mistake, and
the platform should report it, not crash-loop.

## Orchestrator

Every step, in order:

1. **Permission** — `AI_TASK_CREATE`, checked here as well as at the route.
2. **Account state** — a suspended user keeps a valid token until it expires;
   that must not be enough to spend AI budget.
3. **Agent selection** — from the database registry.
4. **Agent eligibility** — a `PAUSED`, `DISABLED` or `MAINTENANCE` agent does not
   run.
5. **Budget** — the agent's `maxTasksPerHour`, counted over the trailing hour.
6. **Record the task** — *before* any work, so a crash leaves a trace.
7. **Execute**.
8. **Validate output** — against a Zod schema; a violation fails the task.
9. **Persist**.
10. **Audit** — success or failure, always.

Nothing calls an agent except the orchestrator, so there is no route around
these checks.

## Agent containment

```ts
interface Agent {
  execute(provider: AIProvider, context: AgentContext): Promise<AgentResult>;
}
```

An agent receives a provider and a context object, and returns data. It is handed
no database client, no filesystem, no shell, no HTTP client and no credentials.

The containment is structural: "the agent must not have unrestricted access" is
enforced by what it is *possible* to write, not by a rule someone has to
remember.

## ResearchAgent and fabrication

Three independent defences, because a prompt instruction alone is not a control:

1. **The prompt states the limits plainly** — no browsing, no file access, no
   invented citations, and label every finding `MODEL_KNOWLEDGE` or `ASSUMPTION`.
2. **The schema has no `sources` field.** A fabricated citation has nowhere to
   go. When real retrieval is added, the field and the capability arrive
   together.
3. **A post-validation check** rejects output where a claim marked as model
   knowledge reads like a citation (a URL, a DOI, "according to a study").

Output is validated with Zod. A fluent but malformed answer fails the task
rather than being persisted as a result.

## Usage tracking

Each call records provider, model, operation, token counts, latency and status.
The prompt itself is **not** stored — only its character count. Retaining user
prompts by default would turn a metrics table into a store of personal data.

Providers that report no usage get an estimate, so cost tracking degrades in
accuracy rather than disappearing.

## Errors

Codes, not message matching — a caller deciding whether to retry must not depend
on the wording of a vendor's error string. `retryable` is set by the adapter that
knows what the failure meant, so retry policy lives in one place.

Vendor error bodies are never propagated: they can echo the request, and with it
the prompt and sometimes the key. `toPublicJSON()` returns exactly three fields,
and the API key is a `#private` field so it cannot be serialised into a log line.
