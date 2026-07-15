# Connect artist-owned commerce

The repository works locally without Stripe. In demonstration mode, published one-time, recurring, and free offerings use a clearly labeled simulation that enters the same database fulfillment functions as verified provider events. It never charges a card.

Connecting a Stripe sandbox is an optional, approval-gated setup action. Use an account owned by the artist or artist-led organization. Keep product names, descriptions, access targets, prices, and publication state in this application; Stripe product and price IDs are provider mappings.

## Prepare the Stripe sandbox

1. In Stripe test mode, create the one-time and recurring products and prices the artist has approved.
2. Open `/admin/commerce` as the installation owner. Enter both the matching Stripe product ID and price ID for each Stripe offering. The application rejects half-complete mappings.
3. Put the test secret key in `NUXT_STRIPE_SECRET_KEY`. Never expose it through public runtime configuration or commit it.
4. Configure a webhook endpoint at `/api/webhooks/stripe` and put its signing secret in `NUXT_STRIPE_WEBHOOK_SECRET`.
5. Subscribe the endpoint to `checkout.session.completed`, `checkout.session.expired`, `invoice.paid`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, and `refund.updated`.
6. Enable and configure Stripe's customer portal for the sandbox if customers should manage subscriptions there.

The pinned Stripe Node SDK uses API version `2026-06-24.dahlia`. Keep the webhook endpoint on that version unless the application and its event tests are deliberately upgraded together.

For local webhook forwarding with the official Stripe CLI, run:

    stripe listen --forward-to http://127.0.0.1:3000/api/webhooks/stripe

Use the signing secret printed by that local command only for the local forwarded endpoint. A Dashboard-managed endpoint has a different signing secret.

## Verify before a hosted test

Run:

    npm run setup:check
    npm run verify:commerce
    npm run test:e2e -- tests/e2e/commerce.spec.ts

The setup check reports only `PASS`, `ACTION REQUIRED`, or `FAIL`; it never prints key values. `verify:commerce` proves replay idempotency, mismatched-replay denial, subscription expiry, full and partial refunds, private failure records, raw-body signature verification, secret scanning, and account isolation.

Complete one Stripe test-mode purchase and one sandbox membership. Confirm that the browser return page remains pending until the webhook is stored, the account shows exactly one entitlement for a replayed event, the protected download works only for its owner, and portal cancellation changes future membership access without affecting permanent purchases.

## Recover a failed verified event

Verified events that cannot be fulfilled create a redacted operational record containing only event identity, object identity, type, error code, attempt count, and timestamps. The owner can use `/admin/commerce` to ask the server to retrieve that event from Stripe and replay it. Raw payment payloads, card data, email addresses, keys, and signing secrets are never stored in the failure record.

Stripe retries remain safe because provider event IDs, orders, subscriptions, refunds, and entitlement sources are unique and reconciled transactionally.

## Live mode boundary

Do not copy sandbox mappings into live mode, enable live keys, or create live resources as part of routine setup. Live Stripe operation is a separate business and external-state decision requiring Michael's explicit approval. The Build Week judge path uses local simulation or Stripe test mode only.
