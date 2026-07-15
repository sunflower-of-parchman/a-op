# ADR 001: One artist per deployment

- Status: Accepted
- Date: 2026-07-15

## Decision

One installation represents one artist or artist-led organization. It may have multiple owners and editors plus many customer accounts. Unrelated artists use separate deployments and connected service accounts.

## Why

This model gives the artist direct ownership of branding, data, customer relationships, infrastructure, and portability. It also makes authorization and operations understandable to an artist working with Codex.

## Consequences

The schema does not need a marketplace tenant on every record. Installation-level configuration belongs to one artist. A future hosted multi-artist service would require a separate architecture and business decision.
