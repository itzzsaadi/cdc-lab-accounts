# ADR-0003: Phase 2 Authentication and Authorization

## Status

Accepted.

## Context

Phase 2 (`docs/PROJECT_PLAN.md`) wires up real authentication (FR-AUTH-01–09,
FR-AUD-07) and server-side role enforcement (FR-AUTH-04/08, `CLAUDE.md`
§15/§16) on top of Phase 1's schema, which deliberately omitted
`users.password_hash` pending this phase (ADR-0002 decision 2). Every
Better Auth behavior cited below was confirmed by reading the installed
`better-auth@1.7.1`/`@better-auth/core@1.7.1`/`@better-auth/prisma-adapter@1.7.1`
source directly — never assumed from training data or documentation
alone — because several assumptions in the plan's first draft turned out
to be wrong on inspection (see decisions 2 and 8).

## Decisions

### 1. Better Auth field mappings

`user.modelName` and `session.modelName` must be the **Prisma Client
property name** (`user`, `session` — the lowercase names Prisma generates
from `model User`/`model Session`), not the `@@map`-ed table name
(`users`/`sessions`) and not the capitalized Prisma model name (`User`/
`Session`). The Prisma adapter resolves `db[modelName]` directly against
the generated client (`@better-auth/prisma-adapter/dist/index.mjs`), which
only exposes lowercase property names. Passing the mapped table name
produced `BetterAuthError: Model users does not exist in the database` —
caught by the integration test suite, not assumed correct. `account`/
`verification` needed no override since their Prisma model names already
match Better Auth's own defaults. `user.fields.name` maps to `"fullName"`
(the Prisma Client field name), not `"full_name"` (the DB column) — same
reasoning.

### 2. No Better Auth admin plugin

The admin plugin (`better-auth/dist/plugins/admin/admin.d.mts`) adds
`banUser`/`unbanUser`/`banned`/`banExpires`/`banReason`, which would create
a **second** deactivation mechanism alongside the SRS's own `users.is_active`
— the same duplicate-state problem Phase 1 rejected a separate `partners`
table for. It also activates `removeUser` (physical delete, forbidden) and
`impersonateUser` (no SRS requirement). **Decision: do not enable it.**
Invitation, bootstrap, and session revocation are hand-built on Better
Auth's _public_ API instead (decisions 3–5).

### 3. Invitation acceptance — two-layer design, no internal API access

The original plan called `ctx.password.hash` and manually created the
`account` row — internal-context functions, not public API. On inspection,
`better-auth/dist/api/routes/password.mjs`'s public `resetPassword`
endpoint already does exactly this itself: it checks
`findCredentialAccount(userId)` and creates-or-updates the account,
hashing via its own internal `password.hash` — never called by project
code. This makes `resetPassword` the correct, fully public mechanism for
"set a password where none existed yet."

Two layers:

- **Layer 1 (project-owned)**: a random raw token, SHA-256 digest stored
  via a plain `prisma.verification.create()` call — ordinary application
  code against a table Better Auth also uses, not its internal adapter.
  The raw token exists only in the emailed URL, never persisted.
  Consumption is atomic and deferred: the whole validate-then-act sequence
  runs inside one `prisma.$transaction`, serialized per user via
  `pg_advisory_xact_lock(hashtext(identifier))` (auto-released at COMMIT/
  ROLLBACK, no manual unlock, so nothing can leak a held lock). The gate
  row is deleted **only after** Layer 2 fully succeeds — if it throws, the
  transaction rolls back and the gate token is untouched, safely retryable
  with the same link. Proven in
  `tests/integration/auth/invitation.test.ts` by deliberately triggering a
  Layer 2 failure (a password shorter than the configured minimum) and
  confirming the same link still works afterward.
