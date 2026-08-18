# Backend

NestJS 11 on Fastify 5. TypeScript strict. Base path `/api`, URI versioning, so
every route today is `/api/v1/...`.

## Module map

```
AppModule
├── AppConfigModule      global · validated AppConfig, loaded once at boot
├── PrismaModule         global · the single PrismaClient
├── RedisModule          global · lazy connection, degrades rather than blocks
├── OversightModule      global · AuditService + SecurityEventService
├── ThrottlerModule      two limiters, disjoint scopes, config-driven
├── AuthModule           auth, sessions, tokens
├── HealthModule         liveness + readiness
└── AiModule             provider, orchestrator, agents, controller
```

Four modules are `@Global()`. That is a deliberate, bounded list: configuration,
database, cache and oversight are cross-cutting, and requiring every module to
re-import `AuditService` is how privileged actions end up unlogged.

## Global providers

```ts
{ provide: APP_FILTER, useClass: AllExceptionsFilter },
{ provide: APP_GUARD,  useClass: MolidoThrottlerGuard },  // rate limit first
{ provide: APP_GUARD,  useClass: JwtAuthGuard },          // then identity
{ provide: APP_GUARD,  useClass: PermissionsGuard },      // then permission
```

Order matters: an unauthenticated flood is rejected before it costs a database
round trip, and authorisation cannot run before identity is known.

Because the guards are global, **every route is protected unless it opts out**
with `@Public()`. Forgetting the decorator makes a route private — the safe
failure mode.

## Configuration

`@molido/config` validates `process.env` with Zod and projects it into a frozen
`AppConfig`. Invalid configuration throws `ConfigValidationError`, which
`main.ts` catches to print which variables are wrong — never their values — and
exit. A service that boots with a missing secret and fails later, under load, is
far worse than one that never boots.

No secret has a default. Anything with a default is, by definition, not a
secret.

## Request identity

The correlation id is assigned in a Fastify `onRequest` hook, not a Nest
interceptor. Interceptors run *after* guards, so a request rejected by
authentication or rate limiting would carry no id — losing correlation precisely
on the failures an operator most needs to trace.

An inbound `X-Request-Id` is never trusted; honouring it would let a caller
collide their requests with someone else's log entries.

## Authentication internals

`TokenService` mints both token types. Signing and verification each pass the
secret explicitly at call time, so `JwtModule.register({})` holds no secret and
there is exactly one place a secret is read from.

`SessionService` owns the refresh lifecycle. Rotation revokes the old row and
creates the new one **in a single transaction** — a crash between the two would
leave either two live tokens or none, and both are worse than failing the
refresh.

`AuthService` orchestrates and records. Note the dummy-hash verification on an
unknown email: returning early would make "unknown account" measurably faster
than "wrong password", handing out an enumeration oracle through timing alone.

## Error handling

`AllExceptionsFilter` is the single exit point. A Prisma error reaching it is
treated as a bug: logged in full, reported as a bare 500, because its message can
carry column names and query fragments. 5xx logs at `error`, 4xx at `warn` —
the former is our defect, the latter is the client being told "no".

## Testing

Integration tests boot the **real** application — same guards, same validation
pipe, same helmet configuration — against a dedicated `molido_test` database,
using Fastify's in-process injector so no socket is opened.

A harness that skipped those controls would prove nothing about the controls it
is meant to verify.

```bash
pnpm --filter @molido/api test
```

Tests run single-forked: they share a database and truncate between cases, so
parallel files would race each other's fixtures. The rate-limit suite gets its
own app instance with deliberately tiny ceilings, and clears the limiter's
in-memory store between cases.
