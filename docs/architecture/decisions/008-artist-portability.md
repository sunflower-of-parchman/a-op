# ADR 008: Artist ownership includes verified portability

- Status: Accepted
- Date: 2026-07-15

## Decision

Implement versioned artist export, export verification, media inventory, database and customer-data procedures, redacted service connection state, and restore checks as product capabilities.

## Why

Ownership requires a practical path away from the current hosting arrangement. Repository access alone does not prove that the artist can recover content, configuration, and media relationships.

## Consequences

Exports exclude secrets and permanent signed URLs. Large media may remain separately stored when the export includes hashes and a verified retrieval path. Restore tests run against a disposable local installation.
