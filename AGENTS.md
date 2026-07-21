# Repository instructions

This repository builds `a-op: artist-owned platform`, the complete product described in `PRODUCT.md` and controlled by `plans/migrateAopToSites.md`. Read `PRODUCT.md`, `PLANS.md`, the complete ExecPlan, the relevant contracts in `docs/architecture/`, and the current official OpenAI Sites guidance before changing product code.

## Product outcome

`a-op` is an open-source web application for musicians. It gives artists their own music publishing, streaming, distribution, customer access, memberships and subscriptions, licensing, Courses, video, contact, telemetry, legal-document starters, and administration.

Music leads the product. The first complete product path is release publication, audio streaming, customer sign-in, durable access, and direct delivery. Every active capability joins the same artist, catalog, account, access, and administration system.

Working behavior leads every milestone. A capability is complete when its public or administrative workflow runs end to end, stores the intended durable state, enforces access on the server, works in both themes and responsive layouts, survives a production build, and passes a focused human-observable journey.

## Starting visual framework

Every fresh installation starts from the complete Sound for Movement-derived visual foundation defined in `docs/architecture/visual-direction.md`. Port it faithfully into React before introducing module-specific visual patterns.

The foundation includes Lato, the exact semantic color values, complete dark and light themes, open composition, established controls and surfaces, responsive spacing, motion, and accessibility behavior. `a-op` presents it with plain labels, placeholders, and general product names. Use `Courses` for teaching content and `What's New` for in-app updates.

After the complete baseline runs, ChatGPT Work and Codex can help the artist change the visual system, page structure, navigation, language, imagery, active capabilities, and new functionality in their own fork.

## Capability activation

The repository contains the complete supported capability set. D1 records the active modules for each installation.

Music publishing, catalog, streaming, identity, access, and administration form the core. An installation can begin with streaming alone. Artists activate direct downloads, customer libraries, licensing, memberships, subscriptions, Courses, video, What's New, contact, telemetry, and related tools as their work grows.

Public navigation, routes, administration, setup, jobs, and telemetry follow the active module registry. Deactivation preserves durable records and access history.

A repository-link request to build a new artist-owned website first clones the repository, prepares the exact release artifact, creates a new private Site with fresh Sites-provided D1 and R2 resources, applies every migration, and verifies the complete neutral installation. Ask no capability, content, asset, design, or setup question before that hosted verification succeeds.

After the neutral Site works, tell the artist that their new artist-owned website is ready and that it is time to personalize it. Ask them to attach a context document or approved assets, share a Google Drive folder containing material they want to use, approve a local asset folder, or begin with the blank Site. Review only material the artist deliberately provides, then present the proposed active capabilities, asset and information checklist, and exact setup proposal before applying it. Imported content populates the existing product repositories and native interfaces; it never replaces the visual foundation, player, navigation, access controls, or module components with a content-specific renderer.

## Active plan

`plans/migrateAopToSites.md` is the controlling implementation plan. Keep its `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` sections current as implementation proceeds.

At each stopping point:

1. Leave the integrated application runnable.
2. Update the controlling ExecPlan with completed behavior, discoveries, decisions, and remaining work.
3. Record the exact focused verification that ran.
4. Commit one coherent functional milestone when Michael asks to save the work.

Functional code receives first priority. Documentation preserves the contracts needed to implement and operate it.

## Name and license

- Product name: `a-op`
- Full title: `a-op: artist-owned platform`
- GitHub repository: `sunflower-of-parchman/a-op`
- License: `AGPL-3.0-or-later`

Use the lowercase product styling in copy, metadata, repository documentation, and interface labels. Each artist controls their fork, deployment, content, data, customer relationship, and artist-specific changes under the repository license.

Artists retain ownership of their music, images, writing, video, course material, artist-authored code and source changes, and business data. Describe storage and model use precisely: approved Site files live in Sites-provided R2, structured Site state lives in Sites-provided D1, ordinary Site operation makes no model request, and material enters ChatGPT Work only when the artist deliberately shares it there.

## Sound for Movement reference

Michael explicitly authorizes the live Sound for Movement design system to become the starting visual framework for `a-op`. Rebuild the tokens, primitives, layout, light and dark themes, motion, and accessibility behavior in React and record the implementation in `docs/provenance.md`. Use open typographic headers in the neutral installation. Add imagery only from material an artist has approved for their Site.

The live Sound for Movement company repository remains Michael's private, read-only reference for functionality and the visual source. Sound for Movement retains its name, logos, music, teaching material, writing, imagery, customer records, analytics, prices, terms, secrets, endpoints, and production state. Each `a-op` installation uses its artist's own approved material. Store the optional local reference path only in ignored local configuration.

## Official Sites architecture

