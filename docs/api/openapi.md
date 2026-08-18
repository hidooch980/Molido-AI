# API reference

Base: `http://localhost:4000/api/v1`

Interactive OpenAPI (non-production only): `http://localhost:4000/api/docs`

Authentication is `Authorization: Bearer <accessToken>`. Every route requires it
unless marked **public**.

Every response carries `X-Request-Id`; every error body repeats it as
`requestId`. Quote it when reporting a problem — it maps to the exact server
log lines.

## Health

### `GET /health` — public
```json
{ "status": "ok", "service": "molido-api" }
```
Liveness only. Touches no dependency, so a slow database never causes a healthy
API to be restarted.

### `GET /health/detailed` — public
```json
{
  "status": "ok",
  "service": "molido-api",
  "version": "0.1.0",
  "environment": "development",
  "uptimeSeconds": 42,
  "timestamp": "2026-08-18T16:07:10.970Z",
  "components": {
    "database": { "status": "ok", "latencyMs": 5 },
    "redis":    { "status": "ok", "latencyMs": 2 },
    "ai":       { "status": "disabled", "detail": "no AI provider configured" }
  }
}
```
`status` is `down` if the database is unreachable, `degraded` if only Redis is.
`ai: disabled` is the honest MVP state — not a failure.

## Authentication

| Route | Auth | Notes |
| --- | --- | --- |
| `POST /auth/register` | public | 12-char minimum password |
| `POST /auth/login` | public | |
| `POST /auth/refresh` | public | rotates; presented token is invalidated |
| `POST /auth/logout` | required | |
| `POST /auth/logout-all` | required | |
| `GET /auth/me` | required | |
| `GET /auth/sessions` | required | |
| `DELETE /auth/sessions/:id` | required | own sessions only |

All `/auth/*` routes are governed by the stricter rate limiter (default
10/minute).

### `POST /auth/register`
```json
{ "email": "founder@molido.ai", "password": "a-long-passphrase", "displayName": "Founder" }
```
→ `201`
```json
{
  "accessToken": "eyJ...",
  "refreshToken": "KpM8KMfu...",
  "tokenType": "Bearer",
  "expiresIn": 900,
  "user": {
    "id": "uuid", "email": "founder@molido.ai", "displayName": "Founder",
    "status": "ACTIVE", "roles": ["USER"],
    "permissions": ["USER_READ", "SESSION_READ", "AI_TASK_CREATE", "AI_TASK_READ", "AI_TASK_CANCEL"],
    "emailVerifiedAt": null, "lastLoginAt": null, "createdAt": "..."
  }
}
```

Unknown properties are **rejected**, not ignored:
```json
{ "statusCode": 400, "message": ["property roles should not exist"] }
```

The refresh token is returned exactly once and is never stored in plaintext.

### `POST /auth/login`
Wrong password and unknown account return an identical `401 Invalid email or
password`. Ten failures lock the account for 15 minutes and revoke live
sessions.

### `POST /auth/refresh`
```json
{ "refreshToken": "..." }
```
Returns a fresh pair. Presenting an already-rotated token revokes the entire
session family and records a `CRITICAL` security event; the response says only
that the session ended.

## AI

| Route | Permission |
| --- | --- |
| `POST /ai/tasks` | `AI_TASK_CREATE` |
| `GET /ai/tasks` | `AI_TASK_READ` (own) / `AI_TASK_MANAGE` (all) |
| `GET /ai/tasks/:id` | `AI_TASK_READ` (own) / `AI_TASK_MANAGE` (all) |
| `POST /ai/tasks/:id/cancel` | `AI_TASK_CANCEL` |
| `GET /ai/agents` | `AGENT_READ` |

### `POST /ai/tasks`
```json
{ "agent": "research", "input": "Explain the future of decentralized AI." }
```

→ `201`. Execution is **asynchronous**: the task is recorded and queued, and
the response returns immediately.

