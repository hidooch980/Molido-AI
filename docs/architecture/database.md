# Database

PostgreSQL 16, accessed exclusively through Prisma in `packages/database`. No
other package imports `@prisma/client` directly, so replacing or upgrading the
ORM stays a change inside one package.

## Rules applied throughout

- UUID primary keys — no guessable sequential identifiers.
- `createdAt` / `updatedAt` on every mutable entity.
- Explicit delete behaviour on every foreign key; nothing is left implicit.
- An index on every column the application actually filters or sorts by.
- Column widths bounded, and DTO validation bounded to match, so oversized input
  is a validation error rather than a truncation surprise.

## Entities

```
User ──< UserRole >── Role ──< RolePermission >── Permission
 │
 ├──< Session          refresh-token rotation, family-based reuse detection
 ├──< AuditLog         who did what (append-only)
 ├──< SecurityEvent    what security should know about
 └──< AiTask >── AiAgent

SystemEvent            operational events, no actor
```

### User
`email` (unique, normalised lower-case), `passwordHash`, `status`
(`ACTIVE`/`SUSPENDED`/`DISABLED`), `emailVerifiedAt`, `lastLoginAt`,
`failedLoginCount`, `lockedUntil`.

Email is stored normalised so `Founder@Molido.ai` and `founder@molido.ai` cannot
become two accounts. Local-part aliasing (dots, `+tags`) is deliberately left
alone — stripping it is provider-specific and silently merges addresses their
owners consider distinct.

### Role / Permission / RolePermission
Permissions are rows keyed by a stable code (`AI_TASK_CREATE`), each with a
description. Modelling them as entities rather than a string array on the role
means a grant can be audited and revoked individually, and `RolePermission`
carries its own `grantedAt` / `grantedBy`.

### Session
One row per refresh token. `refreshTokenHash` is a SHA-256 digest with a unique
constraint; the plaintext token exists only in the response that issued it.

`familyId` groups every session descended from one login. `replacedById` links a
rotated session to its successor, so an investigator can walk the chain after a
reuse incident. `revokedAt` + `revokedReason` record how a session ended.

### AuditLog
`actorType`, `actorId`, `actorUserId` (FK, `SET NULL`), `action`, `resource`,
`resourceId`, `outcome`, `requestId`, redacted `metadata`.

`actorId` is separate from `actorUserId` so the relation stays valid for agent
and service actors that are not user rows.

### SecurityEvent
`type` (13 values from `LOGIN_SUCCESS` to `SUSPICIOUS_ACTIVITY`), `severity`,
optional `userId` (`SET NULL` — an attack on a non-existent account has no
actor), `ipAddress`, `requestId`, redacted `metadata`.

### AiAgent
`key`, `name`, `description`, `type`, `status`
(`ACTIVE`/`PAUSED`/`DISABLED`/`MAINTENANCE`), `permissions[]`, `configuration`
(non-secret settings only), `maxTokensPerTask`, `maxTasksPerHour`,
`requiresApproval`.

Budgets live in the database so the Founder can tighten them at runtime.

### AiTask
`goal`, `input`, `output`, `status` (`PENDING`/`RUNNING`/`COMPLETED`/`FAILED`/
`CANCELLED`), `error` (redacted, user-safe), `attempts`, `maxAttempts`,
`tokensUsed`, `startedAt`, `completedAt`.

The task row is written **before** the agent runs, so a crash mid-execution
leaves a trace rather than a silent disappearance.

## Migration policy

Migrations are versioned SQL under `packages/database/prisma/migrations`, applied
with `prisma migrate deploy`.

**`prisma migrate reset` is never run against a database holding real data.**
When a schema change implies data loss, the migration is generated explicitly
with `prisma migrate diff`, reviewed, annotated with what is being dropped and
why, and only then applied. The second migration in this repository carries such
a note: four columns were dropped, all superseded by new structures, and every
affected table was verified empty first.

```bash
pnpm db:generate   # regenerate the client
pnpm db:migrate    # create a migration (development)
pnpm db:deploy     # apply migrations (CI, production)
pnpm db:seed       # roles, permissions, agent registry — never fake users
pnpm db:studio     # browse
```

## Seeding

The seed creates roles, permissions and the agent registry. It creates **no
users** unless `FOUNDER_EMAIL` and `FOUNDER_PASSWORD` are supplied, and it never
overwrites an existing password on a re-run.

Role grants are *reconciled*: a permission removed from the defaults in code is
revoked in the database on the next seed.
