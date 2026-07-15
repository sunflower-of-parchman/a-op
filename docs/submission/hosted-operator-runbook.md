# Hosted judging operator runbook

This runbook turns the prepared local platform into a dedicated, fictional judging installation. It is an execution contract, not authorization. Every stage that creates, links, writes, deploys, shares, publishes, or promotes external state begins only after Michael records approval for that specific stage in [`submission-checklist.md`](submission-checklist.md).

The operator works from one reviewed commit and records safe results in [`hosted-evidence-record.md`](hosted-evidence-record.md). Secrets stay in provider secret stores or ignored operator environment files. Command output copied into the repository must be redacted first.

## Fixed boundaries

- Use only dedicated Build Week resources containing Daymark Assembly and hosted fixture identities.
- Do not connect Sound for Movement production services, media, accounts, customers, domains, or credentials.
- Keep Stripe in a sandbox or test mode. No live card, live price, or live webhook is accepted.
- Keep the first Vercel deployment on its immutable preview URL. Production aliasing, a custom domain, and `vercel promote` are separate approvals.
- Apply only tracked forward Supabase migrations. Never run `supabase db reset --linked` or `supabase db reset --db-url`.
- Do not copy the local `.local` fixture credentials into a hosted installation.
- Store only redacted resource references, result counts, timestamps, commit hashes, and test identifiers in the repository.
- Stop at the first unexplained mismatch. Record the failure before any retry or repair.

## Stage 0: freeze and authorize the candidate

Required record:

```text
FINAL_COMMIT=[40-character commit]
FINAL_NAME=[approved public name]
LICENSE=[approved SPDX identifier]
HOSTED_RESOURCES_APPROVAL=[timestamp and Michael approval reference]
```

Acceptance:

1. `git status --short` is empty.
2. `git rev-parse HEAD` equals `FINAL_COMMIT`.
3. `npm ci`, `npm run verify`, `npm audit --audit-level=high`, and local Supabase `db lint` pass at that commit.
4. The repository license, package metadata, README, evidence, and demo language agree.
5. No later commit enters the deployment without a new local aggregate and an updated final commit record.

## Stage 1: prepare dedicated provider resources

After the resource-creation approval:

1. Create or select one empty Supabase judging project.
2. Create or select one Vercel judging project.
3. Create or select one Stripe sandbox or test-mode account context.
4. Create one media-worker service and one document-worker service connected only to the judging Supabase project.
5. Record safe provider references privately and add only redacted suffixes or hashes to the evidence record.
6. Confirm expected cost and free judge access before provisioning any paid capacity.

Required private environment shape:

```text
NUXT_PUBLIC_SITE_URL=[IMMUTABLE_PREVIEW_URL_AFTER_DEPLOYMENT]
NUXT_PUBLIC_SUPABASE_URL=[DEDICATED_PROJECT_URL]
NUXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=[PUBLIC_PROJECT_KEY]
NUXT_SUPABASE_SECRET_KEY=[SERVER_ONLY_SECRET]
NUXT_PUBLIC_DEMO_MODE=false
NUXT_STRIPE_SECRET_KEY=[TEST_OR_SANDBOX_SECRET]
NUXT_STRIPE_WEBHOOK_SECRET=[TEST_OR_SANDBOX_WEBHOOK_SECRET]
NUXT_PUBLIC_OAUTH_PROVIDERS=[OPTIONAL_APPROVED_ALLOWLIST]
```

The worker services receive only the minimum server-only values documented in the media and document worker contracts. Provider keys never enter Vercel build logs, client runtime configuration, screenshots, or repository files.

## Stage 2: link and migrate Supabase

Supabase's current CLI contract requires a linked project for remote migration operations and supports a dry run before `db push`. The operator follows the [official `db push` reference](https://supabase.com/docs/reference/cli/supabase-db-push).

After the link/migration approval:

```text
npx supabase link --project-ref [APPROVED_PROJECT_REF]
npx supabase migration list --linked
npx supabase db push --linked --dry-run
```

The operator compares the dry run with `supabase/migrations/`. If the plan contains an unexpected migration, reset, repair, drop, or unrelated schema, stop.

