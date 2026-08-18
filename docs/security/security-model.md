# Security model

This document states what is implemented, what each control actually defends
against, and where the gaps are. It does not claim the system is secure against
a determined attacker — no honest document can.

## Identity

### Passwords

Stored as scrypt (N=2¹⁷, r=8, p=1), each with a 16-byte random salt, in a
self-describing format:

```
scrypt$N=131072,r=8,p=1$<base64 salt>$<base64 derived key>
```

scrypt over bcrypt because it is memory-hard. scrypt over Argon2id because it
ships in Node's standard library — no native module, no compiler, no
install-time failure. The `PasswordHasher` interface exists so Argon2id can
replace it without touching a call site, and `needsRehash` allows a transparent
upgrade on next login.

**Defends against:** offline cracking after a database compromise.
**Does not defend against:** a weak password the user chose. Policy is length-first
(12 characters minimum), per NIST SP 800-63B.

### Password policy gap

There is no breached-password corpus check. The deny-list is a token gesture.
This should be closed with an offline dataset before public launch.

## Sessions and tokens

Two token types, chosen for different reasons:

| | Access token | Refresh token |
| --- | --- | --- |
| Form | JWT (HS256) | Opaque, 256 bits of entropy |
| Lifetime | 15 minutes | 30 days |
| Stored server-side | No | SHA-256 digest only |
| Revocable | Via its session row | Immediately |

A JWT is self-validating, which makes revocation a bolt-on. An opaque refresh
token is meaningless without its database row, so revoking the row revokes the
token — instantly and unconditionally.

The digest is SHA-256, not a password KDF: the input already carries 256 bits of
entropy, so brute force is infeasible and a slow KDF would only add latency to
every refresh. A database leak yields digests, never usable tokens.

### Rotation and reuse detection

Every refresh mints a new token and marks the presented one `ROTATED`, linking
old to new. A token is valid exactly once.

If a *rotated* token is presented again, only theft or a clone explains it. The
system then:

1. Revokes the entire session family — every descendant of that login.
2. Records a `TOKEN_REUSE_DETECTED` security event at `CRITICAL`.
3. Tells the client only that the session ended.

The legitimate user is logged out too. That is the correct trade: a stolen
refresh token in circulation is worse than an interrupted session.

**Verified by:** `apps/api/test/auth.test.ts` — the replay is rejected *and* the
successor token is killed.

### Access token revocation lag

`JwtAuthGuard` checks the session row and the account status on every request,
so a logout or suspension takes effect immediately rather than when the token
expires. This costs one indexed lookup per request; the alternative — trusting
the JWT alone for 15 minutes — was not worth the saving.

## Authorisation

Roles are coarse buckets. Permissions are what is checked.

```
User → UserRole → Role → RolePermission → Permission
```

Permissions are rows, not strings on a role, so a grant can be described,
audited and revoked individually. There are no wildcards and no inheritance: a
grant not written down does not exist.

`PermissionsGuard` is global. A route is protected unless it carries `@Public()`,
which makes *forgetting* the decorator the safe failure. A denial records an
`AUTHORIZATION_FAILURE` event and returns `Access denied` — never the name of
the missing permission, which would map out the permission model.

The seed *reconciles* grants rather than adding to them: a permission removed
from the defaults in code is revoked in the database on the next seed. Stale
grants are how least privilege quietly erodes.

## AI agent containment

The `ResearchAgent` receives an `AIProvider` and a context object. It is handed
no database client, no filesystem, no shell, no HTTP client and no credentials.
The containment is structural — it follows from what the agent can be written to
do, not from a rule someone has to remember.

Its registry row grants exactly one permission: `AI_TASK_READ`.

Budgets and rate limits (`maxTokensPerTask`, `maxTasksPerHour`) live in the
database, so the Founder can tighten them at runtime without a deploy.

## Transport

- **Helmet** with a `default-src 'none'` CSP — the API returns JSON, never HTML.
- **CORS** against an explicit allow-list. `*` is rejected at configuration load,
  and in production a plaintext non-localhost origin fails validation.
