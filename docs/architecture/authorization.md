# Authentication, authorization, and fulfillment

## Identity and roles

Supabase Auth establishes identity. Every new account receives only the `customer` role through the database trigger in `20260715010000_authority_foundation.sql`. A service-only bootstrap function grants the first explicit owner; owner and editor roles are never inferred from email, signup order, or user-editable metadata.

The `app_roles` table is the current role authority. `owner` can maintain installation configuration and content, `editor` can maintain content and media, and `customer` can read only the account records belonging to that identity. Server routes verify the current Supabase user before loading server-controlled roles.

## Database boundaries

Every exposed table has Row Level Security enabled and forced, explicit Data API privileges, and named policies. Publication tables expose only published rows to anonymous users. Account and commerce tables scope customer reads to `auth.uid()`. Browser roles receive no write privilege on payment events, orders, order items, entitlements, or download records.

The `private` schema contains small policy helpers and is absent from the exposed Data API schemas. The public `bootstrap_owner`, `decide_access`, and `process_simulated_payment_event` functions are revoked from anonymous and authenticated roles and executable only by the service role.

## Storage boundaries

`artwork` and `preview-media` are public buckets. `source-audio`, `downloads`, `license-documents`, `lesson-media`, and `administrative` are private. Owners and editors may maintain managed storage through policies; customers receive no permanent private object path.

The protected download route verifies the user, resolves the private media object, calls the central access decision, creates a 60-second signed URL, and records successful entitled delivery. The browser receives neither the service key nor a permanent storage URL.

## Fulfillment contract

`process_simulated_payment_event` is the production-shaped local fulfillment entrypoint. It validates the event against a published product and active price, stores the signed payment fact, creates one order and order item, grants one entitlement, and marks the event complete in one database transaction. Named unique constraints make exact replays idempotent. A replay whose customer, product, amount, or currency differs from the original is rejected.

`decide_access` returns an allow or denial reason and the matching entitlement identifier. Integration Gate A proves one public preview, four deliveries of one event, one resulting order, one entitlement, one allowed signed delivery, and one denied customer.

## Local verification identities

`content/demo/accounts.json` contains explicitly fictional local-only accounts. `npm run setup:local` creates them after every local reset. They exist to exercise anonymous, customer, editor, owner, and service-role policies without connecting an external account. Hosted credentials are a separate approval-gated setup action and must never reuse these fixture passwords.
