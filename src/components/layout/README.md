# `src/components/layout`

Structural/layout components translated from the Google Stitch design.
Built in Phase 3A: `AuthenticatedShell` (fetches the current user, wraps
`(app)` route-group pages), `ShellChrome` (client-side drawer/menu state),
`Sidebar`, `Header`, `UserMenu` — the sidebar/header chrome every
Operator/Partner/Admin screen shares from here on. `AuthCard` (Phase 2)
is the equivalent shared shell for the pre-authentication screens
(Sign In, Forgot Password, Reset Password, Accept Invitation).

The mobile navigation drawer and the user menu are both native `<dialog>`
elements — see `docs/adr/0004-phase-3a-shared-shell.md` for why.
