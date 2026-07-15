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

The setup commands are implemented and verified during the build. Their stable contract is:

    npm run setup:interview
    npm run setup:preview -- setup/proposals/<proposal-id>.json
    npm run setup:apply -- setup/proposals/<proposal-id>.json
    npm run setup:check

Until Milestone 9 marks these commands as tested, follow `plans/artistOwnedPlatform.md` rather than treating this file as a working installer.
