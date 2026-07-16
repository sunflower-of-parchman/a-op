# Project description

## Project name

Artist-Owned Platform.

## Track

Developer Tools.

## Short description

An open-source, Codex-native web platform that helps an independent musician own and operate the permanent digital home of their music, audience relationships, direct commerce, licensing, memberships, and teaching.

## Full description

I am a musician, and I have spent years building a way to support my work without making a streaming platform the center of my relationship with listeners, dancers, students, and collaborators. Artist-Owned Platform turns that operating knowledge into something another artist can use.

Each installation belongs to one artist or artist-led organization. The artist supplies the music, identity, writing, artwork, prices, licensing terms, connected accounts, and business decisions. The platform supplies the complete working foundation: an expressive Nuxt site, Supabase authentication and storage, albums and listening, direct purchases, memberships, configurable music licensing, private documents, learning paths, video, editorial publishing, customer access, first-party telemetry, administration, exports, recovery, and tests.

The starting point is a conversation with Codex: “Help me set up my artist-owned site.” Codex interviews the artist, prepares a structured proposal and exact diff, waits for explicit approval, applies deterministic changes, verifies them, and records the project state. The public website does not require an OpenAI API key and does not place an AI assistant between the artist and the audience.

The product is technically substantial because artist ownership has to survive the parts that are easy to hand-wave. Payments are fulfilled only from verified events. One replayed payment cannot create duplicate orders or access. Supabase Row Level Security separates owners, editors, customers, and anonymous visitors. Private media and license documents are delivered only after a centralized entitlement decision. Source audio is immutable. Durable workers process audio and PDFs outside ordinary requests. The artist can export and verify the portable public structure of the installation, then rehearse a clean local restore.

The fictional Daymark Assembly demonstration exercises every enabled module with original text, generated tones, deterministic artwork, and no private Sound for Movement material. A clean-clone rehearsal proved the locked install, local setup, deterministic reset, production build, personalization lifecycle, and cross-browser judge path.

## How Codex and GPT-5.6 were used

I directed the product, supplied the real operating knowledge, and made the decisions about audience, scope, identity, rights, prices, accounts, safety boundaries, and publication. Codex running GPT-5.6 Sol in the primary implementation task wrote the competition repository: architecture, Nuxt application, Supabase migrations and policies, Stripe adapters, workers, setup lifecycle, runbooks, tests, recovery tools, and submission evidence. GPT-5.6 Pro independently reviewed the complete plan before implementation, and its adopted recommendations were integrated into that work.

The implementation task kept the complete platform as the outcome. Codex generalized patterns from my private system into a new repository without copying private data, branding, credentials, or media. It repeatedly reset and rebuilt the local system, diagnosed failures across Nuxt, Supabase Auth, Kong, Playwright, Docker, Stripe-shaped events, media processing, and PDF generation, and kept dated evidence tied to local commits.

## Important decisions

- Build one complete artist-owned installation, not a multi-tenant marketplace.
- Keep Codex in setup and maintenance while the public experience remains directly between artist and audience.
- Make Supabase authoritative for runtime content and access state; keep secrets in environment variables and payment facts with Stripe.
- Build one centralized entitlement spine for downloads, memberships, licensing, and learning.
- Require a proposal, diff, explicit approval, deterministic apply, verification, and state update for guided setup.
- Preserve original media, use durable workers, and make local and hosted processing follow the same contract.
- Keep unusual or exclusive licensing requests in a human inquiry path instead of inventing terms.
- Make portability, recovery, security, accessibility, and judge setup part of the product.

## What was built during Build Week

This repository began empty during the competition period. The entire distributable platform, fictional demonstration, database schema, application, workers, setup system, test suite, documentation, and evidence package were created here. My existing private Sound for Movement application served only as a read-only architectural reference for patterns I already operate; it is neither required by the project nor included in the submission.

## Current external boundary

The complete local product and production-shaped integrations are implemented and verified. An isolated hosted Supabase project now contains all 12 reviewed migrations and the fictional demonstration, and a dedicated Stripe sandbox contains all four published test offerings. The hosted advisors report zero database-policy warnings after the approved forward optimization; one leaked-password protection warning remains while the existing no-cost entitlement is confirmed. Public deployment, transactional Stripe proof, deployed-worker proof, public repository access, video upload, and Devpost submission remain separately approval-gated. The local payment simulation is clearly labeled, charges no card, and exercises the same durable order and entitlement path.
