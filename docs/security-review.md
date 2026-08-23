# Security Review — Phase 8A

Covers NFR-SEC-01 to NFR-SEC-10 and the OWASP Top 10 posture NFR-SEC-06
asks for. Written at the close of Phase 8A (internal acceptance and
release hardening), before any deployment. Items that can only be
confirmed against real hosting are marked **environment-dependent** and
carried to Phase 8B rather than claimed here.

---

## 1. Requirement-by-requirement

| ID         | Requirement                                                            | Status                              | Evidence                                                                                                                                                                                                                                                                                                                                           |
| ---------- | ---------------------------------------------------------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| NFR-SEC-01 | HTTPS only; HTTP redirects permanently                                 | **Partial — application side done** | `Strict-Transport-Security: max-age=63072000; includeSubDomains` emitted in production only (`src/lib/security/headers.ts`). `src/server/auth.ts` refuses to start in production unless `BETTER_AUTH_URL` is HTTPS. The HTTP→HTTPS redirect itself is a hosting concern — **environment-dependent, Phase 8B**.                                     |
| NFR-SEC-02 | Database and backups encrypted at rest                                 | **Environment-dependent**           | A hosting-provider capability. Phase 8B.                                                                                                                                                                                                                                                                                                           |
| NFR-SEC-03 | Every endpoint verifies identity and role independently of the UI      | **Done (application scope)**        | One centralized `requirePermission`. All 58 guarded server functions are exercised per role in `tests/integration/authorization/full-surface-sweep.test.ts`; import preview is additionally proven to reject before multipart parsing. The real-HTTP route sweep is preserved, but browser validation was explicitly deferred for this completion. |
| NFR-SEC-04 | Financial results withheld from Operators at the server                | **Done**                            | Covered by the sweeps above plus the Phase 5 sweep; denied responses additionally asserted to contain none of the restricted field names.                                                                                                                                                                                                          |
| NFR-SEC-05 | All input validated server-side regardless of browser validation       | **Done**                            | Zod schema per command in `src/lib/validation/`. Proven ordered _after_ the permission gate but _before_ any write — see the sweep's "guard runs before validation" test.                                                                                                                                                                          |
| NFR-SEC-06 | OWASP Top 10, especially injection and broken access control           | **Done (application scope)**        | Section 2 below.                                                                                                                                                                                                                                                                                                                                   |
| NFR-SEC-07 | Secrets in environment config, never committed                         | **Done**                            | Section 3 below.                                                                                                                                                                                                                                                                                                                                   |
| NFR-SEC-08 | Session cookies HttpOnly, Secure, SameSite                             | **Done**                            | `HttpOnly`/`SameSite=Lax` hardcoded by Better Auth; `Secure` environment-aware. Asserted in `tests/e2e/auth.spec.ts` and `tests/integration/auth/cookies-and-revocation.test.ts`.                                                                                                                                                                  |
| NFR-SEC-09 | Offline device data cleared on sign-out once nothing is pending        | **Done**                            | `clearOfflineDataIfQueueEmpty`, e2e-tested both directions (Phase 6 closure).                                                                                                                                                                                                                                                                      |
| NFR-SEC-10 | Error messages reveal no stack traces, DB structure, or internal paths | **Done**                            | Section 4 below.                                                                                                                                                                                                                                                                                                                                   |

---

## 2. OWASP Top 10 (2021) posture