Only after the dry-run result is recorded and approved:

```text
npx supabase db push --linked
npx supabase migration list --linked
npx supabase gen types --linked --lang typescript --schema public
npx supabase db lint --linked --schema public,private --level error --fail-on error
```

Acceptance:

- Remote migration history contains every tracked migration exactly once.
- Generated public types match `shared/types/database.ts` after normalization.
- `public` and `private` schema lint has no error-level findings.
- Anonymous publication, owner/editor/customer isolation, forced RLS, explicit grants, and all seven storage boundaries pass against the hosted project.
- No local demonstration reset command was used against the linked project.

## Stage 3: install fictional content and hosted identities

This stage uses a project-specific hosted seed entrypoint created after the approved project reference and hosted identity domains are known. The entrypoint must:

1. require `--project-ref [APPROVED_PROJECT_REF]` and an exact second confirmation value derived from the same reference;
2. refuse localhost, an unknown reference, a project without the expected installation marker, and any environment with an unrecognized data fingerprint;
3. preserve provider configuration, migration history, webhook endpoints, storage buckets, and server secrets;
4. delete only the documented fictional transaction, progress, telemetry, contact, and fixture-user state;
5. restore the versioned Daymark Assembly configuration, catalog, generated media, learning, video, editorial, licensing, and offering fixtures;
6. create distinct hosted owner, editor, and two-listener identities from private operator input;
7. rotate hosted fixture sessions after reset;
8. verify expected row counts, stable IDs, media hashes, and public reads before returning success; and
9. emit a redacted JSON result suitable for the evidence record.

The project-specific reference and identity input are unavailable before resource approval, so this entrypoint is generated and locally reviewed at this stage. Its first execution requires a separate reset approval.

Acceptance:

- Daymark Assembly is the only artist identity.
- Hosted identities differ from the tracked `.local` accounts.
- Fixture passwords appear only in the approved private handoff.
- Public media hashes match `content/demo/assets.json` or the documented hosted derivative ledger.

## Stage 4: connect Stripe test mode

Use Stripe's [test environments](https://docs.stripe.com/testing), [webhook guidance](https://docs.stripe.com/webhooks), and [customer portal guidance](https://docs.stripe.com/customer-management). Record provider identifiers only as redacted suffixes or hashes.

After Stripe test-resource approval:

1. Confirm the Dashboard shows sandbox or test mode.
2. Create the one-time download, monthly membership, and licensing prices required by the fictional offerings.
3. Save their mappings through the owner administration surface.
4. Register the exact hosted `/api/webhooks/stripe` endpoint and only the required event types.
5. Store the signing secret server-side.
6. Enable customer-portal cancellation for the judging configuration.

Acceptance journeys:

1. One-time purchase creates one Checkout session, one verified event, one order, and one entitlement.
2. Re-delivering the same signed event does not duplicate any durable record.
3. A second listener receives 403 for the first listener's protected file.
4. Membership activation grants time-bound access; portal cancellation and the resulting webhook remove only time-bound access.
5. Full and partial refund paths preserve auditable facts and apply the documented access result.
6. License Checkout freezes the visible terms and price, issues one private document, and grants it only to the purchaser.
7. The webhook recovery view exposes no raw secret or unredacted payload.

## Stage 5: deploy and prove both workers

After worker deployment approval:

1. Deploy the exact `workers/media/Dockerfile` image from `FINAL_COMMIT`.
2. Deploy the exact `workers/documents/Dockerfile` image from `FINAL_COMMIT`.
3. Record image digests and safe service references.
4. Upload one approved generated source tone through hosted administration.
5. Observe one media job move `queued -> processing -> ready`.
6. Verify source immutability, metadata, preview, waveform, and public playback.
7. Complete one hosted license purchase and observe one document job reach `ready`.
8. Verify the private PDF text and purchaser-only delivery.
9. Run retry and expired-lease recovery once for each worker.

Acceptance requires a digest-matched worker, durable job history, no unresolved failure, and no dependency on Michael's local computer.

## Stage 6: build and deploy an immutable Vercel preview

