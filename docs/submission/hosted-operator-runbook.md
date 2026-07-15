# Hosted judging operator runbook

This runbook turns the prepared local platform into a dedicated, fictional judging installation. It is an execution contract, not authorization. Every stage that creates, links, writes, deploys, shares, publishes, or promotes external state begins only after Michael records approval for that specific stage in [`submission-checklist.md`](submission-checklist.md).

The operator deploys from a clean detached worktree at the immutable candidate tag and records safe results on the ordinary evidence branch in [`hosted-evidence-record.md`](hosted-evidence-record.md). Evidence-only commits may follow the tag, but they never enter the candidate worktree. Secrets stay in provider secret stores or ignored operator environment files. Command output copied into the repository must be redacted first.

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
FINAL_TAG=[NEW_IMMUTABLE_LOCAL_CANDIDATE_TAG]
FINAL_COMMIT=[40-character commit]
EVIDENCE_COMMIT=[CURRENT DOCUMENTATION-BRANCH COMMIT]
FINAL_NAME=[approved public name]
LICENSE=[approved SPDX identifier]
HOSTED_RESOURCES_APPROVAL=[timestamp and Michael approval reference]
```

After the clean aggregate passes at the implementation `HEAD`, create a new, never-reused annotated tag and derive the runtime commit from it. The tag solves the self-reference problem of trying to write a commit's own hash inside that commit. The ordinary branch may then receive evidence-only documentation commits; `EVIDENCE_COMMIT` records that branch state and is never substituted for `FINAL_COMMIT` during build or deployment.

```text
git tag -a [NEW_IMMUTABLE_LOCAL_CANDIDATE_TAG] -m "Freeze hosted judging candidate" HEAD
git rev-parse "[NEW_IMMUTABLE_LOCAL_CANDIDATE_TAG]^{commit}"
```

Acceptance:

1. The ordinary evidence branch has an empty `git status --short` before provider execution.
2. `git rev-parse "${FINAL_TAG}^{commit}"` equals `FINAL_COMMIT`; the detached deployment worktree described in Stage 6 also has `HEAD` equal to `FINAL_COMMIT` and an empty status.
3. `npm ci`, `npm run verify`, `npm audit --audit-level=high`, and local Supabase `db lint` pass at `FINAL_COMMIT`.
4. The repository license, package metadata, README, evidence, and demo language agree at `EVIDENCE_COMMIT`.
5. Later evidence-only documentation commits remain outside the deployment worktree. Any application, configuration, migration, dependency, worker, fixture, or verification-code change requires a new complete aggregate and a new immutable candidate tag before deployment.

## Stage 1: prepare dedicated provider resources

After the resource-creation approval:

1. Create or select one empty Supabase judging project.
2. Create or select one Vercel judging project whose framework is explicitly set to **Services**.
3. Create or select one Stripe sandbox or test-mode account context.
4. Confirm the tracked `vercel.json` will create exactly the public `web` service and private `media_worker` and `document_worker` services in that single project.
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
NUXT_MEDIA_WORKER_SECRET=[GENERATED_SERVER_ONLY_BEARER_SECRET]
NUXT_PUBLIC_OAUTH_PROVIDERS=[OPTIONAL_APPROVED_ALLOWLIST]
```

Vercel generates `MEDIA_WORKER_INTERNAL_URL` and `DOCUMENT_WORKER_INTERNAL_URL` from the tracked caller-side bindings; the operator does not create or store those URLs. The worker services receive only the minimum server-only values documented in the media and document worker contracts. Provider keys never enter Vercel build logs, client runtime configuration, screenshots, or repository files.

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

The repository includes a project-bound initialization, check, and reset entrypoint. It uses the current Supabase CLI `db query --linked --file` contract to execute a single atomic PostgreSQL guard and targeted application reset. It never invokes a linked `db reset`.

Prepare private operator input from the tracked shape. Both resulting files are ignored:

