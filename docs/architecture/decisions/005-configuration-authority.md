# ADR 005: Configuration authority by category

- Status: Accepted
- Date: 2026-07-15

## Decision

Use shared schemas for contracts, `artist.config.ts` for bootstrap defaults, Supabase for artist-editable runtime state, environment variables for secrets, and `setup/project-state.json` for non-secret installation status.

## Why

Every setting needs one source of truth. This separation allows runtime administration without rebuilds, reproducible initialization, safe secret handling, and portable exports.

## Consequences

Application code may not choose between conflicting sources. Artist-editable fields migrate to the database; secret fields migrate to server-only environment configuration. The complete contract lives in `docs/architecture/configuration-authority.md`.
