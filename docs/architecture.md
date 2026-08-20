# Architecture Overview

Status: skeleton, written in Phase 0. To be completed as the system is built.

This document will describe, once there is an architecture to describe:

- The overall system shape (Next.js App Router, server/client boundary,
  where domain logic lives).
- How the role model (`Operator`/`Partner`/`Admin`, `CLAUDE.md` §15/§16) is
  enforced at the server layer.
- How the database, domain logic, and API layers are organized (see
  `CLAUDE.md` §6 for the planned directory structure).
- Key architectural decisions — see `docs/adr/` for the detailed record of
  each one.

See `docs/PROJECT_PLAN.md` for the phase-by-phase implementation sequence
this document will track.
