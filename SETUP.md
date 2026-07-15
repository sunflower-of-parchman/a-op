# Set up your artist-owned site

Open this repository with Codex and begin with:

> Help me set up my artist-owned site.

Codex will read the repository instructions, check the local environment, explain what can be done locally, and walk through the decisions that belong to you.

You will be asked about:

- Your artist or organization name and the people you serve.
- Your visual identity, writing, navigation, and pages.
- The music, artwork, video, and learning material you want to publish.
- Listening, downloads, memberships, licensing, and teaching.
- Your Supabase, Stripe, hosting, domain, OAuth, and email intentions.
- Privacy, telemetry, portability, and the external steps you want to approve.

Codex prepares a proposal before changing the project. You review the proposal and its diff. Nothing is applied until you approve it. Publishing, paid resources, live payments, DNS, and other consequential external actions always require a separate explicit approval.

Your setup proposal is an ignored local working file. It may contain approved public identity and content decisions, but it must never contain passwords, API keys, customer information, private task metadata, or credentials.

## Start the local demonstration

Install Node 24.14, npm 11, and Docker Desktop. Then run:

    npm ci
    npm run setup:preflight
    npm run setup:local
    npm run setup:check
    npm run dev

The setup script operates only on the local Supabase stack. It applies the tracked migration, inserts the fictional Daymark Assembly configuration, verifies anonymous access to the published configuration, generates database types, and writes local credentials to ignored `.env` without printing their values.

The development site opens at `http://127.0.0.1:3000`. Supabase API and local mail URLs are reported after setup. Rerunning `setup:local` is supported.

The local demonstration accounts are listed in `content/demo/accounts.json`. They are fictional, local-only verification identities and are recreated by a reset. Use the owner fixture to enter `/admin`; use the two customer fixtures to verify that the first owns the seeded protected download and the second is denied. Never reuse these fixture credentials in a hosted installation.

Run the complete current authority check with:

    npm run verify:spine

The local offerings page at `/support` uses a labeled commerce simulation. It creates real local
Checkout intents, orders, subscriptions, refunds, and entitlements without contacting Stripe or
charging a card. Run its complete gate with:

    npm run verify:commerce

Connecting the artist's Stripe sandbox remains optional and approval-gated. The exact mapping,
webhook, customer-portal, verification, and recovery procedure is in
[`docs/artist/commerce.md`](docs/artist/commerce.md). Live mode is never required for development or
judging.

The demonstration also includes complete, non-exclusive music licensing. Install Python 3.12 or
newer and the pinned PDF renderer before running its worker or verification:

    python3 -m pip install -r workers/documents/requirements.txt
    npm run documents:work
    npm run verify:licensing

The public terms, immutable versioning, local and Stripe test checkout paths, private document
worker, retry procedure, and hosted worker contract are documented in
[`docs/artist/licensing.md`](docs/artist/licensing.md).

The fictional demonstration includes one three-lesson learning path, public and protected mixed
media, account resume, a privacy-gated external video, and a structured editorial note. Run:

    npm run verify:learning
    npm run seed:reset
    npm run test:e2e -- tests/e2e/learning.spec.ts

The complete access modes, safe rich-text subset, private media workflow, video consent boundary,
draft and publication lifecycle, and recovery procedure are documented in
[`docs/artist/learning-video-editorial.md`](docs/artist/learning-video-editorial.md).

## Guided personalization

After the local demonstration passes, ask Codex to begin the interview. Codex reads the current published configuration, discusses each decision with you, and creates a proposal under `setup/proposals/`:

    npm run setup:interview
    npm run setup:preview -- setup/proposals/<proposal-id>.json
    npm run setup:apply -- setup/proposals/<proposal-id>.json --confirm-approved-proposal
    npm run setup:check

The interview covers identity, audience, site goals, visual direction, pages, catalog, commerce, licensing, memberships, learning, video, contact, privacy, and deployment. Codex places complete answers and a full validated public configuration in the proposal. If you supplied an approved media directory, Codex first creates and reviews a media manifest with you.

`setup:preview` is read-only. It reports every configuration path that changes, the media release and track count, whether media approvals are complete, whether the proposal is stale, and every external-service checkpoint. Review that output and the proposal itself. Approval means changing the proposal's approval block to name the approving person and time, with `localApplyConfirmation` set to `true`; Codex must not infer or prefill that approval.

`setup:apply` accepts only an approved proposal, only with the confirmation flag, and only against the local Supabase stack. It publishes the artist configuration, idempotently imports approved media, runs the shared media worker when requested, verifies the result, and then updates `setup/project-state.json`. Repeating the same approved proposal is a safe no-op for already-applied configuration and media.

Missing hosted Supabase, OAuth, Stripe, email, Vercel, domain, or deployed-worker configuration does not make local setup fail. Those intentions become named `approval-required` entries in project state with exact runbooks under `docs/agent/`. No external account is changed by interview, preview, apply, or check.

To prove the complete lifecycle with disposable fictional media, run:

    npm run verify:setup

This test resets only the local demonstration, creates two generated tones in a temporary directory, exercises preview and approval guards, applies and verifies the fictional identity and catalog twice, and restores the original repository state.

## Maintenance and recovery

Keep `setup/project-state.json` in the repository. It contains non-secret checks, enabled modules, the approved proposal hash, and remaining external checkpoints so a new Codex task or machine can resume safely. It does not replace the database as content authority.

Run `npm run diagnose` for shareable operational status and `npm run setup:check` after configuration or service changes. The complete service, backup, upgrade, and failure runbooks begin at [`docs/agent/README.md`](docs/agent/README.md).

## Take the artist-owned snapshot with you

After personalization, create a verified portable export:

    npm run export:artist -- --out exports/<artist-name>
    npm run export:verify -- exports/<artist-name>

The export includes no credentials or customer history. It bundles the artist's current published structure and local media with hashes, records which service accounts must be reconnected, and carries backup and customer-data procedures. Store it in an artist-approved encrypted location; the ignored `exports/` directory is only a local staging area.

To rehearse a restore, use `npm run restore:check -- exports/<artist-name> --confirm-disposable-local`. Read the warning literally: it resets only local Supabase, restores into the clean local schema, verifies equivalence, and then returns the repository to the fictional demonstration. It refuses hosted databases and an omitted confirmation flag.
