# Commerce environment and Stripe Test Mode

## One commerce domain

`a-op` uses one connected commerce domain for checkout, orders, memberships, subscriptions, licensing, credits, entitlements, customer history, and protected delivery. Domain records and state transitions do not split into a demonstration product and a production product.

Each deployment selects an explicit commerce capability in source-controlled deployment code. The Sites adapter is permanently `stripe-test-simulation`. It has no live capability and no administration action or ordinary runtime setting that can add one.

## Sites boundary

Current official [Sites guidance](https://help.openai.com/en/articles/20001339) states that Sites must not process payment-card data or enable financial transactions. The Build Week installation exercises simulated commerce through Stripe Test Mode only. Stripe test keys create simulated Stripe objects; Stripe states that test environments accept no real payment methods and make no real charges.

Sites describes every deployed Site URL as a production URL. That describes the hosted deployment, not the Stripe environment. Every Build Week deployment URL remains permanently `stripe-test-simulation` and cannot accept real payment or move money.

The Sites application:

- accepts only `pk_test_` publishable keys and `sk_test_` secret keys;
- rejects `pk_live_`, `sk_live_`, `rk_live_`, and any other recognized live credential during setup, preflight, build validation, and runtime use;
- creates Stripe-hosted Test Checkout sessions, sends the exact no-real-payment notice through Stripe's supported [`custom_text.submit.message`](https://docs.stripe.com/api/checkout/sessions/create#checkout_session_create-custom_text-submit-message) parameter beside the confirmation button, and redirects the customer to Stripe;
- contains no card-number, expiry, security-code, payment-method-token, or equivalent payment-entry field;
- states throughout checkout and return that Stripe Test Mode accepts no real payment;
- verifies the Stripe signature over the unmodified webhook body before parsing or writing application state;
- rejects every signed event whose `livemode` value is not exactly `false`;
- treats failed, expired, and cancelled checkout as non-fulfilling state that creates no entitlement;
- stores `stripe_environment = 'test'` and `livemode = 0` with checkout sessions, orders, memberships, subscriptions, licenses, credit-ledger entries, fulfillment events, and every commerce-created entitlement; and
- labels test records in customer and administration views.

The webhook signing secret is server-managed. Its `whsec_` prefix does not establish the Stripe environment, so the verified event's `livemode` value and the test-only API-key boundary both remain mandatory.

## Fulfillment contract

A checkout request resolves the current signed-in application customer and a server-owned product definition. The server creates the Stripe Test Checkout session with opaque application identifiers in allowlisted metadata and stores a pending test checkout record. Browser input cannot choose a customer, price, entitlement, credit amount, membership state, subscription state, license terms version, or protected resource.

Only a verified, test-mode fulfillment event can create or advance an order. The Stripe event ID is unique. One atomic operation records the event, creates or reuses the order, applies the exact product fulfillment, creates the resulting entitlement or credits, and writes a redacted audit receipt. Replaying the same event returns the existing result. Reusing an identifier with different verified facts fails without changing state.

The return page reads application-owned order state. A successful browser redirect does not fulfill an order. A cancelled redirect, missing webhook, invalid signature, live-mode event, or failed Stripe status creates no access.

## Build Week judge journey

1. A visitor signs in and becomes an active application customer.
2. The customer selects a track, license, membership, subscription, or other active test product.
3. `a-op` creates a Stripe-hosted Test Checkout session from server-owned product and customer facts.
4. The customer completes the simulation with a Stripe-provided test payment method.
5. Stripe sends a signed test webhook to `a-op`.
6. `a-op` verifies the signature and records the event and order exactly once.
7. The verified event creates the exact entitlement, credits, membership, subscription, or license defined by the product snapshot.
8. The customer returns to `a-op` and sees the application-owned result in their account.
9. Protected content becomes available only when the resulting entitlement passes `decideAccess`.
10. Administration shows the test order, customer relationship, access history, and redacted operational evidence.

## Data minimization

`a-op` stores only the Stripe identifiers and non-card facts required to reconcile the simulation: test environment, `livemode = 0`, event ID and type, checkout-session ID, test customer ID when needed, application product ID, application customer ID, lifecycle status, amounts and currency used for the simulation, timestamps, and redacted error category.

React input, D1, logs, telemetry, audit events, exports, and diagnostics never store or echo card fields, client secrets, payment method details, billing-address payloads, raw webhook bodies, API keys, webhook secrets, or unrestricted Stripe objects.

## Visible status

Test-only status appears where someone starts a simulated checkout and on records created by the test adapter. General account, catalog, return, and administration pages do not repeat a persistent environment notice. Test records remain visually and structurally distinguishable from any future production records.

## Future live capability

The open-source commerce domain can support a compatible deployment environment that permits real transactions. Activating that capability requires a fresh check of the chosen environment's rules and technical support, a deliberate source-controlled deployment adapter, live-specific validation, separate credentials and webhooks, migration review, security verification, and artist approval.

Changing Sites environment values, sending a live webhook, or using an administration control can never activate live commerce in the Sites deployment.

## Required verification

- A fresh Sites installation resolves to `stripe-test-simulation` and missing test credentials produce a clear setup failure.
- Every recognized live credential produces a hard failure in preflight, build verification, and runtime initialization.
- Repository, client bundle, logs, telemetry, audit output, and D1 contain no secret or payment-card field.
- A valid test key can create only a Stripe Test Checkout session.
- Invalid webhook signatures and signed `livemode = true` events create or modify zero application state, preserve all pre-existing records, and produce no event, order, entitlement, credit, membership, subscription, license, telemetry, or audit row.
- One signed `livemode = false` completion creates the exact order and fulfillment once; exact replay creates zero duplicates.
- Failed, expired, and cancelled checkout creates no access.
- The return page waits for or displays application-owned fulfillment state and never trusts query parameters as proof of completion.
- Customer and administration surfaces show Test Mode and the resulting simulated relationship, access, and history.
- Protected delivery becomes available only through the central access contract after verified fulfillment.