```text
cp setup/hosted-accounts.example.json setup/hosted-accounts.json
chmod 600 setup/hosted-accounts.json
```

Set `projectRef` to the exact approved reference, replace all four account emails and passwords, and keep `localOnly` false. The four keys and roles are exact. Hosted emails must be unique, non-`.local` addresses. Put the dedicated Supabase URL, publishable key, and server-only secret in an ignored environment file such as `.env.hosted`; do not add Stripe or worker secrets unless another approved stage needs them.

Derive the project-bound confirmation without recording the project reference:

```text
npm run hosted:confirmation -- initialize [APPROVED_PROJECT_REF]
```

After the separate hosted-fixture initialization approval:

```text
npm run hosted:initialize -- --project-ref [APPROVED_PROJECT_REF] --accounts setup/hosted-accounts.json --env-file .env.hosted --confirm [EXACT_INITIALIZE_CONFIRMATION]
npm run hosted:check -- --project-ref [APPROVED_PROJECT_REF] --accounts setup/hosted-accounts.json --env-file .env.hosted
```

The versioned entrypoint:

1. require `--project-ref [APPROVED_PROJECT_REF]` and an exact second confirmation value derived from the same reference;
2. refuses localhost, a malformed or unlinked reference, an unexpected schema version, an existing initialization marker, an unknown marker, unexpected Auth users, and any environment with an unrecognized canonical fixture fingerprint;
3. preserve provider configuration, migration history, webhook endpoints, storage buckets, and server secrets;
4. targets only the application tables, the seven dedicated bucket contents, and the exact four fictional fixture users;
5. restore the versioned Daymark Assembly configuration, catalog, generated media, learning, video, editorial, licensing, and offering fixtures;
6. create distinct hosted owner, editor, and two-listener identities from private operator input;
7. rotate hosted fixture sessions after reset;
8. verifies canonical fixture identity, generated media hashes, public reads, required roles, storage buckets, and account count before returning success; and
9. emits only redacted JSON containing result status, version, project-reference hash, fixture hash, counts, and the session-rotation result.

`npm run test:hosted-reset` tests the same core against disposable local Supabase state. It proves target, marker, account-set, and real content-fingerprint refusals; performs clean initialization and two resets; rotates all four identities on each reset; preserves fake Stripe mappings; verifies publication, roles, and storage; and restores the ordinary local demonstration.

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

## Stage 5: prove both worker services locally

This stage creates no hosted state. Execute it at `FINAL_COMMIT` before requesting deployment approval:

```text
npm run test:unit
npm run test:media
npm run test:licensing
docker build --pull=false -f Dockerfile -t artist-owned-platform-worker-runtime:candidate .
```

Start the image once with each service command, the disposable local environment, an overridden container-reachable local Supabase URL, and a temporary invocation secret. Prove:

1. `/media/health` and `/documents/health` return only service identity and `supabase-durable` queue status.
2. Both service-qualified `/jobs/process-one` routes return 401 without the exact bearer secret.
3. An authenticated empty-queue request reaches local Supabase and returns `processed: 0, failed: 0`.
4. The ordinary CLI tests still perform real FFmpeg processing and private PDF rendering.
5. The images contain no `.env`, hosted credential, private media, or machine-specific path.

Record the two local image digests. These are local build evidence; the deployed Vercel image digests are recorded separately after the approved deployment.

## Stage 6: build and deploy an immutable Vercel preview

