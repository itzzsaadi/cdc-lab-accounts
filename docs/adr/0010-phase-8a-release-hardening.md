# ADR-0010: Phase 8A — Internal Acceptance and Release Hardening

## Status

Accepted.

## Context

Phase 8 was split. **8A** (this record) closes the internal code,
security, and verification gaps that do not need a deployed environment.
**8B** — deployment, backup and restore rehearsal, real-device
verification, and client-facing UAT — is explicitly not started.

The Phase 8 plan was approved with corrections, two of which mattered
before any code was written: it claimed error pages and named archive
confirmations were missing when several already existed. Reinspection
came first, and both corrections were right. What follows records only
what was genuinely absent.

## Decisions

### 1. Reinspection before creation — the plan overstated two gaps

`src/app/(app)/error.tsx` and `src/app/(app)/not-found.tsx` already
existed and already leaked nothing. `DailyExpenseRowActions`,
`AssetRowActions`, and `MonthlyExpenseRowActions` already confirmed
archiving **by name** (`Archive <span>{displayLabel}</span>`), satisfying
NFR-USE-06 for those three screens.

The real gaps were narrower and different: no boundary for the `(auth)`
group or the root layout, no root `not-found` for URLs outside the `(app)`
group, and three archive paths with **no confirmation at all** —
`MasterDataManager` (archived on a single click), `MonthlyPartyBillRow`
("Clear"), and `GridCellInput` (emptying a saved cell). Building
duplicates of the existing three would have been waste; missing the three
that were genuinely unguarded would have been the actual failure.

### 2. Enforced nonce CSP via `proxy.ts`, not report-only

Next 16 renamed `middleware.ts` to `proxy.ts`. The nonce is generated per
request there and Next stamps it onto its framework, bundle, and inline
hydration scripts.

Enforced from the start. A report-only policy makes release security
depend on somebody reading reports, which is not a control. The cost is
that a mistake breaks a page instead of filing a report. The repository
therefore preserves browser coverage that loads every screen and fails on
violations (`tests/e2e/security-headers.spec.ts`), alongside non-browser
policy tests. Per explicit instruction, the browser coverage was not rerun
for this completion, so Phase 8A does not claim full browser validation.

`'strict-dynamic'` removes any need for a host allowlist, and `script-src`
carries no `'unsafe-inline'` and no `'unsafe-eval'` in production.

**Cost accepted:** nonces require dynamic rendering, so `/`, `/sign-in`,
`/forgot-password`, `/forbidden`, and the `(auth)` group moved from static
to per-request. At this system's scale — one laboratory, a handful of
users — that is not a hosting-tier change, so CON-02 is unaffected.

Two exceptions, both documented at the point of exception rather than
buried here:

- `/offline` and `/offline-entry` keep a static policy with
  `script-src 'self' 'unsafe-inline'`. They must stay statically generated
  so the service worker can precache and serve them with zero connectivity
  (FR-OFF-01, ADR-0008 decision 11), and a nonce cannot exist for a page
  rendered at build time. Neither checks a session, reads a financial
  figure, or renders a server-supplied value.
- The unmatched-route 404's hydration scripts are CSP-blocked. Next.js
  serves that page outside the nonce path. Both attempted fixes were
  measured against a real production server and neither worked:
  `force-dynamic` on `not-found.tsx` did make the route `ƒ /_not-found`
  but still rendered `"nonce":"$undefined"`, and a root `[...notFound]`
  catch-all calling `notFound()` behaved identically while widening
  routing blast radius, so it was removed. The page is server-rendered
  content plus one plain anchor, so nothing breaks. The e2e spec
  **asserts** the limitation rather than skipping it, so it fails — and
  the note can be deleted — the day Next.js passes the nonce through.

### 3. HSTS without `preload`, production only

`max-age=63072000; includeSubDomains`, no `preload`. Preloading is
effectively irreversible and commits every subdomain of the final
production domain; neither the domain nor its subdomain inventory is
settled, so it is a Phase 8B decision. `includeSubDomains` with a
two-year max-age is the protection that actually matters; `preload` only
removes the very first plaintext request.

Production-only because emitting HSTS over `http://localhost` would pin a
developer's browser to HTTPS for localhost across every other project on
their machine.

### 4. Host-native structured JSON logging, not Sentry

