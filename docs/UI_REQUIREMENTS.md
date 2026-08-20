# UI_REQUIREMENTS.md — CDC Lab Accounts & Asset Management System

## Status: awaiting handoff

The complete application UI/UX has already been designed in **Google Stitch**.
That design is the authoritative visual reference for this project — it is
not to be redesigned, reinterpreted, or guessed at in code. This document is
a skeleton, created in Phase 0, waiting to be filled in once the Stitch
exports, screenshots, assets, and design details are provided.

Nothing below is real content yet. Do not treat any placeholder text in this
file as a design decision.

## Where the source material will live

| Location                 | Contents                                                                                 |
| ------------------------ | ---------------------------------------------------------------------------------------- |
| `docs/ui/stitch-export/` | Raw Stitch export files (HTML/CSS/JSON/whatever Stitch produces)                         |
| `docs/ui/screenshots/`   | Reference screenshots of every screen, for quick visual lookup                           |
| `public/design-assets/`  | Static assets (icons, images, fonts) extracted from the Stitch export, served by the app |
| `src/components/ui/`     | Primitive/reusable components translated from the Stitch design                          |
| `src/components/layout/` | Structural/layout components translated from the Stitch design                           |

## Sections to be completed once the Stitch handoff arrives

- **Screens inventory** — one entry per screen/route, mapped to the role
  (Operator/Partner/Admin) and functional requirement(s) it serves.
- **Design tokens** — colors, typography, spacing, and any other tokens the
  Stitch export defines, to be reflected in the Tailwind configuration
  without altering their visual identity.
- **Component inventory** — every distinct reusable component the design
  uses, mapped to `src/components/ui/` or `src/components/layout/`.
- **Responsive behavior** — how each screen adapts across desktop, tablet,
  and phone, per NFR-USE-07.
- **Accessibility notes** — anything the Stitch design specifies or implies
  about accessibility, to be preserved during implementation.

## Governing rules

- The Stitch design is authoritative for visual identity. No component in
  `src/components/` is implemented from assumptions.
- This document, once filled in, becomes a supporting reference alongside
  `docs/SRS.md` (functional requirements) and `docs/PROJECT_PLAN.md`
  (implementation phasing) — it does not override either.