Vercel documents `vercel pull`, `vercel build`, and `vercel deploy --prebuilt` as the separated build/deploy path. The [current deploy reference](https://vercel.com/docs/cli/deploy) also confirms that deployment stdout is the immutable deployment URL and that production-domain assignment is a separate concern.

The tracked Services configuration deploys the Nuxt application and both worker containers together. Only `web` receives a public rewrite; caller-side bindings grant it private access to the two workers.

### First-deployment rule and separate bootstrap approval

Vercel's [default production domain record](https://vercel.com/blog/default-production-domain) states that the first deployment in every newly created project is automatically promoted to Production. This rule takes precedence over the ordinary [CLI Preview behavior](https://vercel.com/docs/projects/deploy-from-cli). Deleting that deployment returns a project with no deployment history to the same first-deployment state, so repeating `vercel deploy` or adding `--target preview` does not cross this boundary.

For a new project whose safe provider read reports `hasDeployments: false`, Stage 6 therefore requires a separate, explicit approval for one temporary Production-classified bootstrap deployment before the approved immutable Preview can exist. Preview approval alone does not authorize the bootstrap.

Michael approved an initial contract that required no assigned domain. The static artifact reached Ready, but the deployment metadata reported two automatic `.vercel.app` aliases. The operator removed the exact deployment and stopped before deploying the application, as the contract required.

The [official deploy reference](https://vercel.com/docs/cli/deploy) now resolves the terminology: `--skip-domain` overrides **Auto-assign Custom Production Domains**. The exact pinned CLI `54.21.1` implements the flag by sending `autoAssignCustomDomains: false`. It does not claim to suppress the immutable deployment URL or Vercel-managed automatic `.vercel.app` aliases. No supported CLI flag or documented deployment option found in the read-only review suppresses those platform-managed URLs.

### Revised platform-managed URL contract awaiting approval

The original no-domain contract remains blocked and must not be retried. A revised action-specific approval must accept only the following narrow behavior:

1. Generate the bootstrap in a fresh disposable directory with the repository command below. The output contains one static `noindex` page, response headers for `no-store`, CSP, framing denial, referrer denial, content sniffing denial, permissions denial, and crawler denial, plus Build Output API configuration. It contains no application code, environment value, credential, database identifier, media, or customer data.
2. Deploy it with `--prod --skip-domain`. This creates a Production-classified deployment and its immutable deployment URL, disables custom Production-domain assignment, and may create the same two Vercel-managed automatic `.vercel.app` aliases observed in the contained attempt.
3. Do not share or intentionally visit any bootstrap URL. Keep the deployment only while creating and confirming the real immutable Preview.
4. Before continuing, verify the bootstrap is the only deployment, is Ready, has exactly the expected Vercel-managed URL class, leaves project `live: false`, leaves the project alias list empty, preserves all seven Preview-only environment values, and creates no custom, branch, custom-environment, or redirect domain.
5. Remove the exact bootstrap deployment after the Preview is confirmed. Verify that the project retains only the Preview, has no current Production deployment, remains `live: false`, and still has no project alias or custom domain.
6. If any custom domain, non-`.vercel.app` alias, application payload, secret, unexpected deployment, environment-scope change, or other condition appears, remove the bootstrap immediately and stop.

Local preparation does not create provider state:

```text
npm run hosted:vercel-bootstrap -- \
  --output [FRESH_PRIVATE_BOOTSTRAP_DIRECTORY] \
  --confirm TEMPORARY_PRODUCTION_BOOTSTRAP
npm run test:vercel-bootstrap
```

Only after Michael explicitly approves the revised platform-managed URL contract, link that disposable directory to the exact guarded project and execute:

```text
cd [FRESH_PRIVATE_BOOTSTRAP_DIRECTORY]
npx vercel@[PINNED_VERSION] link --yes --project [EXACT_PROJECT_NAME]
npx vercel@[PINNED_VERSION] deploy --prebuilt --prod --skip-domain
```

Record the bootstrap deployment identifier privately so it can be removed exactly. Do not copy its URL into tracked evidence.

Observed provider result, 2026-07-15: with CLI `54.21.1`, the approved static artifact reached Ready but Vercel assigned two automatic `.vercel.app` Production aliases despite `--skip-domain`. The operator followed the initial stop rule, removed the exact deployment, verified the project returned to zero deployments and aliases, and stopped before deploying the application. The hardened revised artifact and the contract above are local preparation only; no revised provider action has been approved or executed.

After explicit approval to create one preview containing all three services:

1. Pin one reviewed Vercel CLI version for the deployment record.
2. Create a clean, private detached worktree at the immutable candidate tag, verify its exact commit, and run all remaining deployment commands from that directory:

```text
git worktree add --detach [PRIVATE_CANDIDATE_WORKTREE] "${FINAL_TAG}"
cd [PRIVATE_CANDIDATE_WORKTREE]
test "$(git rev-parse HEAD)" = "${FINAL_COMMIT}"
test -z "$(git status --short)"
npm ci
```

3. Link only the approved judging project from that candidate worktree.
4. Confirm the project framework is **Services** and configure preview environment values in Vercel's encrypted environment store.
5. Pull preview configuration, build, and deploy the exact candidate:

```text
npx vercel@[PINNED_VERSION] pull --yes --environment=preview
npx vercel@[PINNED_VERSION] build --target preview
npx vercel@[PINNED_VERSION] deploy --prebuilt --target preview
```

6. Record stdout as `IMMUTABLE_PREVIEW_URL` and inspect the deployment:

```text
npx vercel@[PINNED_VERSION] inspect [IMMUTABLE_PREVIEW_URL]
```

Acceptance:

- Deployment status is ready and identifies `FINAL_COMMIT` in metadata or the evidence record.
- The deployment contains exactly `web`, `media_worker`, and `document_worker`; neither worker has a public rewrite.
- The web service receives both generated binding URLs at runtime, and all three services share the approved server-only invocation secret.
- The preview is reachable without payment, a local machine, or an unshared Vercel login.
- `NUXT_PUBLIC_SITE_URL`, Supabase Auth redirects, Stripe return URLs, and the webhook endpoint use the exact approved HTTPS origin.
- One approved generated source tone moves `pending -> processing -> ready` through the media binding; its immutable source hash, metadata, preview, waveform, and public playback pass.
- One hosted test-mode license purchase moves its document job to `ready`; PDF text and purchaser-only delivery pass.
- Retry and expired-lease recovery pass once for each worker, with no dependency on Michael's local computer.
- `npm run health:check` with `BASE_URL` set to the preview passes.
- `npx playwright test --config playwright.cross-browser.config.ts` with `BASE_URL` set to the preview passes Chromium, Firefox, and WebKit on Linux.
- Browser-secret scanning, response headers, accessibility, viewport containment, and production performance budgets pass against the preview.

No alias, custom domain, permanent Production deployment, or production promotion is implied by this stage. The temporary first-deployment bootstrap is a separate action-specific approval and must be removed after the Preview is confirmed. If a stable production alias is later approved, validate the exact preview first and then record a separate `vercel promote [IMMUTABLE_PREVIEW_URL]` approval and result.

After the deployment evidence is recorded and no further inspection needs the detached source, remove the private candidate worktree from the ordinary evidence-branch checkout. Worktree cleanup does not change the immutable tag or deployed preview.

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

1. Derive the exact reset confirmation and run the reviewed entrypoint once:

   ```text
   npm run hosted:confirmation -- reset [APPROVED_PROJECT_REF]
   npm run hosted:reset -- --project-ref [APPROVED_PROJECT_REF] --accounts setup/hosted-accounts.json --env-file .env.hosted --confirm [EXACT_RESET_CONFIRMATION]
   ```

   Save only its redacted JSON result.

2. Sign in with all four hosted identities and verify role boundaries.
3. Create representative purchase, membership, licensing, learning, library, telemetry, and contact state.
4. Run the same exact reset command a second time under the recorded rehearsal approval.
5. Compare the two reset hashes and expected row/media counts.
6. Run the complete judge route after the second reset.
7. Run `npm run hosted:check` and confirm Stripe mappings, webhook configuration, provider secrets, and private worker bindings remain connected.

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