| Category                                           | Assessment                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A01 Broken Access Control**                      | The system's largest risk surface, and the most heavily tested. Every guarded function is called with every role, plus unauthenticated and deactivated callers. Role checks are server-side only; UI hiding is never the mechanism (CLAUDE.md §15). Deactivation takes effect on the next request — `session.cookieCache` is disabled, so `users.is_active` is re-read every time. Phase 8A closed one real gap here: an import session could be claimed by any Admin, not only its uploader (now scoped to `createdBy`). |
| **A02 Cryptographic Failures**                     | Passwords via Better Auth's Scrypt (per-invocation salt), never a custom algorithm. Password-reset and invitation tokens stored hashed (`verification.storeIdentifier: "hashed"`; the invitation-gate token is SHA-256 in this project's own code). The structured logger redacts secret-shaped keys and free-text credentials/tokens, and refuses binary payloads.                                                                                                                                                       |
| **A03 Injection**                                  | Every database access goes through Prisma's parameterised query builder. The three `$executeRawUnsafe` call sites are all in test helpers and the migration-rehearsal script, and interpolate only names this codebase generated itself, never user input. No `dangerouslySetInnerHTML` anywhere. Excel exports pass every free-text cell through `sanitizeTextCell` (formula-injection); Excel imports reject formula cells outright rather than coercing them.                                                          |
| **A04 Insecure Design**                            | Financial integrity is enforced in the database, not just the application: CHECK constraints, partial unique indexes, and `BEFORE DELETE` rejection triggers on every business, financial, master-data, settings, user, and audit table. The audit log is append-only by trigger, with no application path to alter it.                                                                                                                                                                                                   |
| **A05 Security Misconfiguration**                  | Phase 8A added the full security-header set and an enforced nonce-based CSP with no `'unsafe-inline'` in `script-src`. Production start-up fails closed on a non-HTTPS `BETTER_AUTH_URL` or incomplete SMTP config. Historical import preview verifies Admin access, request size, and rate limit before multipart parsing.                                                                                                                                                                                               |
| **A06 Vulnerable and Outdated Components**         | Section 5 below.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| **A07 Identification and Authentication Failures** | 10-failure/15-minute account lockout (database-backed, concurrency-tested). Unknown email, wrong password, locked, and deactivated all produce an identical response at the sign-in form. Sessions revoked on password reset, deactivation, and any role/partner/active-status change (the last by database trigger, so it holds for any code path). 30-day session lifetime per FR-AUTH-05.                                                                                                                              |
| **A08 Software and Data Integrity Failures**       | Import commit re-parses the stored bytes from scratch and re-validates before writing anything; nothing the browser echoes back is trusted. All business rows and their audit rows commit in one transaction. Offline sync replays a genuine retry's stored result verbatim and rejects a reused `operationId` carrying different content.                                                                                                                                                                                |
| **A09 Security Logging and Monitoring Failures**   | `audit_log` records every create/change/archive plus sign-in, failed sign-in, lockout, password change, and session revocation. Phase 8A added structured JSON application logging plus Next's global `onRequestError` server hook. **Host-side collection/alerting is environment-dependent, Phase 8B.**                                                                                                                                                                                                                 |
| **A10 Server-Side Request Forgery**                | Not applicable in any meaningful sense: the application makes no outbound HTTP request to any user-supplied or user-influenced URL. The only outbound connection is SMTP, to a fixed host from environment configuration.                                                                                                                                                                                                                                                                                                 |

---

## 3. Secret handling

- `.env` and `.env.*` are git-ignored (`!.env.example`, `!.env.test.example` excepted). Verified no `.env` file is tracked.
- `.env.example` contains placeholders only — `BETTER_AUTH_SECRET="change-me-generate-a-real-32-byte-secret"` is deliberately not a usable value.
- **Production checklist item:** generate a fresh `BETTER_AUTH_SECRET` (`openssl rand -base64 32`). The `.env.example` placeholder must never reach production; Better Auth itself refuses to start on its own library default, but this project's placeholder is not that default and would be accepted, so this is a human step, not an automated guard. Recorded in `docs/deployment.md`.
- Passwords, tokens, and connection strings live in a password manager, never in a document (SRS §10).
- The structured logger (`src/lib/observability/logger.ts`) redacts any key containing password/token/secret/cookie/authorization/session/credential/hash, sanitizes credentials and tokens embedded in free-text errors, and replaces binary values with a size marker, so an uploaded workbook can never be serialized into a log line.
- Uploaded import bytes are never written to disk, public storage, or any log — they exist only as `ImportSession.fileBytes` and are nulled on every terminal path.

---

## 4. Error leakage (NFR-SEC-10)

| Surface                           | Behaviour                                                                                                                                                                                     |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Authenticated page render failure | `src/app/(app)/error.tsx` — generic message, no `error.message`, no digest.                                                                                                                   |
| Pre-authentication page failure   | `src/app/(auth)/error.tsx` (added Phase 8A) — identical wording regardless of cause, so an unauthenticated caller learns nothing about the database, mail transport, or which accounts exist. |
| Root layout failure               | `src/app/global-error.tsx` (added Phase 8A).                                                                                                                                                  |
| Unmatched URL                     | `src/app/not-found.tsx` (added Phase 8A) — reveals nothing about which routes exist.                                                                                                          |
| Health check failure              | `{status:"error", database:"unreachable"}` only; the driver message goes to the log, never the response.                                                                                      |
| Import session refusal            | One message for wrong-owner, already-claimed, expired, and nonexistent alike — distinguishing them would confirm whether a session id exists.                                                 |
| Sign-in failure                   | Identical response for unknown email, wrong password, locked, and deactivated.                                                                                                                |
| Audit log display                 | `redactSensitiveValues` applied at render regardless of what wrote the row.                                                                                                                   |

---

## 5. Dependency audit

`npm audit --omit=dev` at Phase 8A close reports two distinct advisories.
Both were assessed for reachability rather than blanket-upgraded — the
available "fixes" are breaking major downgrades, and CON-07 puts
maintainability above a green audit number.

### `uuid < 11.1.1` — moderate — GHSA-w5hq-g745-h8pq

- **Path:** `exceljs@4.4.0 → uuid@8.3.2`.
- **The flaw:** a missing buffer bounds check in `v3`/`v5`/`v6` **when a
  `buf` argument is supplied**.
- **Reachability: none.** exceljs's only `uuid` call site is
  `lib/xlsx/xform/sheet/cf-ext/cf-rule-ext-xform.js`, which calls `v4()`
  with no arguments. `v4` is not among the affected functions, and no
  `buf` is ever passed. That file implements _conditional-formatting
  extensions_, which this project never uses — verified by grep: no
  `conditionalFormat` anywhere in `src/`.
