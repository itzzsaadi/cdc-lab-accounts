# `src/components/ui`

Reusable, presentation-only UI primitives translated from the Google
Stitch design (`docs/ui/stitch-export/`, `docs/UI_REQUIREMENTS.md`) — built
in Phase 3A: `Button`, `TextInput`, `Select`, `Checkbox`, `Card`, `Table`
(`Table`/`Thead`/`Tbody`/`Tr`/`Th`/`Td`), `Badge`, `Alert`, `Modal` (native
`<dialog>`), `EmptyState`, `LoadingSkeleton`, `Avatar` (initials-based, no
external photo).

None of these carry business logic — they take data and callbacks as
props. Business-specific variants (a real funding-source toggle, a real
sync-state badge, etc.) are built in the phase that needs them, on top of
these generic primitives, not ahead of time.
