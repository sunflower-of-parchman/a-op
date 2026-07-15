# ADR 003: Consolidated Build Week schema

- Status: Accepted
- Date: 2026-07-15

## Decision

Create a clean, consolidated Supabase schema for the reusable platform. Do not copy the private reference application's historical migration chain.

## Why

New adopters need a legible current-state data model. Production-specific repair history, private assumptions, and obsolete transitions would obscure the platform and make security review harder.

## Consequences

Reference concepts must be re-evaluated and represented in new migrations. Every exposed table receives explicit privileges and RLS. Migration files are created with the installed Supabase CLI and verified against a disposable local database.