One JSON object per line to stdout/stderr, which every managed host
already collects and indexes. A hosted SDK would add a vendor, a bundle
cost, and this system's financial data leaving the deployment — against
CON-02 and CON-07 both. `pino` was considered and rejected too:
`JSON.stringify` to stdout is sufficient for one small instance and adds
no dependency.

Every payload passes through the same `redactSensitiveValues` the Audit
Log screens already use, and `LogContext` is typed to reject binary
values so an uploaded workbook cannot be serialized into a log line even
by accident. Free-text errors additionally redact URL credentials,
secret-shaped assignments, and bearer tokens.

Next 16's stable `src/instrumentation.ts` `onRequestError` hook feeds every
uncaught server render, Route Handler, Server Action, and Proxy error into
that logger. It records method, pathname, route template, and render
context, but never request headers or query strings. Host-side collection
and alerting remain Phase 8B.

### 5. Health check that actually checks health

`/api/health` returned a static `{status:"ok"}` without touching Postgres,
so an uptime monitor built on it would have stayed green through a total
database outage. It now runs `SELECT 1` behind an explicit 3-second
timeout, so a hung pool fails fast rather than holding the request until
the platform's gateway timeout. The failure body says only
`{status:"error", database:"unreachable"}`; the cause goes to the log,
which is not reachable from the network. It stays unauthenticated,
because a probe that needs a session cannot report on a system whose
session store is what is down.

### 6. Bounded, cleanup-aware, per-user rate limiting — single-instance by design

A fixed-window counter keyed by **user id, not IP**: every caller is
already authenticated, a shared office NAT would make one Operator throttle
the whole reception desk, and an IP key is trivially widened by an attacker
who already holds a session. Bounded by a hard key ceiling with
oldest-first eviction; expired windows are swept on every check, so the
map cannot grow without bound.

**Documented limitation, not an oversight:** state is in process memory,
so two instances would each grant the full quota. A shared store adds a
service and a dependency for a threat model that does not exist at one
laboratory. It is named in `docs/security-review.md` as the first thing to
replace if this is ever scaled horizontally. The FR-AUTH-07 account
lockout is unaffected — that is database-backed.

Fixed-window over token-bucket or sliding-window for the reason CON-07
asks for: it reads in one sitting and has no background timer to leak. Its
known weakness (up to `2 × limit` across a boundary) is irrelevant when
the goal is stopping a runaway loop, not precise metering.

### 7. Import sessions scoped to their uploader

Approved decision 4. The claim's `updateMany` now includes
`createdBy: user.id` alongside the status and expiry conditions, so
ownership is checked atomically with the claim rather than as a separate
lookup that could go stale. Being an Admin is not the same as owning a
particular upload: without this, knowing a session id was enough to commit
someone else's workbook, and the `IMPORT` audit rows would have credited
the wrong actor. Every rejection returns one message — wrong owner,
already claimed, expired, and nonexistent are indistinguishable, so a
probe cannot confirm a session id exists. Proven, including that a refused
probe leaves the session usable by its real owner and so cannot be used to
deny service.

The preview Route Handler also performs its Admin permission check and
per-user rate-limit decision before multipart parsing, and rejects an
oversized declared request before `formData()`. The service function keeps
its own permission check; route hardening is not a replacement for
server-layer authorization.

### 8. Grid-cell archive confirmation is inline, not a modal

NFR-USE-06 requires archiving to be confirmed by name. Emptying a saved
Party Income grid cell archives a financial record, so it qualifies — but a
modal opening on blur would seize focus mid-keyboard-run and break
NFR-USE-02 ("the grid is operable by keyboard alone"), which is the one
requirement that screen exists to satisfy. Two requirements in genuine
tension; neither gets sacrificed.

Resolution: an inline prompt anchored to the cell, naming party and date,
with the amount **restored** while it is up — so the grid never shows a
figure as gone before it is, and abandoning the cell simply leaves the
record intact. A cell that only ever existed in the offline queue is
excluded: discarding a local draft the server has never seen is not the
archiving of a financial record.

`MasterDataManager` and `MonthlyPartyBillRow` use the codebase's existing
`Modal` pattern, since neither sits in a keyboard-run.

