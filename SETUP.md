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

The setup commands are implemented and verified during the build. Their stable contract is:

    npm run setup:interview
    npm run setup:preview -- setup/proposals/<proposal-id>.json
    npm run setup:apply -- setup/proposals/<proposal-id>.json
    npm run setup:check

These guided personalization commands are implemented and tested in Milestone 9. Until then, the verified local setup uses the fictional demonstration identity and the complete lifecycle remains the controlling contract for later artist changes.
