# Changelog

All notable changes to this project are documented here.

## [Unreleased]

### Added — Phase 0: Repository & Development Foundation

- Next.js (App Router) + TypeScript strict-mode project scaffold under `src/`.
- Tailwind CSS, ESLint, Prettier configured.
- Vitest (one sanity test) and Playwright (one smoke test against the
  placeholder health page) configured.
- Prisma installed with an empty schema (generator + datasource only — no
  business models yet).
- Better Auth and Zod packages installed, unconfigured.
- GitHub Actions CI running the full validation suite.
- Documentation skeletons: `docs/architecture.md`, `docs/offline-sync.md`,
  `docs/deployment.md`, `docs/testing.md`, `docs/adr/0001-technology-stack.md`.
- Placeholder locations for the forthcoming Google Stitch UI handoff:
  `docs/UI_REQUIREMENTS.md`, `docs/ui/screenshots/`, `docs/ui/stitch-export/`,
  `public/design-assets/`, `src/components/ui/`, `src/components/layout/`.
