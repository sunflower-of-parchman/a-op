# Model and agent use record

This document records how Codex, GPT-5.6 Sol, and GPT-5.6 Pro contribute to the OpenAI Build Week project. Keep it current throughout implementation and reconcile it with task metadata before submission.

## Declared implementation record

- Primary implementation task: This Codex task.
- Primary Codex task/thread ID: `019f6291-c1c9-7cf3-9da7-be2a19b7154c`
- Models used: GPT-5.6 Sol and GPT-5.6 Pro.
- Model confirmation: Michael confirmed both models on July 14, 2026.
- Primary-task purpose: Architecture integration, core implementation, milestone decisions, and full verification.
- Supporting-task boundary: Supporting tasks may perform bounded research or isolated investigations. Core integration, milestone decisions, major verification, and the majority of implementation remain in the primary task.
- Final `/feedback` Session ID: Pending completion and confirmation through `/feedback`; do not infer equivalence with the task/thread ID.

## Product runtime boundary

The deployed artist website does not require an OpenAI API key and does not make visitor-facing model calls. GPT-5.6 Sol and GPT-5.6 Pro contribute through Codex while the platform is designed, built, configured, tested, documented, and maintained.

The artist remains the authority for identity, writing, media rights, prices, licensing terms, accounts, costs, and external publication. Codex performs implementation and technical operations within those decisions and stops for explicit approval before consequential external actions.

## Evidence contract

For every major milestone, add an entry containing:

- UTC date and primary or supporting task designation.
- Model shown by the implementation environment or task metadata.
- Human decision or source requirement.
- Material code, migration, test, setup, or documentation contribution.
- Relevant commit identifier after a commit exists.
- Verification command and result.
- Capability row in `docs/submission/capability-evidence.md`.

Do not infer a task's model from writing style or memory. Use environment-provided task metadata where available. If metadata cannot be exported directly, record the visible model designation and state that it was user-confirmed.

## Milestone entries

### Planning baseline — 2026-07-15

- Task: Primary implementation task.
- Models: GPT-5.6 Sol and GPT-5.6 Pro, user-confirmed for the Build Week work. Exact turn-level model attribution remains pending environment metadata.
- Human decisions: Build the complete artist-owned platform; keep the visitor runtime free of required AI calls; make the repository Codex-native; preserve artist control over creative, business, rights, account, and publication decisions.
- Material contribution: Full ExecPlan, planning convention, competition brief, configuration-authority contract, media-processing contract, and evidence contract.
- Commit: `e71e1d9` (`Establish Build Week execution baseline`).
- Verification: Documentation structure and public-release scans only; application implementation has not begun.

### Milestone 0 product contract — 2026-07-15

- Task: Primary implementation task.
- Models: GPT-5.6 Sol and GPT-5.6 Pro are confirmed for the Build Week work; exact turn-level attribution remains pending task metadata.
- Human decisions: Preserve the complete platform, center musicians, keep Codex in setup and maintenance rather than visitor runtime, and retain explicit approval over identity, rights, prices, accounts, costs, license, and publication.
- Material contribution: Public README and setup entrypoint, repository agent rules, complete product contract, provenance ledger, visual and interaction thesis, eleven architecture decision records, current Supabase security constraints, and Developer Tools track decision.
- Commit: `ebdc320` (`Define artist-owned platform contract`).
- Verification: Required documents exist; tracked paths are public-safe; local-path example is valid JSON; documentation contains no secret values; ExecPlan and evidence records are synchronized.

### Milestone 1 reproducible foundation — 2026-07-15

- Task: Primary implementation task.
- Models: GPT-5.6 Sol and GPT-5.6 Pro are confirmed for the Build Week work; exact turn-level attribution remains pending task metadata.
- Human decisions: Build a complete agent-operable platform; keep the demonstration fictional and free of private music or branding; make local operation real; retain explicit approval over external accounts, deployment, payment mode, media, and publication.
- Material contribution: Pinned Nuxt 4 and Node 24 application; typed artist and service configuration; semantic public design system; fictional public routes; local Supabase configuration, migration, RLS policy, seed, and generated types; secret-redacting setup scripts; deterministic project state; unit, integration, database, Playwright, axe, and continuous-integration foundations.
- Commit: `83c3b4f` (`Bootstrap reproducible artist platform`).
- Verification: `npm ci`, `npm run setup:preflight`, `npm run setup:local`, `npm run setup:check`, `npm run test:db`, `npm run verify:foundation`, and the four-test desktop/mobile `npm run test:e2e` suite passed. Desktop and mobile screenshots were inspected locally after correcting transient animation contrast and heading-to-body spacing.