- **Layer 2 (Better Auth's own public API)**: the server calls
  `auth.api.requestPasswordReset({ body: { email } })` — Better Auth mints
  its own token via its internal adapter and calls our `sendResetPassword`
  callback. A short-lived, in-memory marker
  (`pendingInternalResetEmails`/`internalMintedTokens`,
  `src/lib/auth/invitation.ts`) tells that callback this is an internal
  continuation, not a user-initiated request, so it captures the token
  instead of emailing it. The server then immediately calls the public
  `auth.api.resetPassword({ body: { token, newPassword } })`. The whole
  round-trip is server-side, in one request; the Better-Auth-native token
  is never shown to the browser.

Reissuing an invitation deletes **every** prior gate row for that user
(not just the most recent) before writing a new one.

### 4. Verification-token storage — a real, documented option, not a workaround

`better-auth/dist/api/routes/password.mjs` shows Better Auth's own
`requestPasswordReset` stores its token identifier
(`reset-password:<token>`) in **cleartext** by default
(`verification.storeIdentifier` defaults to `"plain"`). This project sets
`verification: { storeIdentifier: "hashed" }` — a real, documented
`BetterAuthOptions` field (`@better-auth/core/dist/types/init-options.d.mts`),
not a custom patch — so Better Auth hashes every identifier it writes and
reads through its own internal adapter. This project's own Layer-1
invitation-gate token (decision 3) is hashed independently, by project
code, regardless of this setting.

### 5. Session revocation — self-service API confirmed insufficient, direct deletion justified

`better-auth/dist/api/routes/session.mjs` shows `revoke-session`/
`revoke-sessions`/`revoke-other-sessions` all operate on
`ctx.context.session.user.id` — self-service only, gated by
`sensitiveSessionMiddleware`, which requires the caller to already hold a
live session _as that user_. There is no public, non-admin-plugin endpoint
for one user (an Admin) to revoke a different user's sessions — confirmed
by reading the route source, not inferred. Since the admin plugin is not
enabled (decision 2), Admin-initiated revocation (deactivation) is a
direct `prisma.session.deleteMany({ where: { userId } })`. This is safe
because `session.cookieCache` stays at its default (`enabled: false`) —
every request re-validates the session token against the `sessions` table,
so there is no stale signed-cookie cache to separately invalidate; deletion
is immediately effective. Proven in
`tests/integration/auth/cookies-and-revocation.test.ts` by replaying a
cookie captured before sign-out, password reset, and deactivation, and
confirming each is rejected afterward.

### 6. Sign-in session containment (mandatory safeguard)

The corrected sequencing in `src/lib/auth/lockout.ts`:

1. Call the public `signInEmail` endpoint with `returnHeaders: true`,
   unconditionally, first. `better-auth/dist/api/routes/sign-in.mjs`
   confirms this endpoint already performs a same-cost dummy
   `password.hash` for an unknown email or missing credential account, and
   a real `password.verify` for a real one, throwing one identical
   `INVALID_EMAIL_OR_PASSWORD` error in every failure case — entirely
   inside Better Auth's own code. Project code never calls
   `password.hash`/`password.verify` itself.
2. `returnHeaders: true` means the `Set-Cookie` header is returned to the
   caller, not sent to the browser, until the caller explicitly forwards
   it (`src/server/cookies.ts`'s `forwardSetCookieHeaders`).
3. Only after a successful verify does project code check that user's
   `lockoutUntil`/`isActive`. If either applies: the just-created session
   row is deleted directly and immediately (decision 5's reasoning), and
   the function returns without ever exposing `headers` to its caller —
   there is no code path by which a locked/inactive account's session
   headers can reach `forwardSetCookieHeaders`. Proven directly in
   `tests/integration/auth/lockout.test.ts`.

A correct password during lockout, or for a deactivated account, therefore
costs the same as any other attempt (the full public sign-in call always
happens) rather than a cheaper early rejection that would itself be a
timing tell.

### 7. Account enumeration resistance

Unknown email, wrong password, a locked account, and a deactivated account
all produce the identical response at the sign-in form (same message, same
comparable cost, via decision 6's sequencing) — never a distinct message
before authentication succeeds. A deactivated account gets a distinct
"account unavailable" message only _after_ a previously-authenticated
session is invalidated mid-use (`src/server/session.ts`'s per-request
`is_active` re-check), which is not an enumeration risk since the caller
was already signed in.

### 8. Cookie policy — a real bug found and fixed by testing

`better-auth/dist/cookies/index.mjs` confirms `httpOnly: true` and
`sameSite: "lax"` are hardcoded, not configurable — nothing to set.
`secure` follows `advanced.useSecureCookies`, set to
`process.env.NODE_ENV === "production"` (Better Auth's own default
behavior — the first draft of this config wrongly forced it `true`
unconditionally, which would have broken every local/Playwright HTTP
session; caught before merge, not after). A separate, independent
assertion (`src/lib/auth/production-guards.ts`) refuses to start in
production if `BETTER_AUTH_URL` is not HTTPS — a stronger guarantee than
trusting `NODE_ENV` alone.

**A genuine, initially undetected bug** was found only by running the
Playwright e2e suite end-to-end: `src/server/cookies.ts`'s
`forwardSetCookieHeaders` was passing Better Auth's already
percent-encoded cookie value straight into Next's `cookies().set()`,
which itself percent-encodes the value it's given — producing a
double-encoded cookie Better Auth could no longer decode back to the real
session token, so every "successful" sign-in silently redirected back to
`/sign-in` on the very next request. Fixed by `decodeURIComponent`-ing the
value once before handing it to `cookies().set()`. This is exactly why
`tests/e2e/auth.spec.ts` drives a real browser through a real sign-in
rather than only asserting against `signInEmail`'s raw response — the bug
was invisible to every unit/integration test, which called
`auth.api.signInEmail` directly and never round-tripped through Next's own
cookie-serialization layer.

### 9. Lockout design

FR-AUTH-07: 10 consecutive failures, 15-minute lockout, both approved. A
single atomic `UPDATE users ... RETURNING` (`src/lib/auth/lockout.ts`)
increments the counter and conditionally sets `lockout_until` in one
statement — safe under concurrent failed attempts (Postgres row-level
locking), proven in `tests/integration/auth/lockout.test.ts` with 10
concurrent requests. Better Auth's own `rateLimit` (IP-based, enabled)
handles general API abuse and is explicitly not the same mechanism as this
per-account lockout. No Admin-unlock action is built — purely time-based
expiry, approved.

### 10. Audit enum additions

`SESSION_REVOKED` and `ACCOUNT_LOCKED` are the only two new `AuditAction`
values. Everything else reuses Phase 1's existing values by varying
`entityType`: invitation created/accepted → `CREATE` on `"user"`/`"account"`;
deactivation → `ARCHIVE` on `"user"`; reactivation → `UPDATE` on `"user"`
(deliberately not a new "RESTORE" value — no FR asks for a symmetric
restore concept). A failed sign-in against an email matching no user keeps
Phase 1's design: `actorUserId: null`, `entityType: "auth"`,
`entityId: "unknown"` (never `NULL` — SRS marks `entity_id NOT NULL`), the
attempted email recorded once in `newValues`. Never recorded anywhere:
passwords, hashes, session tokens, cookies, reset/invitation tokens, or
full reset/invitation URLs — verified directly in
`tests/integration/auth/audit.test.ts`.

### 11. Email delivery — fail-closed, not silently degraded

Production requires `EMAIL_TRANSPORT=smtp` and a complete SMTP
configuration, checked at startup (`src/lib/email/transport.ts`); missing
any of it refuses to start. The development/test file-sink transport
writes to a git-ignored local file (`.local/mail.log`), never the
application's logger, and independently refuses to run whenever
`NODE_ENV=production` — two guards, not one, so a misconfigured
`EMAIL_TRANSPORT` env var in production can never fall back to writing a
real reset/invitation token to a local file. The one sanctioned exception
is the bootstrap script's own terminal output (decision 12) — a
completely separate code path, never routed through this transport.

### 12. Initial Admin bootstrap

`scripts/bootstrap-admin.ts` refuses to run if any `users` row already
exists (single-use guard) and refuses to run without an interactive TTY
attached (so it can never appear in captured CI/automation output). It
creates the user, issues a Layer-1 gate token (decision 3, 24-hour
expiry), and prints the one-time setup URL directly to its own invoking
terminal with an explicit warning — never through the email transport,
never logged, never committed. Placeholder Appendix A.5 emails are never
used; a real address is required at invocation.

### 13. Dependencies

`@better-auth/prisma-adapter@1.7.1` (already present transitively via
`better-auth@1.7.1`; peer dependencies — `@prisma/client`/`prisma` `^7.0.0`,
`@better-auth/utils@0.4.2` — all already satisfied), `nodemailer@9.0.5`,
`@types/nodemailer@8.0.1` (current, not deprecated; `nodemailer` ships no
bundled types). All exact-pinned via `npm install --save-exact`. No other
dependency added.

## Consequences

- `users.password_hash` remains permanently absent (ADR-0002 decision 2
  now fully realized); `account.password` is the sole credential store.
- Every later phase's endpoints call the same `requirePermission`
  function (`src/lib/permissions/guard.ts`) — no parallel authorization
  mechanism is ever introduced.
- `sessions`/`account`/`verification` are the one exception to the
  "never physically delete" rule established in Phase 1 — deliberately,
  since they are authentication infrastructure, not business/financial/
  audit records; `users` itself keeps its Phase 1 delete-rejection trigger
  unchanged.
- The Phase 1 migration (`20260820170711_init`) is untouched; Phase 2 adds
  one new, purely additive migration (`20260820181038_phase2_auth`).