Vercel documents `vercel pull`, `vercel build`, and `vercel deploy --prebuilt` as the separated build/deploy path. The [current deploy reference](https://vercel.com/docs/cli/deploy) also confirms that deployment stdout is the immutable deployment URL and that production-domain assignment is a separate concern.

After Vercel project/deployment approval:

1. Pin one reviewed Vercel CLI version for the deployment record.
2. Link only the approved judging project.
3. Configure preview environment values in Vercel's encrypted environment store.
4. Pull preview configuration, build, and deploy the exact candidate:

```text
npx vercel@[PINNED_VERSION] pull --yes --environment=preview
npx vercel@[PINNED_VERSION] build
npx vercel@[PINNED_VERSION] deploy --prebuilt
```

5. Record stdout as `IMMUTABLE_PREVIEW_URL` and inspect the deployment:

```text
npx vercel@[PINNED_VERSION] inspect [IMMUTABLE_PREVIEW_URL]
```

Acceptance:

- Deployment status is ready and identifies `FINAL_COMMIT` in metadata or the evidence record.
- The preview is reachable without payment, a local machine, or an unshared Vercel login.
- `NUXT_PUBLIC_SITE_URL`, Supabase Auth redirects, Stripe return URLs, and the webhook endpoint use the exact approved HTTPS origin.
- `npm run health:check` with `BASE_URL` set to the preview passes.
- `npx playwright test --config playwright.cross-browser.config.ts` with `BASE_URL` set to the preview passes Chromium, Firefox, and WebKit on Linux.
- Browser-secret scanning, response headers, accessibility, viewport containment, and production performance budgets pass against the preview.

No alias, custom domain, or production promotion is implied by this stage. If a stable production alias is later approved, validate the exact preview first and then record a separate `vercel promote [IMMUTABLE_PREVIEW_URL]` approval and result.

## Stage 7: provider and application verification

Run Supabase's automatic Security and Performance Advisors and rerun them after every fix. The [official advisor guide](https://supabase.com/docs/guides/database/database-advisors) defines these as separate database checks.

```text
npx supabase db advisors --linked --type all --level info --fail-on warn
```

Acceptance:

- No unresolved error or warning is silently waived.
- Every informational or intentionally accepted result has a written rationale and exact affected object.
- Application diagnostics contain no credential, raw session, private email, local URL, or provider secret.
- Optional OAuth remains disabled unless a provider was separately approved and its exact callback succeeds.
- Outbound email remains disabled unless separately approved.

## Stage 8: reset and judge rehearsal

After the reset execution approval:

1. Run the project-specific hosted reset once and save the redacted JSON result.
2. Sign in with all four hosted identities and verify role boundaries.
3. Create representative purchase, membership, licensing, learning, library, telemetry, and contact state.
4. Run the same reset a second time.
5. Compare the two reset hashes and expected row/media counts.
6. Run the complete judge route after the second reset.
7. Confirm Stripe mappings, webhook configuration, provider secrets, and worker deployments remain connected.

Acceptance requires two idempotent reset passes, a complete post-reset judge route, rotated fixture sessions, preserved provider configuration, and zero private reference data.

## Stage 9: availability and handoff

Before any URL or credentials are shared:

1. Confirm free access through August 5, 2026 at 6:00 PM Mountain.
2. Confirm the environment has no trial expiry or judge payment requirement.
3. Confirm recovery ownership and spend limits privately.
4. Prepare a private handoff containing only the approved URL, fixture identities, test-mode notice, and support path.
5. Perform one final credential and private-data review.

Repository access, judge credential sharing, video publication, production promotion, and Devpost submission each retain their separate approval rows.

## Failure and rollback rules

- A migration mismatch stops before `db push`.
- A failed immutable preview remains available for evidence and is never promoted.
- A failed Stripe journey keeps its provider event and application recovery record for diagnosis.
- A worker failure keeps the immutable source and durable job record; retry uses the existing lease/retry contract.
- A reset fingerprint mismatch stops before deletion.
- A secret exposure rotates the affected credential, invalidates exposed sessions, removes the unsafe artifact from the submission package, and repeats the complete verification stage.
- Rollback changes the judging environment only after explicit approval and records both source and destination deployments.