### Milestone 2 and Integration Gate A — 2026-07-15

- Task: Primary implementation task.
- Models: GPT-5.6 Sol and GPT-5.6 Pro are confirmed for the Build Week work; exact turn-level attribution remains pending task metadata.
- Human decisions: Preserve a complete scope; make Codex the nontechnical artist's operating partner; build the authority spine before dependent modules; keep private reference material out of the repository; retain explicit approval over external accounts, credentials, deployment, payments, media, and publication.
- Material contribution: Consolidated account, role, publication, media, product, price, payment-event, order, order-item, entitlement, and download schema; explicit grants, forced RLS, owner bootstrap, transactional replay-safe fulfillment, central access decision, seven storage buckets, server-owned Supabase sessions, owner administration boundary, public generated preview, protected signed download, local fixture identities, database-policy tests, browser-secret scan, and desktop/mobile browser journeys.
- Commit: `12f5d66` (`Build authority and fulfillment spine`).
- Verification: `npm run verify:foundation`, `npm run verify:spine`, Supabase `db lint` for `public,private`, the exact browser-secret scan, and the full 10-test desktop/mobile Playwright suite passed. Visual acceptance inspected the desktop administration and mobile release-preview surfaces. Four identical simulated event deliveries produced one event, one order, and one entitlement; the entitled customer received the signed file and the second customer received HTTP 403.

### Milestone 3 artist administration — 2026-07-15

- Task: Primary implementation task.
- Models: GPT-5.6 Sol and GPT-5.6 Pro are confirmed for the Build Week work; exact turn-level attribution remains pending task metadata.
- Human decisions: Give the artist direct application-based operation; preserve an expressive open public composition; keep identity, writing, imagery, publishing, and external communication under human authority.
- Material contribution: Database-authoritative identity and design; private configuration and page drafts; explicit publication; nine ordered structured-section types; complete responsive administration; local contact capture with consent, honeypot, rate limiting, and audit records.
- Commits: `0982946` (`Build database-authoritative artist administration`) and `37a7b12` (`Complete artist configuration and page composition`).
- Verification: `npm run verify:administration`, aggregate `npm run verify`, unit and policy tests, schema lint, browser-secret scan, and desktop/mobile administration, contact, accessibility, and publication journeys passed.

### Milestone 4 catalog, media, and listening — 2026-07-15

- Task: Primary implementation task.
- Models: GPT-5.6 Sol and GPT-5.6 Pro are confirmed for the Build Week work; exact turn-level attribution remains pending task metadata.
- Human decisions: Support the complete musician-operated catalog; keep source media immutable; require rights approval before import; preserve authored release and collection order; use one worker implementation locally and in a deployed container; keep listener libraries private by account.
- Material contribution: Catalog and media schema; release, track, credit, artwork, and collection administration; draft-safe atomic publication; direct signed TUS uploads; durable leased processing jobs; shared ffmpeg worker and Docker entrypoint; rights-gated idempotent Codex import; public catalog and persistent player; customer favorites, atomic playlists, and listening history.
- Commits: `bc89195`, `021bc7a`, `ea7c0f9`, `fd17435`, `57587c1`, `db4e560`, and `21476f6`.
- Verification: Clean migration reset and generated types, Supabase schema lint with no findings, `npm run verify:catalog`, production build, browser-secret scan, and desktop/mobile catalog, administration, upload, customer-isolation, viewport, and accessibility journeys passed. The same worker passed local direct and Docker image execution. Hosted deployment evidence remains pending Michael's explicit approval.

### Milestone 5 commerce and memberships — 2026-07-15

- Task: Primary implementation task.
- Models: GPT-5.6 Sol and GPT-5.6 Pro are confirmed for the Build Week work; exact turn-level attribution remains pending task metadata.
- Human decisions: Preserve the complete artist-owned commerce system; keep the application authoritative for offerings and access; use artist-owned Stripe accounts only after approval; never let a browser redirect grant access; keep live mode outside routine development and judging.
- Material contribution: Service-neutral offerings and mappings; free, external, one-time, and recurring purchase paths; server-created Stripe Checkout and portal sessions; raw-body signed webhook verification; replay-safe atomic orders, subscriptions, refunds, cancellations, and entitlements; explicit expired and revoked decisions; protected downloads; redacted webhook-failure recovery; owner operations; deterministic local simulation; and artist setup guidance.
- Commit: `058201c` (`Build commerce and membership authority`).
- Verification: `npm run setup:check`, `npm run verify:commerce`, Supabase schema lint with no findings, type checking, application lint, production build, and desktop/mobile commerce, owner-mapping, account-isolation, viewport, and accessibility journeys passed. Stripe sandbox evidence remains pending Michael's explicit approval to connect the external test account.