- **Body limit** of 256 KB, enforced by Fastify before a handler runs.
- **`X-Forwarded-For` is ignored** unless `TRUST_PROXY=true`. Otherwise the header
  is attacker-controlled and would poison rate limiting and security events.

## Input validation

`ValidationPipe` runs with `whitelist` **and** `forbidNonWhitelisted`. An
undeclared property is not silently dropped — the request is rejected. This is
what closes mass assignment:

```
POST /api/v1/auth/register
{ "email": "...", "password": "...", "roles": ["FOUNDER"] }
→ 400  "property roles should not exist"
```

**Verified by:** `apps/api/test/auth.test.ts` — the crafted payload creates no user
at all.

## Account enumeration

| Situation | Response |
| --- | --- |
| Wrong password | `401 Invalid email or password` |
| No such account | `401 Invalid email or password` (identical) |
| Email already registered | `403` with a message that does not confirm it |
| Someone else's task id | `404 Not found`, never `403` |

A login against an unknown address still performs a full scrypt verification
against a dummy hash, so the timing does not distinguish the cases either.

## Rate limiting

Two limiters with disjoint scopes, both entirely configuration-driven:

| Limiter | Scope | Default |
| --- | --- | --- |
| `auth` | `/api/v1/auth/*` | 10 / minute |
| `default` | everything else | 120 / minute |

Authenticated traffic is tracked by user id rather than address, so one abusive
account cannot exhaust the shared quota of everyone behind the same NAT. Every
trip records a `RATE_LIMIT_TRIGGERED` event — a limiter that silently returns 429
protects the endpoint but tells nobody an attack is underway.

Failed logins additionally lock the account for 15 minutes after 10 attempts,
and the lockout revokes all live sessions.

## Logging and audit

Redaction is not opt-in. `@molido/logger` strips credentials before anything is
serialised, and each sensitive key is expanded into every spelling it might
appear under (`refreshToken`, `refresh_token`, `REFRESH-TOKEN`, …) because
pino's redaction matches paths literally.

Never logged: passwords, password hashes, tokens, API keys, cookies,
`Authorization` headers.

Two records, answering different questions:

- **AuditLog** — who did what. Append-only; never updated or deleted by the
  application.
- **SecurityEvent** — what happened that security should care about, including
  events with no legitimate actor.

Metadata is redacted on the way in. An audit trail that accumulates credentials
is a breach waiting to be read. A failure to write either record never fails the
request — losing a log line is bad, refusing a legitimate login because the log
was briefly unavailable is worse.

## Error handling

One exit point. The client learns *that* something failed and gets a request id
to quote; it never learns how. Stack traces, driver messages, SQL, constraint
names and file paths stay in the server log — correlated by the same id, which
is assigned in a Fastify `onRequest` hook so that even a request rejected by a
guard carries one.

## Secrets

No secret has a default. `JWT_ACCESS_SECRET` must be supplied in every
environment, minimum 32 characters, and placeholder values like `change_me` are
rejected. A configuration error names the offending variable and never its
value. The process refuses to start rather than booting misconfigured.

## Known gaps

Stated plainly, because a security document that lists only strengths is
marketing:

1. **No email verification.** `emailVerifiedAt` exists and is unused.
2. **No MFA.** The session model would support it; nothing is built.
3. **No breached-password check.**
4. **No CSRF token.** Not currently needed — authentication is `Authorization`
   header only, with no cookie — but this becomes required the moment a cookie
   is introduced.
5. **No account recovery flow.** A forgotten password currently has no path.
6. **HS256, single symmetric secret.** Fine for one service; asymmetric keys and
   rotation are needed before a second service verifies these tokens.
7. **No external audit.** Required before production, per the project's own
   security gate.

## What is not claimed

This system is not unhackable. No software honestly is. What is claimed is
defence in depth, secure defaults, least privilege, and enough audit trail to
reconstruct what happened.
