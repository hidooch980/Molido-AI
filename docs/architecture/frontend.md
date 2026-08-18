# Frontend

Next.js 15, App Router, React 19, Tailwind CSS 4, TypeScript strict.

## What it is today

A single public page: the MOLIDO identity, the goal input, and a live status
board for the API, database, cache and AI provider.

## Principles

**Server-rendered, no client data fetching.** The page is
`dynamic = 'force-dynamic'` and reads health on the server for each request.
Health is live state; rendering it from a cache would make the status page
confidently wrong.

**Failure is a state, not an exception.** `fetchPlatformStatus` never throws. If
the API is unreachable it returns `unreachable: true` and marks unprobed
dependencies `unknown` — never `ok`. A status page that goes blank when the thing
it monitors is unwell has failed at its one job, and it must never guess a green
light it cannot verify.

**The disabled button is the honest one.** With no AI provider configured, ASK
MOLIDO stays disabled and says why. Accepting the goal and showing a spinner that
resolves into nothing — or worse, a canned answer — would be a small lie told at
the very front door of the product.

## Accessibility

- A skip link, visible on focus, so keyboard users can bypass the header.
- Status is carried by **text**, not colour alone; the colour dot is
  `aria-hidden`. That is what makes the board readable to a colour-blind or
  screen-reader user.
- A visible focus ring on every interactive element.
- `prefers-reduced-motion` is respected rather than overridden.
- Semantic landmarks, one `h1`, labelled form controls.

## Responsive

Mobile-first. A single column below `sm`, two at `sm`, four at `lg`. Verified at
390 px and 1280 px.

## Security

`NEXT_PUBLIC_*` values are the only ones readable here, and every one ends up in
the browser bundle. Nothing secret is routed through `lib/config.ts` — the API
key, the database URL and the JWT secret are server-side only.

`next.config.mjs` sets `X-Content-Type-Options`, `X-Frame-Options`,
`Referrer-Policy` and a restrictive `Permissions-Policy`, and disables the
`X-Powered-By` header.

## Not built yet

The Founder dashboard (`/dashboard`), authentication screens, and the AI task
history view.
