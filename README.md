# Artist-Owned Platform

An open-source web platform for musicians who want a permanent home for their work and a direct relationship with the people who listen, learn, buy, and license it.

Each installation belongs to one artist or artist-led organization. The artist supplies the music, identity, writing, artwork, prices, licensing terms, and business decisions. The platform supplies the working foundation: catalog and listening, direct sales, licensing, memberships, learning paths, video, customer access, first-party telemetry, and the tools needed to operate it.

Codex helps the artist set up and maintain the system. The public website does not require an OpenAI API key or place an AI experience between the artist and their audience.

## What the complete platform includes

- A Nuxt 4 website with an artist-controlled design system and structured page publishing.
- Supabase database, authentication, optional OAuth, storage, Row Level Security, and customer accounts.
- Albums, tracks, collections, credits, artwork, audio previews, playlists, favorites, and listening history.
- Stripe test and live-mode integration for downloads, memberships, subscriptions, and customer billing tools.
- Configurable music licensing with issued terms, protected documents, and account history.
- Learning paths, courses, lessons, progress, video, and editorial publishing.
- First-party audience telemetry, operational status, protected media delivery, and artist portability.
- Human-readable instructions and agent-readable contracts for setup, verification, recovery, and ongoing change.

## How an artist begins

The intended starting point is simple:

> Help me set up my artist-owned site.

Codex reads `AGENTS.md` and `SETUP.md`, checks the local environment, and walks through the artist's identity, catalog, visual direction, pages, commerce, licensing, membership, teaching, video, privacy, and deployment choices. It prepares a structured proposal and preview. The artist approves the proposal before deterministic scripts change the project.

The setup lifecycle is:

    interview
    -> structured proposal
    -> validated preview and diff
    -> explicit human approval
    -> deterministic application
    -> verification
    -> project-state update

## Current status

Milestones 0 through 6 and Integration Gate A are implemented locally. The repository now includes the Nuxt 4 and local Supabase foundation, explicit account roles and protected fulfillment, database-authoritative artist identity and design, validated private drafts, explicit publication, structured pages, consent-based contact storage, catalog and collection authorship, signed resumable media intake, one local/container processing worker, a persistent public player, private listener libraries, one-time commerce, memberships, refunds, cancellation, customer billing tools, protected downloads, auditable entitlements, explicit non-exclusive music licensing, immutable issued terms, and private PDF delivery. The prepared media worker and Stripe integration still require explicitly approved hosted and sandbox connections before those external demonstrations can be recorded.

- Build record: `BUILD_WEEK.md`
- Complete execution plan: `plans/artistOwnedPlatform.md`
- Product contract: `docs/architecture/product-contract.md`
- Configuration authority: `docs/architecture/configuration-authority.md`
- Media processing: `docs/architecture/media-processing-contract.md`
- Capability evidence: `docs/submission/capability-evidence.md`
- Model and agent use: `docs/submission/model-and-agent-use.md`

## Development

Use Node 24.14, npm 11, and a running Docker Desktop installation. From a fresh clone:

    npm ci
    npm run setup:preflight
    npm run setup:local
    npm run dev

`setup:local` starts the local Supabase stack, applies migrations, inserts the fictional demonstration artist, generates `shared/types/database.ts`, and writes local credentials only to ignored `.env`.

Verify the current foundation with:

    npm run setup:check
    npm run test:db
    npm run verify:foundation
    npm run verify:spine
    npm run verify:administration
    npm run verify:catalog
    npm run verify:commerce
    npm run verify:licensing
    npm run verify
    npm run test:e2e

`verify:spine` performs a clean local reset, verifies setup state and all five database identities, replays one payment event four times, checks the single order and entitlement, builds the application, scans the browser bundle for server secrets, and runs the protected browser journey. `verify:administration` proves configuration and page draft/publication plus consent-based local contact storage. `verify:catalog` proves catalog authority, idempotent media intake, local and container media processing, and browser-secret boundaries. `verify:commerce` proves replay-safe fulfillment, changed-fact denial, subscription expiry, partial and full refunds, redacted webhook recovery records, raw-body Stripe signature verification, and customer isolation. `verify:licensing` proves immutable terms, replay-safe issue, private PDF rendering, account isolation, and refund revocation. `npm run verify` runs the aggregate gate and restores deterministic prerequisites before the responsive browser suite; it will continue to expand as learning, portability, and judge journeys are integrated.

## Ownership and operating costs

The software will be open source after Michael selects the final license and explicitly approves publication. Running a site may still involve domain registration, hosting, database, storage, email, and payment-processing costs. Each artist owns their repository, connected accounts, domain, content, customer relationship, and a verified path for exporting and restoring the installation.

## Build Week

This project is being built with Codex using GPT-5.6 Sol and GPT-5.6 Pro. Michael Wall directs the product, supplies the operating knowledge, and makes the creative, rights, pricing, account, and publication decisions. Codex performs the implementation, generalization, migrations, testing, setup automation, debugging, verification, and technical documentation.

The personalized artist site is the proof. The transferable, agent-operable system is the project.