```json
{ "taskId": "uuid", "status": "PENDING", "output": null, "error": null }
```

Poll `GET /ai/tasks/:id` until the status leaves `PENDING`/`RUNNING`. A completed
task looks like:

```json
{
  "taskId": "uuid",
  "status": "COMPLETED",
  "output": {
    "objective": "...",
    "summary": "...",
    "findings": [{ "claim": "...", "basis": "MODEL_KNOWLEDGE", "confidence": "HIGH" }],
    "assumptions": ["..."],
    "uncertainties": ["..."],
    "suggestedNextSteps": ["..."]
  },
  "error": null
}
```

With no provider configured the task is still created and queued; the worker
fails it with `AI_PROVIDER_NOT_CONFIGURED`. A failure is always recorded, never
silent.

If the queue itself cannot be reached, the API does not pretend otherwise: the
task is marked `FAILED` with `QUEUE_UNAVAILABLE` and `retryable: true`, because a
task recorded as pending that no worker will ever see is worse than an honest
error.

### `GET /ai/tasks`
Paginated. `?page=1&pageSize=20` (max 100).

```json
{ "items": [ ... ], "page": 1, "pageSize": 20, "total": 42, "totalPages": 3 }
```

### `POST /ai/tasks/:id/cancel`
Cancels a `PENDING` or `RUNNING` task. Returns `{ "cancelled": false }` when the
task had already finished — an honest no-op rather than a false success.

## Founder

Backend-enforced. Hiding the screen in a client is presentation, not a control.

| Route | Permission |
| --- | --- |
| `GET /founder/overview` | `SYSTEM_READ` + `USER_READ` + `AI_TASK_MANAGE` |
| `GET /founder/security` | `SECURITY_READ` |
| `GET /founder/tasks` | `AI_TASK_MANAGE` |
| `POST /founder/pause` | `SYSTEM_MANAGE` |
| `POST /founder/resume` | `SYSTEM_MANAGE` |

### `GET /founder/overview`
Live counts. Zero is returned as zero — revenue and node count are real zeros
with a note saying so, not placeholders awaiting data.

### `GET /founder/security`
Recent security events with **masked** source addresses (`203.0.113.x`) and no
raw metadata. Enough to spot a pattern, not enough to identify a person.

### `POST /founder/pause`
```json
{ "reason": "Investigating unusual activity" }
```
Stops **new** AI tasks with a `503` that quotes the reason. Queued and running
tasks are deliberately left to finish — a control that silently destroys
in-flight work is not a safety feature.

Every `finding` is labelled `MODEL_KNOWLEDGE` or `ASSUMPTION`. There is no
`sources` field: the agent cannot browse, so it has nowhere to put a citation it
could not have verified.

Error codes: `AI_PROVIDER_NOT_CONFIGURED`, `AI_PROVIDER_UNAVAILABLE`,
`AI_PROVIDER_TIMEOUT`, `AI_PROVIDER_RATE_LIMITED`, `AI_INVALID_OUTPUT`,
`AI_UNKNOWN_ERROR`. Only `retryable: true` codes are worth resubmitting.

### Task visibility
Another user's task returns `404`, never `403` — `403` would confirm the id is
real.

## Errors

```json
{
  "statusCode": 403,
  "error": "Forbidden",
  "message": "Access denied",
  "requestId": "uuid",
  "timestamp": "2026-08-18T16:08:09.769Z"
}
```

| Code | Meaning |
| --- | --- |
| 400 | Validation failed (includes unknown properties) |
| 401 | Not authenticated, or session no longer valid |
| 403 | Authenticated but not permitted |
| 404 | Not found, or not yours |
| 413 | Body over 256 KB |
| 429 | Rate limited |
| 500 | Unexpected — details are in the log under `requestId` |

A denial never names the permission that was missing. An error never carries a
stack trace, SQL, a file path or a connection string.
