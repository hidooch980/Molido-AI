# Architecture overview

## The shape of the system

```
                    ┌─────────────────┐
                    │  apps/web       │  Next.js · App Router
                    │  (browser)      │  Public status, goal input
                    └────────┬────────┘
                             │ HTTPS · JSON
                    ┌────────▼────────┐
                    │  apps/api       │  NestJS on Fastify
                    │  /api/v1        │
                    └────────┬────────┘
              ┌──────────────┼──────────────┐
              │              │              │
     ┌────────▼──────┐ ┌─────▼──────┐ ┌─────▼─────────┐
     │  PostgreSQL   │ │   Redis    │ │ packages/     │
     │  via Prisma   │ │  BullMQ    │ │ ai-core       │
     └───────────────┘ └────────────┘ └─────┬─────────┘
                                            │
                              ┌─────────────▼─────────────┐
                              │  AIProvider (interface)   │
                              ├───────────────────────────┤
                              │ Null · Ollama · OpenAI-   │
                              │ compatible · future       │
                              └───────────────────────────┘
```

## Why it is arranged this way

**The API is the only thing that enforces anything.** The web client hides
buttons a user cannot use; that is a courtesy, not a control. Every
authentication and authorisation decision is made server-side, against
permissions read from the database.

**AI is behind an interface, not a dependency.** Nothing above
`packages/ai-core` knows which vendor — or whether the model runs on the
developer's own laptop. Adding a provider is an adapter plus a line in a
factory. That is what stops the platform being captured by one supplier, and it
is what makes the zero-cost policy achievable rather than aspirational.

**Nothing is shared implicitly.** Configuration, security primitives, logging
and database access are each one package with one job. A service that wants to
hash a password imports `@molido/security`; there is no second implementation
to drift.

## The packages

| Package | Responsibility | Depends on |
| --- | --- | --- |
| `@molido/types` | Shared vocabulary: enums, permissions, transport contracts | *(nothing)* |
| `@molido/security` | Password hashing, opaque tokens, redaction, email normalisation | types |
| `@molido/config` | Zod-validated environment → typed `AppConfig` | types |
| `@molido/logger` | Structured logging with redaction built in | security, types |
| `@molido/database` | Prisma schema, client, health probe | security, types |
| `@molido/ai-core` | `AIProvider` interface and its adapters | types |

`@molido/types` has no runtime dependencies by design: importing it must never
drag Prisma or Nest into a browser bundle.

## Request lifecycle

```
Request
  → Fastify onRequest hook   assign correlation id (before anything can reject)
  → Helmet                   security headers
  → CORS                     explicit origin allow-list
  → MolidoThrottlerGuard     rate limit; records a security event on a trip
  → JwtAuthGuard             verify token, session still active, account ACTIVE
  → PermissionsGuard         required permissions held, or 403 + security event
  → ValidationPipe           whitelist + reject unknown properties
  → Controller → Service
  → AllExceptionsFilter      structured error, correlation id, no internals
```

The order is deliberate: an unauthenticated flood is rejected before it costs a
database round trip, and authorisation cannot run before identity is known.

## How an AI task actually flows

```
POST /api/v1/ai/tasks
      │  validate → authorise → system mode → agent eligible → budget
      ▼
  AiTask row (PENDING)          written *before* any work happens
      │
      ▼
  BullMQ `ai-tasks` queue        jobId = taskId, so a retry cannot double-queue
      │
      ▼
  workers/ai-worker              re-reads the row; a queued message is a
      │                          snapshot, never current truth
      ▼
  ResearchAgent (@molido/ai-core)   same implementation the API would have used
      │
      ▼
  AIProvider → Zod validation → AiTask (COMPLETED | FAILED) → AuditLog
```

The API never executes an agent. That keeps a slow model from holding an HTTP
request open, and means a restart loses no queued work.

## What is not built yet

Named here so the diagram is not mistaken for a promise:

- Streaming AI responses (the interface exists; adapters yield one chunk).
- Any mobile application — there is no Flutter code in this repository.
- Anything to do with tokens, wallets, nodes or a chain. See
  [product/mvp.md](../product/mvp.md).
