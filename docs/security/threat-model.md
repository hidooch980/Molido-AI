# Threat model

Scope: the MVP monorepo (`apps/`, `packages/`) running locally or on a single
host. It does not cover the legacy applications elsewhere in this repository.

## Assets

| Asset | Why it matters |
| --- | --- |
| User credentials | Reused elsewhere by real people |
| Session tokens | Direct account takeover |
| `JWT_ACCESS_SECRET` | Forge any identity |
| Audit log + security events | The only record of what happened |
| AI budget | Real money once a paid provider is configured |
| User goals and AI output | Potentially commercially sensitive |

## Actors

1. **Anonymous internet** — no credentials.
2. **Authenticated user** — a valid account, trying to exceed it.
3. **Compromised account** — valid credentials, hostile intent.
4. **Malicious AI output** — the model returns something designed to be acted on.
5. **Insider with database access.**
6. **Supply chain** — a dependency turns hostile.

## STRIDE

### Spoofing

| Threat | Control | Residual |
| --- | --- | --- |
| Credential stuffing | Rate limit 10/min on auth routes, lockout after 10 failures + session revocation, security events | No breached-password check |
| Token forgery | HS256, issuer and audience both verified | Single symmetric secret; no rotation |
| Stolen refresh token | Rotation with family-wide reuse detection | Window between theft and next legitimate use |
| Session fixation | Sessions are server-issued only; no client-supplied id is honoured | — |
| Account enumeration | Identical responses and equalised timing across login paths | — |

### Tampering

| Threat | Control |
| --- | --- |
| Mass assignment | `whitelist` + `forbidNonWhitelisted`; unknown properties are a 400, not a silent drop |
| Prototype pollution | `class-transformer` builds declared class instances; no deep merge into `{}` |
| SQL injection | Prisma parameterises; the one raw statement is a constant TRUNCATE in test setup |
| Oversized payloads | 256 KB body limit at the Fastify layer |
| Spoofed client IP | `X-Forwarded-For` ignored unless `TRUST_PROXY=true` |
| Audit tampering | Append-only by convention; **not enforced at the database level** |

### Repudiation

Every privileged action writes an `AuditLog` row with actor, action, resource,
outcome and request id. Security-relevant occurrences additionally write a
`SecurityEvent`.

**Residual:** an insider with database write access can alter both. Append-only
storage or off-host shipping is needed before that is genuinely mitigated.

### Information disclosure

| Threat | Control |
| --- | --- |
| Password in a log | scrypt-only storage; redaction in the logger, applied across key spellings |
| Token in a log | Same; `Authorization` and `Cookie` headers stripped |
| API key in an error | Vendor error bodies never propagated; key held in a `#private` field |
| Stack trace to a client | Single exception filter; internals stay in the log |
| Connection string in an error | `describeConnection` strips credentials before logging |
| Reading another user's task | Ownership checked in the service; returns 404, not 403 |
| API surface mapping | OpenAPI served in non-production only |

### Denial of service

| Threat | Control | Residual |
| --- | --- | --- |
| Request flood | Two-tier rate limiting, tracked per user when authenticated | In-memory store; per-instance, not cluster-wide |
| Expensive password hashing as an amplifier | Password length capped at 256 characters | scrypt at N=2¹⁷ is intentionally costly — a burst of logins is expensive by design |
| Poisoned hash record forcing absurd work | Parser rejects N > 2²², r > 32, p > 16 | — |
| Slow AI provider holding a request | Per-provider timeouts; agent hourly budgets | Tasks run **synchronously** — the queue worker is not built yet |
| Redis outage | API degrades rather than failing to boot | — |

### Elevation of privilege

| Threat | Control |
| --- | --- |
| Role injection at registration | Roles are never read from a payload; new accounts get `USER` |
| Client-asserted permissions | Only the signed token is trusted; headers are ignored |
| Access retained after a role is removed | Permissions re-read on each login; sessions revocable immediately |
| Suspended user still acting | Account status checked by the auth guard **and** the orchestrator |
| Agent acting beyond its remit | Agents receive no clients or credentials; registry grants one permission |

## AI-specific threats

| Threat | Control | Residual |
| --- | --- | --- |
| Fabricated sources | No `sources` field in the schema; prompt states no browsing; post-validation citation check | The model can still be confidently wrong within a claim |
| Prompt injection via the goal | Agent has no tools, so there is nothing for injected instructions to reach | Injected text can still shape the output the user reads |
| Malformed output persisted as a result | Zod validation; a violation fails the task | — |
| Budget exhaustion | Per-agent hourly ceiling and per-task token cap | No per-user AI quota yet |
| Sensitive prompt retention | Usage records store length, not content | The task row does store the goal — necessary to show history |

## Supply chain

`pnpm audit` and a secret scan run in CI, weekly as well as on push. Versions are
pinned in a committed lockfile.

**Residual:** no SBOM, no signature verification, no dependency pinning by
digest. A hostile transitive dependency would not be caught before it ran.

## Explicitly out of scope

- Physical and host security.
- TLS termination — assumed to be handled upstream.
- Availability guarantees; there is no multi-instance deployment.
- Anything involving tokens, wallets, or a chain. None of it exists.

## Highest-value work next

1. Ship audit and security events off-host, so an insider cannot quietly edit
   the record.
2. Breached-password corpus check at registration.
3. Move token counting to Redis so rate limits hold across instances.
4. Asymmetric JWT signing with key rotation, before a second service verifies
   these tokens.
5. External penetration test before any production exposure.