Reactivation is deliberately **not** confirmed — it restores availability
rather than withdrawing it, so the requirement's reason does not apply.

### 9. Explicit protected-surface registry, not runtime reflection

The plan proposed a reflection-based test; it was corrected, and the
correction was right. Reflection over a module's exports cannot tell a
guarded function from an unguarded helper, passes silently when a function
is renamed, and reads as magic later.

`tests/integration/authorization/protected-surface.ts` lists all 58
guarded functions by hand with their permission keys. The sweep is
**execution-based**: each is genuinely called with each role, plus
unauthenticated and deactivated callers, and the assertion is on what
happens. Because `requirePermission` is the first statement in every one,
the registry can pass deliberately invalid input — and that is itself
load-bearing, since a reordering that put validation first would return a
validation error instead of throwing, and the sweep would fail.

Two safety nets: a completeness check that every key in the matrix is
covered (or listed in `ACTION_ONLY_PERMISSIONS` with a note saying where
it _is_ enforced), and a drift check comparing `requirePermission` call
sites per file against registry entries — the only part that reads source,
and only to count.

The sweep also asserts the **positive** direction: every role can reach
everything at or below its level. A sweep that only proved denial would
pass with the whole system locked.

### 10. Clean-database rehearsal creates its own temporary database

`npm run rehearse:migrations` generates a uniquely named
`cdc_rehearsal_*` database, applies all 7 migrations from zero, seeds it,
asserts the Appendix A counts plus zero users, financial rows, audit rows,
sync receipts, and import rows, and drops it. It never touches the
development or test databases — a rehearsal that destroys a working
environment is worse than no rehearsal.

This exists because `prisma migrate deploy` against an already-migrated
database is a no-op, so a migration that only works against existing state
— and this project's later migrations contain preflight `DO $$ ... RAISE
EXCEPTION` blocks and backfill `UPDATE`s that read prior state — could
pass every day and fail the one time it matters. Now in CI.

### 11. Performance: measure what is meaningful, decline what is not

NFR-PERF-06 was extended from the two result/report queries Phase 5
covered to every list and grid screen, against a three-year dataset.
NFR-PERF-07 (200 offline entries within 30 seconds) is driven through the
real `processSyncBatch` in the client's own 50-per-batch chunks.

**NFR-PERF-01/02/03 are deliberately not asserted.** They are
browser-timing budgets and Playwright runs against `next dev`, where
first-hit Turbopack compilation dominates every measurement. A number
recorded there would not mean what it appears to — in either direction.
They need a production build served by `next start`, which is a Phase 8B
environment measurement, and they are recorded as outstanding rather than
papered over with a misleading figure.

### 12. Dependency advisories assessed, not blanket-upgraded

Both open advisories were traced to their actual call sites and found
unreachable; both "fixes" are breaking major downgrades. Full reasoning in
`docs/security-review.md` §5. CI runs `npm audit --omit=dev` on every push
so a new advisory surfaces promptly, but does not fail the build — an
advisory published overnight in an unreachable transitive dependency
should not block an unrelated change.

## Consequences

- One new dependency: `@axe-core/playwright@4.13.0` (dev), version
  confirmed available and compatible before installing, per the approved
  condition.
- Five previously-static routes now render per request (see decision 2).
- `src/proxy.ts` is the first proxy/middleware in this project; it runs on
  every document request.
- `src/instrumentation.ts` is the global server-error logging boundary; it
  writes only to the host-native JSON stream.
- The Playwright config gains three smoke-only projects that are **not**
  part of the default run and need `npx playwright install firefox
webkit`.

## Alternatives rejected

- **Report-only CSP first** — leaves release security depending on
  somebody reading reports.
- **Static CSP with `'unsafe-inline'` everywhere** — the weakest option
  the Next.js docs offer, and unnecessary here.
- **Experimental SRI-based CSP** — would keep static rendering, but the
  Next.js docs mark it experimental and "may change or be removed";
  against CON-07.
- **Sentry** — rejected per the approved decision; rationale in decision 4.
- **A modal for grid-cell archive confirmation** — would break NFR-USE-02.
- **Runtime reflection for the authorization sweep** — rejected per the
  approved correction; rationale in decision 9.
- **Dropping and recreating the dev or test database for the rehearsal** —
  rejected per the approved correction; the script creates its own.
