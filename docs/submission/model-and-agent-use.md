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

## Submission reconciliation

Before submission:

1. Capture the final `/feedback` Session ID from the primary implementation task.
2. Export or record the task's available model and session metadata.
3. Confirm that both GPT-5.6 Sol and GPT-5.6 Pro claims are supported by the task record.
4. Link milestone entries to dated commits and capability evidence.
5. Ensure the README and video accurately describe human decisions, Codex implementation, and the model/runtime boundary.
