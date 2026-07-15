# ADR 004: One entitlement authority

- Status: Accepted
- Date: 2026-07-15

## Decision

Use one central access decision for purchases, licenses, memberships, learning, downloads, and other protected resources. Signed server-side payment events create orders and entitlements atomically. Protected delivery checks current access at request time.

## Why

Independent access logic in each module would drift and create security gaps. The shared authority and fulfillment spine gives every later module the same auditable foundation.

## Consequences

Integration Gate A must pass before dependent modules expand. Browser redirects, client state, and editable metadata never grant access. Refund, cancellation, expiry, and revocation remain auditable state changes.
