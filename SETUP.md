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

## Guided personalization

The setup commands are implemented and verified during the build. Their stable contract is:

    npm run setup:interview
    npm run setup:preview -- setup/proposals/<proposal-id>.json
    npm run setup:apply -- setup/proposals/<proposal-id>.json
    npm run setup:check

These guided personalization commands are implemented and tested in Milestone 9. Until then, the verified local setup uses the fictional demonstration identity and the complete lifecycle remains the controlling contract for later artist changes.
