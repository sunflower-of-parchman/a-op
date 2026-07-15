# Stripe runbook

## Supported modes

The default local mode is a clearly labeled simulation. It exercises application-owned products, prices, orders, subscriptions, refunds, licensing, and entitlements without contacting Stripe or charging a card. Stripe test mode is an approval-gated external proof. Live mode is a separate later approval and is never required for development or judging.

Codex may run `npm run verify:commerce`, `npm run verify:licensing`, and the raw-body signature test locally. It may prepare product mappings, webhook paths, and test commands. Creating or changing a Stripe account, products, prices, endpoints, customer portal, or credentials changes external state and requires explicit approval. A connected payment tool, Stripe CLI, or dashboard may perform the approved step.

## Test-mode checkpoint

Follow `docs/artist/commerce.md` and `docs/artist/licensing.md`. Before action, show the artist the account, test-mode label, objects to create, callback origins, and that no live card will be used. Store `sk_test_...` and `whsec_...` values only in ignored `.env` or the deployment secret store. Never print them.

After approval, configure `/api/webhooks/stripe`, complete one test download, membership, license, refund, and portal cancellation, and verify repeated delivery creates only one fulfillment result. The browser return page is informational; only a verified server event can grant access.

Use `/admin/commerce` for redacted failed-event recovery. Reconcile the provider event, order, subscription or refund, entitlement, and operational record. Recovery replays the same verified provider event through the supported route; it does not insert entitlements or edit payment facts by hand.

Live mode requires a fresh approval that names the account, products, prices, tax and legal readiness, webhook endpoint, customer communication, and rollback plan. Test credentials and live credentials must never share an environment.
