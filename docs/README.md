# MOLIDO AI — documentation

> FROM ZERO. FOR THE FUTURE.

| Document | What it covers |
| --- | --- |
| [architecture/overview.md](./architecture/overview.md) | How the pieces fit together, and why |
| [architecture/backend.md](./architecture/backend.md) | The API: modules, request lifecycle, guards |
| [architecture/frontend.md](./architecture/frontend.md) | The web application |
| [architecture/database.md](./architecture/database.md) | Entities, relationships, migration policy |
| [architecture/ai.md](./architecture/ai.md) | Provider abstraction, orchestrator, agents |
| [security/security-model.md](./security/security-model.md) | The controls, and what each one defends |
| [security/threat-model.md](./security/threat-model.md) | What we are defending against, and what we are not |
| [api/openapi.md](./api/openapi.md) | Endpoint reference |
| [product/mvp.md](./product/mvp.md) | Scope: what is in, what is deliberately out |

## A note on scope

This documentation describes the MVP monorepo (`apps/`, `packages/`, `workers/`).
The `backend/`, `web/` and `legacy/` directories at the repository root belong to
an earlier Molido product and are untouched by this work.