- Use the current official Sites initializer and preserve its React, TypeScript, vinext, Vite, and Cloudflare Worker structure.
- Treat the installed `sites:sites-building` and `sites:sites-hosting` skills plus current official OpenAI documentation as the source for Sites commands and supported capabilities.
- Declare logical D1 and R2 bindings in `.openai/hosting.json`. Sites provisions and connects the hosted resources.
- Store structured product state in D1. Keep schema definitions in `db/schema.ts`, generate and inspect Drizzle migrations, and route application queries through typed server-side repositories.
- Store original audio, derivatives, artwork, images, video, documents, and exports in R2. Store searchable metadata, ownership, access, and processing state in D1.
- Treat D1 and R2 as Sites-provided storage inside the Sites service boundary. Current Sites guidance includes deployed Site code, D1 and R2 data, generated artifacts, and logs in that boundary.
- Follow `docs/architecture/data-and-ai-boundary.md` for storage language, local media intake, model boundaries, and workspace data controls.
- Use the current official Sign in with ChatGPT helpers for identity-aware customer and administration routes. Resolve owner, editor, and customer authority from server-owned D1 records.
- Route every protected stream, download, course asset, license file, and customer resource through the central `decideAccess` contract.
- Keep secrets and private runtime values server-managed. Logs, errors, exports, browser output, and diagnostics use redacted fields.
- Keep the Sites application within the current official non-financial web-experience scope. The Sites installation demonstrates the complete commerce domain through Stripe Test mode as a simulation: test keys and test objects only, no real payment methods, no real charges, and no money movement. Stripe-hosted Test Checkout owns test payment entry. Reject live credentials and `livemode` events before state changes. A future compatible deployment can activate live commerce only after a fresh policy and platform check, deliberate configuration, and Michael's approval.

## Functional build order

1. Official Sites foundation, exact visual foundation, D1, R2, identity, range responses, and production build.
2. Module registry, artist state, public shell, administration shell, roles, and central access.
3. Music catalog, releases, tracks, streaming, persistent player, and artist publishing.
4. Customer accounts, favorites, playlists, listening history, libraries, and protected delivery.
5. Memberships, subscriptions, download credits, license credits, licensing, access grants, and entitlement history.
6. Courses, video, structured pages, What's New, and contact.
7. Telemetry, consent, privacy, terms, operations, and customer administration.
8. ChatGPT Work setup, media preparation, personalization, diagnosis, export, and recovery.
9. Complete integration, accessibility, responsive behavior, performance, security, and approved Sites hosting.

## Human authority and external actions

Michael remains the authority for writing, music and media rights, access plans, licensing terms, legal language, connected accounts, open-source licensing, and publication.

Public Sites deployment, custom domains, DNS, repository visibility, email delivery, public media uploads, and other external publication actions require Michael's specific approval for that exact action. Local development, fictional data, and deterministic simulations may proceed inside the approved project scope.

## Sites release boundary

Prepare every Sites version with `npm run prepare:sites-release` from a clean `main` checkout whose `HEAD` equals `origin/main`. Treat any clone, install, build, source-integrity, artifact, binding, migration, packaging, version-save, deployment, route, or Worker-log failure as terminal for that attempt. Report the exact failure and stop.

Deploy only the official archive made from that verified unchanged checkout with the installed `sites:sites-hosting` helper. Never create `app/site.tsx`, substitute routes, static route shims, replacement prose, alternate components, or database-free fallbacks during deployment. `docs/architecture/sites-release-contract.md` is the complete release contract.

## ChatGPT Work

ChatGPT Work is the artist's natural-language development and operating environment. Codex helps initialize the project, activate the selected capabilities, preserve the artist's wording, run local media preparation against artist-approved paths, apply validated configuration, change source code, diagnose problems, perform maintenance, and verify the result.

Describe media actions as adding music to the artist's Site. Approved bytes enter R2 and structured records enter D1. Material enters a ChatGPT Work conversation only when the artist deliberately shares it. OpenAI workspace handling follows the active plan, configuration, feature, region, and agreement.

The public Site and administration area remain complete web experiences. Application code carries identity, authorization, data integrity, media access, memberships, subscriptions, licensing, and entitlement state.

## Interface direction

Follow `docs/architecture/visual-direction.md` as the exact first implementation. Use open layouts. Add cards only for meaningful selectable items or functional boundaries. Keep public headers, functional page layouts, and the administration working surface distinct.

Administration uses direct navigation, status, and action. Every control performs a real operation and reports its result.

Verify keyboard behavior, reduced motion, mobile layout, touch targets, focus, contrast, and both themes during implementation.

## Working practices

- Use affirmative-first framing. Describe the capability, action, and intended result directly.
- Read relevant files before editing.
- Use `rg` for repository searches.
- Use `apply_patch` for scoped file edits.
- Preserve unrelated user changes in a dirty worktree.
- Keep the application runnable after each integrated milestone.
- Run focused verification for the behavior changed and a production build at milestone gates.
- Give tests a clear product, authorization, media, or data-integrity purpose.
- Pin dependencies and commit the lockfile.
- Generate D1 migrations from the current Drizzle schema and inspect the SQL.
- Use exact, validated local targets for resets, restore rehearsals, and destructive development operations.
- Use fictional development records and artist-approved media paths.
- Keep credentials, private customer data, private media, and machine-specific paths in their designated ignored or hosted secret stores.