### Milestone 6 music licensing — 2026-07-15

- Task: Primary implementation task.
- Models: GPT-5.6 Sol and GPT-5.6 Pro are confirmed for the Build Week work; exact turn-level attribution remains pending task metadata.
- Human decisions: Let artists publish complete supported uses; keep identity, rights, terms, prices, accounts, and external payment connections under human authority; automate only explicit non-exclusive options; route unusual or exclusive uses to inquiry; preserve private customer documents.
- Material contribution: Versioned immutable templates and options; exact pre-checkout selection snapshots; license-specific local and Stripe test checkout paths; replay-safe atomic issue, document-job, and entitlement creation; refund revocation; private ReportLab PDF worker with leases and recovery; customer account history and protected signed delivery; owner publication and retry controls; public inquiry routing; CI and artist runbook.
- Commit: `d6991d2` (`Build music licensing and private documents`).
- Verification: Clean migration reset and generated types, Supabase schema lint with no findings, `npm run verify:licensing`, type checking, application lint, production build, browser-secret scan, PDF text extraction and two-page visual inspection, and four passing desktop/mobile licensing journeys with two intentional shared-database skips. Stripe sandbox evidence remains pending Michael's explicit approval to connect the external test account.

### Milestone 7 learning, video, and editorial publishing — 2026-07-15

- Task: Primary implementation task.
- Models: GPT-5.6 Sol and GPT-5.6 Pro are confirmed for the Build Week work; exact turn-level attribution remains pending task metadata.
- Human decisions: Deliver the complete education and publishing system; preserve authored order; support public, account, individual-purchase, and membership access; keep lesson media private; require visitor consent before external video embeds; keep publication and unsafe-content decisions explicit.
- Material contribution: Normalized learning areas, paths, courses, lessons, sections, drafts, progress, videos, and editorial records; atomic draft publication and reorder safety; central entitlement reuse; protected mixed-media delivery; monotonic progress and account resume; safe rich-text rendering without raw HTML; consent-gated external video; complete owner preview and publication workspaces; fictional demonstration content; CI, runbook, database authority tests, and responsive browser coverage; deterministic full-suite isolation and hydration-aware browser navigation.
- Commit: `b49c36c` (`Build learning video and editorial publishing`).
- Verification: Clean local reset and schema lint, `npm run verify:learning`, `npm run verify:catalog`, formatting, lint, type checking, setup health, production build, browser-secret scan, and the complete nine-specification desktop/mobile Playwright regression passed. That full run isolated each specification with a fresh deterministic seed and used the prepared pinned PDF runtime for the licensing prerequisite.

### Milestone 8 privacy-conscious telemetry and operations — 2026-07-15

- Task: Primary implementation task.
- Models: GPT-5.6 Sol and GPT-5.6 Pro are confirmed for the Build Week work; exact turn-level attribution remains pending task metadata.
- Human decisions: Give the artist useful first-party measurement without advertising profiles; preserve visitor control; keep search words, identities, payment details, and secrets out of audience events; make diagnostic output safe to share with Codex; retain explicit approval for external service connections.
- Material contribution: Dedicated optional-event, policy, operational-history, current-check, and installation-metadata records; forced RLS and service-only RPCs; strict allowlisted schemas; session-only client identity; consent, global disable, GPC, DNT, retention, and dynamic-path enforcement; named product instrumentation; owner aggregate and system-status interfaces; redacted setup recording and diagnostic command; artist privacy guide; CI; authority and desktop/mobile browser proofs.
- Commit: `1b585c9` (`Build privacy telemetry and redacted operations`).
- Verification: `npm run verify:telemetry`, `npm run setup:check`, Supabase schema lint, formatting, lint, type checking, production build, browser-secret scan, focused desktop/mobile Playwright journeys, and the complete ten-specification isolated browser regression passed. The browser proof produced page-view, catalog-search, media-start, meaningful-listen, and contact-conversion aggregates from real visitor actions and proved GPC refusal, owner-only status, redaction, viewport containment, and critical/serious axe compliance.

## Submission reconciliation

Before submission:

1. Capture the final `/feedback` Session ID from the primary implementation task.
2. Export or record the task's available model and session metadata.
3. Confirm that both GPT-5.6 Sol and GPT-5.6 Pro claims are supported by the task record.
4. Link milestone entries to dated commits and capability evidence.
5. Ensure the README and video accurately describe human decisions, Codex implementation, and the model/runtime boundary.
