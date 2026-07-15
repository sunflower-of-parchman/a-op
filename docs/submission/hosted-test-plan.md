# Hosted judging plan

This is the complete plan for a free, resettable judging environment. It contains no credentials and performs no external action. Deployment, provider connection, test-account creation, credential sharing, and public promotion each remain separate approval gates for Michael.

## Intended topology

- One Vercel project running the committed Nuxt Node build.
- One dedicated Supabase judging project containing only Daymark Assembly and fictional test identities.
- One Stripe account in test mode with dedicated judging products, prices, webhook endpoint, and customer portal configuration.
- One container deployment of the repository's shared media worker connected only to the judging Supabase project.
- One private document worker using the pinned renderer environment.
- An optional project-owned subdomain. DNS is not required if the Vercel deployment URL is approved for judging.

No production Sound for Movement service, media, customer, domain, or credential enters this environment.

## Redacted connection record

The private handoff records values in this shape. Values stay in the approved provider secret stores and private judge instructions.

```text
PUBLIC_SITE_URL=[REDACTED_HTTPS_URL]
SUPABASE_URL=[REDACTED_HTTPS_URL]
SUPABASE_ANON_KEY=[REDACTED]
SUPABASE_SERVICE_ROLE_KEY=[REDACTED]
STRIPE_SECRET_KEY=[REDACTED_TEST_KEY]
STRIPE_WEBHOOK_SECRET=[REDACTED_TEST_SECRET]
NUXT_SESSION_SECRET=[REDACTED]
MEDIA_WORKER_DEPLOYMENT=[REDACTED_HTTPS_URL_OR_SERVICE]
OWNER_EMAIL=[REDACTED_JUDGE_FIXTURE]
OWNER_PASSWORD=[SHARED_PRIVATELY]
CUSTOMER_EMAIL=[REDACTED_JUDGE_FIXTURE]
CUSTOMER_PASSWORD=[SHARED_PRIVATELY]
```

The public repository and demo video must never display those values. The final private judging note should include only the site URL, test identities, test-mode notice, and support path required by Devpost.

## Approval-gated preparation

1. Michael approves creation or use of the dedicated Supabase, Vercel, Stripe test, and worker resources.
2. Apply the tracked migrations to the empty judging database and run the clean schema checks.
3. Insert only the approved Daymark Assembly assets from [`content/demo/assets.json`](../../content/demo/assets.json).
4. Create dedicated hosted owner, editor, and two customer fixtures. These must differ from the local `.local` identities.
5. Map application products and prices to Stripe test-mode identifiers. Confirm the Dashboard remains in test mode.
6. Register the webhook and prove signature verification, replay idempotency, one-time purchase, membership, cancellation, refund, license issue, and private document delivery.
7. Deploy the shared media worker container. Upload one approved source tone through hosted administration and prove `queued -> processing -> ready`, waveform creation, and public preview playback.
8. Configure only approved OAuth and email paths. The judging route does not require OAuth or outbound email.
9. Deploy the exact reviewed commit to Vercel and run setup checks, policy tests, browser-secret scans, production budgets, and the judge route against that URL.
10. Run Supabase security and performance advisors, record the dated results, and resolve every new actionable project finding.

## Judge route

The hosted route follows [`judging-guide.md`](judging-guide.md). It never uses a live card. A judge can browse, listen, sign in, complete a Stripe test-mode checkout, receive the resulting entitlement, retrieve a private license document, continue a protected lesson, and inspect the administration workspace with the private fixture credentials.

The local payment simulation remains visibly labeled and available as a fallback proof. It uses the same durable order and entitlement spine while contacting no payment provider.

## Reset and availability

The hosted database must be a disposable judging project. Reset is performed only by an approved operator through a versioned, hosted-safe seed procedure that refuses any unrecognized project reference. It restores Daymark Assembly, rotates fixture sessions, clears fictional transaction state, and verifies the expected hashes without touching provider credentials or webhook configuration.

Before access is shared:

- Run the reset twice and confirm idempotency.
- Run the full judge route after the second reset.
- Confirm the environment remains available through August 5, 2026 at 6:00 PM Mountain.
- Confirm there is no payment method requirement, trial gate, usage charge to the judge, or dependency on Michael's local computer.
- Store the recovery owner, provider project identifiers, and reset command privately.

The hosted-safe reset procedure and deployment have not been created or run because they change external state. Their implementation begins only after Michael approves the specific judging resources.

## Final evidence

Record the approved URL, deployment commit, provider modes, worker proof, Stripe event identifiers, advisor results, reset rehearsal, browser results, test identities, availability window, and Michael's publication approvals in the submission checklist. Redact all secrets, customer-like identifiers, and provider credentials.