- **The offered fix makes things worse:** `npm audit fix --force` would
  install `exceljs@3.4.0`, a major downgrade that would break FR-RPT-07's
  Excel export and FR-IMP-01/02's workbook reading.
- **Decision: accepted.** Revisit when exceljs bumps its `uuid`
  dependency.

### `deepmerge-ts < 8.0.0` — high

- **Path:** `prisma@7.9.1 → @prisma/config@7.9.1 → deepmerge-ts@7.1.5`.
- **Reachability: none at runtime.** `prisma` is a **devDependency** — the
  CLI that runs `migrate`, `validate`, `format`, and `db seed` locally and
  in CI. It is not imported by any application code and is not in the
  production build. (`npm audit --omit=dev` still lists it; that reflects
  how audit walks the lockfile, not an actual production path. `npm ls
deepmerge-ts` shows the single `prisma` path.)
- **Decision: accepted.** Revisit when Prisma ships a `@prisma/config`
  with a newer `deepmerge-ts`. Upgrading Prisma's own major version to
  chase a dev-only CLI transitive dependency is not proportionate.

CI runs `npm audit --omit=dev` on every push so a _new_ advisory surfaces
promptly. It does not fail the build, deliberately: an advisory published
overnight in an unreachable transitive dependency should not block an
unrelated change. The report is read; the decision is recorded here.

---

## 6. Rate limiting and resource limits

| Surface                   | Limit                                       | Notes                                                                                                                                                                            |
| ------------------------- | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sign-in (per account)     | 10 consecutive failures → 15-minute lockout | FR-AUTH-07. Database-backed, so multi-instance-safe.                                                                                                                             |
| Auth routes (per IP)      | Better Auth's own `rateLimit`               | Enabled since Phase 2.                                                                                                                                                           |
| Import preview (per user) | 10 / minute                                 | Phase 8A. The most expensive authenticated request in the system.                                                                                                                |
| Sync upload (per user)    | 60 / minute (= 3,000 operations)            | Phase 8A. Well above NFR-PERF-07's 200-entry target, which needs 4 batches.                                                                                                      |
| Import file size          | 5 MB                                        | Declared request length is rejected before multipart parsing; file size is checked before workbook parsing and re-checked against actual bytes (a client controls declarations). |
| Import rows               | 5,000 per sheet                             |                                                                                                                                                                                  |
| Sync batch                | 50 operations, 2 MB body                    |                                                                                                                                                                                  |

**Documented limitation:** the per-user rate limiter
(`src/lib/rate-limit.ts`) holds state in process memory, so it is
**single-instance only** — two app instances would each grant the full
quota. This is proportionate for a system CON-02 sizes as one small
instance for one laboratory, and a shared store would add a service and a
dependency for a threat model that does not exist here. If this system is
ever scaled horizontally, that module is the first thing that must be
replaced. The account lockout is unaffected — it is in the database.

---

## 7. Content Security Policy

Enforced (never report-only) and nonce-based, generated per request in
`src/proxy.ts`. No `'unsafe-inline'` and no `'unsafe-eval'` in
`script-src` in production; `'strict-dynamic'` means Next's own
nonce-carrying bootstrap authorises the bundles it loads, so no host
allowlist is needed.

Two documented exceptions:

1. **`/offline` and `/offline-entry`** carry a static policy with
   `script-src 'self' 'unsafe-inline'`. They must remain statically
   generated so the service worker can precache and serve them with zero
   connectivity (FR-OFF-01), and a nonce cannot exist for a page rendered
   at build time. Neither page performs a session check, reads a
   financial figure, or renders any server-supplied value; their only
   dynamic content is this device's own IndexedDB queue. Rationale in
   `src/lib/security/headers.ts`.
2. **The unmatched-route 404 page's hydration scripts are blocked.**
   Next.js serves that page outside the nonce path. Two fixes were tried
   against a real production server and neither worked (recorded in
   `src/app/not-found.tsx`). Exposure is nil — server-rendered content,
   one plain anchor, no data — and
   `tests/e2e/security-headers.spec.ts` asserts the limitation rather
   than skipping it, so the test fails and the note can be deleted the
   day Next.js fixes it.

The CSP browser spec is preserved and loads every screen for every role,
but full browser validation was explicitly deferred for this completion.
The non-browser suite verifies production-only HSTS without `preload`, the
strict nonce policy, fresh nonces, and the bounded static-page exception.

---

## 8. Carried to Phase 8B (environment-dependent)

- HTTP→HTTPS permanent redirect at the host (NFR-SEC-01).
- Encryption at rest for database and backups (NFR-SEC-02).
- Automated backups, retention, and a rehearsed restore (NFR-REL-01/02/03, AC-12).
- Alerting on the structured logs; uptime monitoring against `/api/health` (NFR-REL-06/07).
- Fresh `BETTER_AUTH_SECRET` and complete SMTP configuration in the production environment.
- Real-device browser verification (NFR-CMP-02) and Excel/Google Sheets export verification (NFR-CMP-03).
