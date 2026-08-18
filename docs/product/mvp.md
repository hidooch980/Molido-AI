# MVP scope

> NO TOKEN BEFORE REAL VALUE.

## What exists

| Capability | State |
| --- | --- |
| Monorepo, Docker dev environment | Working |
| PostgreSQL + Prisma, 11 entities | Working, migrated |
| Redis | Working |
| Email authentication | Working |
| Refresh rotation + reuse detection | Working, tested |
| RBAC with explicit permissions | Working, tested |
| Audit log + security events | Working, tested |
| Rate limiting | Working, tested |
| AI provider abstraction | Working, tested |
| Research agent + orchestrator | Working, tested |
| `POST /api/v1/ai/tasks` | Working |
| Async task queue (BullMQ) + worker | Working, tested |
| Founder command centre (real metrics) | Working, tested |
| Emergency pause / resume | Working, tested |
| Task cancellation + pagination | Working, tested |
| Web app: sign in, dashboard, tasks, founder | Working, browser-tested |
| Web landing page with live status | Working |
| CI pipeline | Configured |

## What is deliberately absent

**No AI provider is configured by default.** The platform boots, serves, and
reports `AI: not configured` — honestly. Submitting a goal creates a real task
that fails with `AI_PROVIDER_NOT_CONFIGURED`. It does not return a canned
answer, and the button on the homepage stays disabled rather than pretending.

**No users are seeded.** The dashboard starts at zero because zero is true.
There are no demo accounts, no sample tasks, no synthetic activity. A Founder
account is created only from real credentials supplied through the environment.

**No token, coin, wallet, ledger, node or chain.** Not stubbed, not
interface-reserved, not disabled-but-present. The sequence is: real product →
real users → real revenue → network → testnet → audit → mainnet. Nothing in
this codebase anticipates step six.

**No growth automation.** No view, like, follower, comment or review
manipulation. No Sybil accounts. No bots inflating anything.

## Honest limitations

- **Streaming** exists in the `AIProvider` interface but yields a single chunk;
  no UI consumes a stream yet.
- **No mobile application.** There is no `apps/mobile`, no Flutter code, and no
  Dart toolchain in this repository.
- Task progress is shown by **polling**, not server-sent events. The polling is
  bounded — widening intervals, then it stops.
- The worker runs at **concurrency 1**. Fine for now; it is the obvious first
  thing to raise when real load arrives.
- The research agent works from **model knowledge only**. It cannot browse, and
  it is told so plainly. Its output schema has no `sources` field, so a
  fabricated citation has nowhere to go.
- **No email verification, MFA, or password recovery.** See
  [../security/security-model.md](../security/security-model.md).

## Running it

```bash
pnpm install
pnpm infra:up                     # PostgreSQL + Redis
cp .env.example .env              # then set JWT_ACCESS_SECRET
pnpm build
pnpm db:deploy && pnpm db:seed
pnpm dev                          # api :4000 · web :3000
```

Verify:

```bash
curl http://localhost:4000/api/v1/health
# {"status":"ok","service":"molido-api"}
```

## Enabling AI at zero cost

Install [Ollama](https://ollama.com), pull a model, then:

```bash
AI_PROVIDER=ollama
AI_MODEL=llama3.1
AI_BASE_URL=http://127.0.0.1:11434
```

No account, no key, no card. A hosted provider can be swapped in later by
changing `AI_PROVIDER` — no application code changes.
