# Build the complete a-op Sites application

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This plan must be maintained in accordance with `PLANS.md` at the repository root.

## Purpose / Big Picture

Build `a-op: artist-owned platform` as a complete open-source web application for musicians using the current official OpenAI Sites stack.

The finished product begins with artist-owned music distribution. An artist configures their installation, publishes releases and tracks, streams audio through their own site, gives customers accounts and libraries, delivers music, issues licenses, and offers memberships and subscriptions. The same application also carries Courses, video, structured pages, What's New, contact, first-party telemetry, privacy, terms, customer administration, export, and recovery.

Artists use ChatGPT Work and Codex to create, personalize, maintain, diagnose, and verify the installation. Visitors and customers use the public Site directly. Trusted owners and editors use the administration area directly.

Every installation begins with the complete Sound for Movement visual framework rebuilt in React with plain `a-op` labels and placeholders, standard product names, and complete dark and light themes. The artist can then reshape the framework through natural-language work in ChatGPT Work and Codex.

The repository contains every supported capability. Music publishing, catalog, streaming, identity, access, and administration form the core. Each artist activates the additional capabilities they need and can grow from streaming alone into downloads, licensing, memberships, subscriptions, Courses, video, What's New, contact, telemetry, and new functionality in their own fork.

Success means every declared product capability works end to end in one integrated application. Each workflow stores durable state, enforces authority on the server, produces the intended public or administrative result, and survives the production build. Documentation stays close to the code and supports setup and operation.

The current Nuxt application supplies proven behavior during the transition. The first implementation milestone replaces its active source tree with the current official Sites starter. Git history carries the earlier implementation automatically.

Michael explicitly authorized the complete Sound for Movement visual framework as the starting framework for `a-op`. The live company repository remains private and read-only. Its visual system and generalized functional behavior inform fresh React code while its name, content, media, customers, secrets, endpoints, and production state remain in the company repository.

## Progress

- [x] (2026-07-18 19:09Z) Confirmed the product direction: artists create and operate `a-op` through ChatGPT Work and publish the web application with Sites.
- [x] (2026-07-18 19:09Z) Inspected the current application, product description, architecture records, and the official Sites starter structure.
- [x] (2026-07-18 19:09Z) Selected the official Sites React, TypeScript, vinext, Vite, Cloudflare Worker, D1, R2, and Sign in with ChatGPT foundation.
- [x] (2026-07-18 19:34Z) Renamed the private GitHub repository to `sunflower-of-parchman/a-op` and updated the local `origin` URL.
- [x] (2026-07-18 19:34Z) Set the product name to `a-op` and the full title to `a-op: artist-owned platform`.
- [x] (2026-07-18 19:34Z) Refocused the repository instructions, product description, README, planning convention, and controlling ExecPlan on working product functionality.
- [x] (2026-07-18 20:32Z) Recorded the exact Sound for Movement-derived visual foundation for the first React implementation, including Lato, semantic color values, both themes, layout, primitives, the living image mosaic, motion, imagery, language, and accessibility.
- [x] (2026-07-18 20:32Z) Defined the modular installation contract: music and access form the core, each artist activates the capabilities they need, and `Courses` is the public teaching-area name.
- [x] (2026-07-18 20:32Z) Verified the current official Sites storage guidance and Work mode data guidance, then recorded the D1, R2, local media, application runtime, and workspace data-control boundaries.
- [x] (2026-07-18 20:44Z) Verified the updated governing documents with `git diff --check`, a trailing-whitespace scan, required ExecPlan-section checks, all exact visual token values, current product naming, and required-file checks.
- [x] (2026-07-18 21:35Z) Refocused the governing product and implementation contracts on the application artists use and the durable state it owns.
- [x] (2026-07-18 21:35Z) Recorded artist ownership, the Sites-provided D1 and R2 service boundary, deliberate ChatGPT Work sharing, workspace-specific training controls, and the current Sites non-financial runtime scope.
- [x] (2026-07-18 21:40Z) Verified the reconciled documents with `git diff --check`, a trailing-whitespace scan, all twelve required ExecPlan sections, drift-phrase scans, and exact ownership, storage, model-request, and runtime-scope assertions.
- [ ] Recheck the current official OpenAI Sites documentation and installed Sites skills at the start of implementation, then record the generated starter versions and commands.
- [ ] Create the Sites rebuild branch and prepare an exact reviewed manifest for replacement of the current application tree.
- [ ] Initialize the current official Sites starter in a clean temporary workspace and move its complete structure into this repository.
- [ ] Produce a healthy local development server and production build from the new Sites foundation.
- [ ] Prove local D1, R2, Sign in with ChatGPT identity, server-only authorization, and byte-range media delivery.
- [ ] Implement artist configuration, roles, public navigation, and the administration shell.
- [ ] Implement releases, tracks, collections, publishing, audio streaming, and the persistent player.
- [ ] Implement customer profiles, favorites, playlists, listening history, libraries, and protected delivery.
- [ ] Implement access grants, entitlements, downloads, delivery history, and customer access history.
- [ ] Implement memberships, subscriptions, renewal dates, cancellations, download credits, and license credits.
- [ ] Implement music licensing, terms versions, issued license records, documents, and customer access.
- [ ] Implement Courses, lessons, mixed media, access, progress, and resume.
- [ ] Implement video, structured pages, What's New, contact, and inquiry administration.
- [ ] Implement telemetry, consent, retention, privacy, terms, diagnostics, and operations.
- [ ] Implement ChatGPT Work setup, personalization, media preparation, export, restore rehearsal, diagnosis, and maintenance.
- [ ] Complete responsive, keyboard, accessibility, performance, security, and recovery verification across the integrated application.
- [ ] Save a Sites version from the exact validated source.
- [ ] After Michael approves the specific hosting action, deploy the complete Site at the approved access level and verify the working hosted product.

## Surprises & Discoveries

- Observation: The official Sites initializer expects a clean project target.
  Evidence: The bundled initializer exits when unrelated top-level files occupy the target. The migration therefore prepares the starter in a fresh temporary directory and copies the generated structure into the reviewed repository replacement.

- Observation: Sites supplies a React application that builds through vinext and Vite for Cloudflare Worker-compatible output.
  Evidence: The bundled starter currently includes React, TypeScript, vinext, Vite, the Sites Vite plugin, Wrangler, Drizzle, and a `.openai/hosting.json` contract. Implementation will record the exact versions generated on that day.

- Observation: D1 and R2 match the product's two durable data shapes.
  Evidence: Current Sites guidance assigns relational state to D1 and audio, images, video, documents, exports, and other bytes to R2. D1 stores the searchable metadata and ownership that connect those objects to the product.

- Observation: Sign in with ChatGPT supplies identity while `a-op` must supply product authority.
  Evidence: Current Sites guidance provides dispatch-owned sign-in routes, official server helpers, and authenticated-user headers. Owner, editor, customer, entitlement, and resource access remain application decisions stored in D1 and evaluated on the server.

- Observation: Audio streaming requires HTTP byte-range behavior.
  Evidence: Browsers seek and resume audio by requesting byte ranges. The media route must validate the request, authorize the resource, read the requested R2 range, and return `206 Partial Content` with correct range and length headers.

- Observation: The current Nuxt application supplies a detailed behavior map for the rebuild.
  Evidence: Its source covers catalog, streaming, accounts, access, memberships, subscriptions, licensing, Courses, video, telemetry, setup, portability, and operations. The Sites implementation can reproduce these domain outcomes in fresh React and Worker-compatible code.

- Observation: The live Sound for Movement repository remains the most current functional reference.
  Evidence: Michael confirmed that the company repository stays live throughout this rebuild. Reference reads remain bounded, private, and read-only.

- Observation: The exact visual starting point is already defined and authorized.
  Evidence: Michael supplied the reconciled live design tokens, type, controls, layout, imagery, language, motion, and accessibility rules and authorized that complete framework for `a-op`. `docs/architecture/visual-direction.md` records the React implementation contract.

- Observation: The application and ChatGPT Work have separate data roles.
  Evidence: Current Sites guidance assigns structured state to D1 and file bytes to R2. Ordinary Site workflows run through application code and make no model request, while a model receives material only when an artist deliberately shares it in a ChatGPT Work task. Current official Business and Enterprise guidance applies training controls according to workspace plan, configuration, surface, feature, and region.

- Observation: Sites-provided D1 and R2 are inside the Sites service boundary.
  Evidence: Current Sites guidance includes deployed Sites, Site code, D1 and R2 data and file storage, generated artifacts, and logs in the Sites service boundary and states that Sites does not support data residency or inference residency at launch.

- Observation: The current Sites runtime is a non-financial web experience.
  Evidence: Current official Sites guidance defines that scope. The implementation carries artist-controlled access, membership, subscription, credit, licensing, entitlement, and delivery state. Any future transaction work begins with a fresh official-policy check and an approved architecture decision.

## Decision Log

- Decision: Use `a-op` as the product name and repository slug.
  Rationale: The short lowercase name is the stable identity across code, documentation, metadata, and GitHub.
  Date/Author: 2026-07-18 / Michael

- Decision: Use `a-op: artist-owned platform` wherever a full title is required.
  Rationale: The full title expands the product name directly.
  Date/Author: 2026-07-18 / Michael

- Decision: Keep the current repository and Git history.
  Rationale: The existing history already carries the prior implementation and every future change. The active tree can move directly to the Sites application.
  Date/Author: 2026-07-18 / Michael and Codex

- Decision: Replace the active Nuxt tree after the current official Sites starter is ready.
  Rationale: The product is moving to the framework and runtime supplied for Sites. Git history provides recovery for earlier source.
  Date/Author: 2026-07-18 / Michael

- Decision: Use the official Sites capability path.
  Rationale: `a-op` needs multiple routes, durable data, object storage, uploads, identity, protected resources, and administration.
  Date/Author: 2026-07-18 / Codex

- Decision: Preserve the starter's React, TypeScript, vinext, Vite, Sites plugin, and Cloudflare Worker structure.
  Rationale: The official starter expresses the supported build and hosting contract.
  Date/Author: 2026-07-18 / Codex

- Decision: Use D1 for structured state and R2 for bytes.
  Rationale: This follows the current Sites persistence model and gives the product durable relational data plus scalable media storage.
  Date/Author: 2026-07-18 / Codex

- Decision: Rebuild the complete Sound for Movement visual framework as the exact `a-op` starting framework.
  Rationale: A fresh installation should already feel composed, specific, and complete in dark and light themes. The artist begins with a bespoke working framework and personalizes it through ChatGPT Work after the baseline runs.
  Date/Author: 2026-07-18 / Michael

- Decision: Use plain `a-op` labels, placeholders, and general product names inside the authorized visual framework.
  Rationale: Each artist supplies their own identity and material. `Courses` names the teaching area, and `What's New` names in-app updates.
  Date/Author: 2026-07-18 / Michael

- Decision: Implement every additional capability as an activatable module connected to the same core.
  Rationale: An artist can begin with streaming and add downloads, licensing, memberships, subscriptions, Courses, video, contact, telemetry, and later extensions on the same platform foundation.
  Date/Author: 2026-07-18 / Michael and Codex

- Decision: Treat each installation as an artist-controlled fork.
  Rationale: The artist controls their deployment, content, data, customer relationship, and artist-specific source changes while the shared source remains available under `AGPL-3.0-or-later`.
  Date/Author: 2026-07-18 / Michael and Codex

- Decision: Use dispatch-owned Sign in with ChatGPT for customer and operator identity.
  Rationale: The official helpers provide the current supported sign-in flow for Sites routes.
  Date/Author: 2026-07-18 / Codex

- Decision: Store owner, editor, and customer roles in server-owned D1 records.
  Rationale: Identity and product authority are separate facts. Role records make administration and customer access explicit and auditable.
  Date/Author: 2026-07-18 / Codex

- Decision: Route protected resources through one `decideAccess` contract.
  Rationale: Streaming, downloads, lessons, licenses, memberships, subscriptions, credits, and explicit grants share the same access facts and denial semantics.
  Date/Author: 2026-07-18 / Codex

- Decision: Build music distribution first.
  Rationale: Catalog publication, streaming, customer libraries, direct delivery, licensing, and recurring support form the center of the product.
  Date/Author: 2026-07-18 / Michael and Codex

- Decision: Keep original source media immutable and create versioned derivatives.
  Rationale: The original remains the rights and quality reference while each processing run produces traceable outputs.
  Date/Author: 2026-07-18 / Codex

- Decision: Run media preparation locally against an artist-approved path, then publish approved outputs to the artist's Site.
  Rationale: The artist controls the source, derivative manifest, metadata, and publication choice. R2 receives approved bytes and D1 receives their records; product language names the artist's Site as the destination.
  Date/Author: 2026-07-18 / Michael and Codex

- Decision: Keep ordinary Site operation application-driven and make workspace data handling explicit.
  Rationale: Browsing, streaming, memberships, subscriptions, licensing, Courses, contact, telemetry, and administration run through the Site, D1, and R2 without a model request. An artist deliberately chooses any material shared with ChatGPT Work, and the active workspace plan and controls govern that sharing.
  Date/Author: 2026-07-18 / Michael and Codex

- Decision: Build the current Sites application as a non-financial web experience.
  Rationale: Current official Sites guidance defines that scope. The application will carry artist-controlled access, membership, subscription, credit, licensing, entitlement, and delivery state. Any future transaction work begins with a fresh official-policy check and an approved architecture decision.
  Date/Author: 2026-07-18 / Michael and Codex

- Decision: Use ten bounded worker assignments in four integration waves.
  Rationale: Independent modules can move in parallel while the primary task owns shared contracts, integration, and the running application.
  Date/Author: 2026-07-18 / Codex

- Decision: Keep Sound for Movement private and read-only while using its complete visual framework as the authorized `a-op` starting point.
  Rationale: The visual system can be rebuilt exactly in React while company content, media, customers, secrets, endpoints, and production state remain in their current private locations.
  Date/Author: 2026-07-18 / Michael and Codex

- Decision: Give Michael action-specific authority over identity, rights, access plans, legal language, connected accounts, and publication.
  Rationale: Those decisions belong to the artist and can create external or legal consequences.
  Date/Author: 2026-07-18 / Michael and Codex

- Decision: Let documentation follow working modules.
  Rationale: The repository needs clear setup and operating contracts, while working behavior remains the measure of progress.
  Date/Author: 2026-07-18 / Michael

## Outcomes & Retrospective

Planning outcome as of 2026-07-18: the project has one lowercase name, one private GitHub repository, one controlling plan, one official Sites foundation, one exact visual starting framework, one modular capability contract, one music-first build order, one complete capability map, one artist-controlled fork model, and one explicit data boundary.

Implementation begins with the official starter and runtime proof. The current source still contains the previous Nuxt application. The next milestone replaces that active tree and establishes the first runnable Sites commit.

The governing documents now agree on the first implementation: exact Sound for Movement visual behavior with plain `a-op` labels, Sites-provided D1 and R2 storage, artist ownership, local artist-approved media preparation, application-driven public operation without model requests, `Courses` nomenclature, capability activation from a streaming-first core, and the current Sites non-financial runtime scope. The active product plan focuses on the application artists use and the durable state it owns.

## Context and Orientation

### Repository state

Run implementation commands from the checked-out repository root.

The private remote is:

    https://github.com/sunflower-of-parchman/a-op.git

`main` currently contains the prior Nuxt implementation plus the new governing documents. The first build milestone creates `codex/sites-rebuild`, initializes the official Sites starter, and replaces the active application tree. The branch returns to `main` after the complete integrated candidate passes its gate and Michael chooses the save or merge action.

Current governing files:

- `PRODUCT.md`: product definition.
- `AGENTS.md`: repository operating rules.
- `PLANS.md`: ExecPlan convention.
- `plans/migrateAopToSites.md`: controlling implementation plan.
- `LICENSE`: open-source license.
- `docs/architecture/product-contract.md`: product, fork, capability, and completion contract.
- `docs/architecture/visual-direction.md`: exact starting visual foundation.
- `docs/architecture/data-and-ai-boundary.md`: Sites storage, local media, and ChatGPT Work data boundary.
- `docs/architecture/configuration-authority.md`: repository, D1, module, secret, and setup authority.
- `docs/architecture/authorization.md`: identity, roles, access, and fulfillment authority.
- `docs/architecture/media-processing-contract.md`: local media preparation, R2 publication, derivatives, and delivery.
- `docs/provenance.md`: explicit visual authorization, private-material boundary, and functional reference ledger.

The prior implementation and its historical documents remain available in Git history after the source replacement.

### Product roles

`a-op` supports:

- Anonymous visitor: public catalog, public audio, public pages, public lessons, video, updates, and contact.
- Customer: profile, favorites, playlists, listening history, downloads, licenses, memberships, subscriptions, benefits, course progress, and unread updates.
- Editor: artist-approved content and catalog operations within assigned permissions.
- Owner: complete administration, configuration, roles, access, legal documents, telemetry, exports, and operations.

One installation belongs to an artist. Trusted collaborators can receive owner or editor roles. Customers belong to that installation.

### Complete capability map

Music and distribution:

- Artist identity, site navigation, public pages, drafts, previews, publication, and revision history.
- Releases, albums, tracks, collections, sequencing, artwork, credits, metadata, and availability.
- Original audio, streaming derivatives, download derivatives, range requests, persistent player state, queue, and playback history.
- Favorites, playlists, listening history, customer libraries, direct downloads, and delivery history.

Access, memberships, subscriptions, and licensing:

- Artist-controlled access grants, entitlements, revocations, expirations, delivery events, and customer history.
- Membership plans, subscription records, renewal dates, cancellation timing, benefits, and access.
- Download-credit and license-credit ledgers with grants, reservations, consumption, reversal, and history.
- Track licensing options, use details, terms versions, inquiries, artist approvals, license issuance, generated documents, entitlements, and customer history.
- One central server-side access decision for every protected resource.

Content and relationships:

- Courses, lessons, ordered mixed media, access modes, progress, completion, and resume.
- Video index, video pages, artist context, poster, credits, transcripts, external privacy gates, and artist-hosted media.
- Editorial pages and reusable structured sections.
- What's New publication, unread count, read receipts, and links to product activity.
- Contact forms, consent versions, inquiry categories, submissions, status, notes, and approved delivery integration.

Administration and operation:

- Artist state, active modules, navigation, content publishing, catalog, customers, access, memberships, subscriptions, licensing, Courses, video, updates, contact, and legal documents.
- First-party product telemetry, aggregate reporting, consent mode, retention, meaningful-listen threshold, Global Privacy Control, and Do Not Track handling.
- Privacy Policy and Terms and Conditions starters, setup answers, draft versions, approvals, publication, and history.
- Diagnostics, redacted logs, system health, media status, export, verification, and recovery.
- ChatGPT Work setup conversation, proposal preview, approved apply, reapply, natural-language source changes, maintenance, and portability.

### Target application structure

The official initializer determines the exact starter files. The product adds this stable organization:

    app/
      (public)/                     public artist routes
      account/                      customer routes
      admin/                        owner and editor routes
      api/                          server route handlers
      chatgpt-auth.ts               official Sites auth helpers
      layout.tsx                    global metadata and application shell
    components/
      public/                       artist-facing public components
      player/                       persistent audio player
      account/                      customer components
      admin/                        administration components
    db/
      schema.ts                     Drizzle D1 schema
      migrations/                   generated SQL migrations
    lib/
      auth/                         identity and role resolution
      access/                       central access decision
      catalog/                      music domain and repositories
      media/                        R2 metadata, ranges, and derivatives
      access/                       grants, entitlements, and delivery
      memberships/                  membership and subscription state
      licensing/                    license terms and issuance
      courses/                      courses, lessons, and progress
      telemetry/                    collection, consent, and aggregates
      setup/                        proposals, apply, export, and recovery
    public/                         static public assets
    scripts/                        deterministic setup and verification commands
    .openai/
      hosting.json                  Sites project and logical bindings

Server modules may use a different exact folder name when the starter requires it. The domain boundaries and interfaces stay stable.

### D1 data model

`db/schema.ts` defines tables and indexes for:

- `artist_config`, `artist_modules`, `artist_domains`, `navigation_items`, `pages`, `page_revisions`.
- `users`, `profiles`, `roles`, `role_assignments`, `audit_events`.
- `releases`, `tracks`, `release_tracks`, `collections`, `collection_tracks`, `credits`.
- `media_objects`, `media_derivatives`, `media_jobs`, `media_job_attempts`.
- `favorites`, `playlists`, `playlist_tracks`, `listening_history`.
- `entitlements`, `access_grants`, `download_events`.
- `membership_plans`, `subscriptions`, `subscription_events`, `benefit_definitions`.
- `credit_accounts`, `credit_ledger_entries`, `credit_reservations`.
- `license_options`, `license_terms_versions`, `issued_licenses`, `license_documents`.
- `courses`, `course_sections`, `lessons`, `lesson_items`, `course_progress`.
- `videos`, `video_transcripts`, `editorial_posts`.
- `updates`, `update_reads`.
- `contact_forms`, `contact_consent_versions`, `contact_submissions`, `contact_notes`.
- `telemetry_events`, `telemetry_daily_aggregates`, `telemetry_settings`.
- `legal_documents`, `legal_document_versions`.
- `setup_state`, `setup_applications`, `export_manifests`.

Every table uses durable identifiers, timestamps, explicit state values, and indexes that match real query paths. Foreign keys express ownership and lifecycle. Migrations are forward-moving and committed with the schema change.

### R2 object layout

R2 stores bytes under opaque identifiers:

    original-audio/<media-id>/<version>
    streaming-audio/<media-id>/<derivative-id>
    download-audio/<media-id>/<derivative-id>
    artwork/<media-id>/<version>
    video/<media-id>/<version>
    documents/<document-id>/<version>
    exports/<export-id>/<object-id>

Public metadata uses application routes and D1 records. Protected object delivery always passes through the server access contract. Original source audio receives a new immutable object for each approved source version.

### Identity and authorization

Use the starter's official `getChatGPTUser()` and `requireChatGPTUser(returnTo)` helpers. Dispatch owns the sign-in, sign-out, and callback paths.

The server maps the authenticated email to `users`, `profiles`, and `role_assignments`. Owner and editor checks come from these records. Customer access comes from public availability, memberships, subscriptions, licenses, credits, explicit grants, and resource ownership.

Protected pages are dynamic. API routes and server actions resolve identity and authority again on the server for each write or delivery action.

### Central access contract

Every protected resource calls:

    decideAccess(request: AccessRequest): Promise<AccessDecision>

`AccessRequest` includes identity, resource type, resource identifier, requested action, current time, and optional context. `AccessDecision` returns:

- `allowed`
- `reason`
- `source`
- `entitlementId`
- `expiresAt`
- `remainingUses`
- `downloadDisposition`

The decision can derive access from publication, ownership, an entitlement, a current membership or subscription, an issued license, a credit reservation, an explicit grant, a course grant, or an owner/editor role.

### Access, memberships, subscriptions, and licensing

The module registry keeps the supported capability set explicit:

    type ModuleKey =
      | "downloads"
      | "customer-library"
      | "licensing"
      | "memberships"
      | "subscriptions"
      | "courses"
      | "video"
      | "whats-new"
      | "contact"
      | "telemetry";

    interface ModuleDefinition {
      key: ModuleKey;
      requires: ModuleKey[];
      publicRoutes: string[];
      accountRoutes: string[];
      adminRoutes: string[];
      setupTopics: string[];
      telemetryEvents: string[];
    }

The application owns access-plan definitions, membership and subscription state, entitlements, credits, license issuance, and protected delivery. Validated owner actions update those records and the audit ledger together. Idempotency keys prevent repeated grants, renewals, credit changes, license issuance, or revocations from creating duplicate state.

Current official Sites guidance defines Sites as a non-financial web experience. Any future transaction work begins with a fresh official-policy check and an approved architecture decision.

### ChatGPT Work operation

`SETUP.md` and `AGENTS.md` teach a fresh ChatGPT Work task to:

1. Check the local Sites project and bindings.
2. Discuss the artist's material, rights, catalog, active modules, navigation, memberships, subscriptions, licensing, Courses, video, contact, telemetry, privacy, terms, and publication.
3. Preserve the artist's wording in a validated proposal.
4. Preview configuration, data, media, and external publication actions.
5. Apply an explicitly approved proposal.
6. Verify the public and administrative result.
7. Reapply safely as the artist's work changes.
8. Diagnose, export, restore into a disposable local target, and maintain the installation.

The exact visual foundation is already present. Once the complete baseline is running, the artist can direct visual, structural, naming, navigation, and module changes in natural language.

## Plan of Work

### Milestone 0: Establish the official Sites foundation

Create `codex/sites-rebuild` from the current integrated state. Inventory every tracked path and prepare an exact replacement manifest. Keep `AGENTS.md`, `PRODUCT.md`, `PLANS.md`, `plans/migrateAopToSites.md`, `LICENSE`, `THIRD_PARTY_NOTICES.md`, the current `.gitignore`, `docs/provenance.md`, and the current contracts in `docs/architecture/` in the active tree.

Run the current `sites:sites-building` initializer in a new empty temporary directory. Record the exact starter package versions and generated scripts. Apply the reviewed replacement manifest to the repository, copy the complete generated starter into the root, then restore the governing files.

Inspect `app/page.tsx`, `app/layout.tsx`, `app/globals.css`, `vite.config.ts`, `package.json`, and `.openai/hosting.json`. Replace starter metadata with `a-op: artist-owned platform`. Keep logical D1 and R2 bindings ready for later milestones.

Port the complete foundation in `docs/architecture/visual-direction.md` into React:

- Pin Lato and its license.
- Implement the exact semantic color values and both themes.
- Implement shared type, spacing, corner, surface, control, focus, motion, and accessibility primitives.
- Build the neutral `a-op` home shell and living image mosaic with four rows.
- Build the two-row mosaic header primitive for About, Courses, Videos, Membership, Licensing, Contact, FAQ, and What's New.
- Track recent mosaic compositions so a composition repeats only after the available combination space has been exhausted.
- Keep Music, detail, account, authentication, cart, administration, and legal surfaces on functional layouts.

Start the development server, open the exact printed local URL once, and run the production build.

Acceptance:

- The active application source is the official Sites structure.
- The old Nuxt application paths have left the active tree.
- The development server renders the complete `a-op` visual foundation in dark and light themes.
- The living image mosaic runs from redistribution-safe neutral assets, pauses outside the viewport, and honors reduced motion.
- `npm run build` creates Cloudflare Worker-compatible output.
- The governing files remain present and current.

### Milestone 1: Prove the runtime contracts

Build a small internal runtime laboratory before product surfaces expand.

Implement:

- D1 connection helper, schema bootstrap, generated migration, prepared statements, batch writes, and transaction helper.
- R2 put, head, get, ranged get, metadata, and delete helpers.
- Optional identity display through `getChatGPTUser()`.
- Protected route through `requireChatGPTUser()`.
- Server-side role lookup with fictional owner, editor, and customer records.
- Byte-range endpoint that returns `200`, `206`, `403`, `404`, and `416` correctly.
- Redacted error envelope, request identifier, structured logging, and health route.
- Test-only simulation mode selected through server-managed configuration.

Acceptance:

- A D1 record survives a restart.
- An R2 object uploads and streams through a range request.
- Anonymous, customer, editor, and owner requests receive the expected authority result.
- Browser code receives zero D1 or R2 credentials.
- Production build and focused runtime checks pass.

### Milestone 2: Create module authority, artist state, and the shared shells

Build the durable artist state, module registry, and application frames that every capability uses.

Implement artist identity, module definitions and dependencies, active-module state, navigation, footer, pages, publication state, user profiles, roles, role assignments, audit events, owner bootstrap, editor management, customer profiles, public route layout, account layout, and administration layout.

Use plain `a-op` labels and placeholders inside the exact visual foundation. The owner can add and publish artist material, navigation, and active modules through administration. The public Site reads published D1 state and renders only active capabilities.

Acceptance:

- A new installation displays the complete visual foundation with neutral content.
- An owner can update artist material, navigation, and active modules.
- An installation can run music streaming alone and later activate another module while preserving state.
- An editor can perform an assigned content action.
- A customer receives customer routes and public content.
- Anonymous visitors receive published public routes.
- Role checks run on the server for every write.

### Milestone 3: Build music publishing and streaming

Implement the music center:

- Release, track, collection, credit, artwork, and availability repositories.
- Administration for create, edit, sequence, preview, publish, unpublish, and revise.
- Public music index, release page, track page, collection page, search, filters, and sorting.
- Original-audio metadata, approved derivatives, media status, and artist-controlled availability.
- Persistent player with play, pause, seek, previous, next, queue, repeat, volume, route persistence, and accessible keyboard behavior.
- Authorized range streaming from R2.
- Meaningful-listen event boundary for later telemetry.

Acceptance:

- An owner publishes a release containing ordered tracks.
- A visitor browses the release and streams a public track.
- Seeking produces a valid range response.
- Navigation preserves the active player and queue.
- Published and draft states produce the correct public result.
- Mobile and keyboard use cover the complete listening path.

### Milestone 4: Build customer accounts and libraries

Implement signed-in customer behavior:

- Profile creation from the authenticated ChatGPT identity.
- Favorites for releases and tracks.
- Ordered playlists and playlist items.
- Listening history and resume position.
- Customer library that combines memberships, subscriptions, licenses, credits, and explicit grants.
- Protected stream and download delivery through `decideAccess`.
- Account history for access grants and deliveries.

Acceptance:

- A customer signs in, saves a track, creates a playlist, and resumes listening.
- The library explains why each resource is available.
- Protected resources return an authorized stream or download only after the server access decision.
- Revoked or expired access changes the library and delivery result immediately.

### Milestone 5: Build artist-controlled access and delivery

Implement the shared access-state workflows:

- Access-plan definitions connected to tracks, releases, collections, downloads, memberships, subscriptions, credits, and licenses.
- Validated owner grants, revocations, expirations, and access explanations.
- Entitlement creation, delivery history, and protected downloads.
- Idempotent server operations and audit events for every access-state change.
- Owner access, entitlement, and delivery administration.

Acceptance:

- An owner grants a customer access and one set of entitlements is created.
- Replaying the same grant creates zero duplicates.
- A browser navigation or client-state change creates zero access.
- Revocation or expiry updates access according to the configured rule.
- The customer sees accessible resources, downloads, access sources, and history.

### Milestone 6: Build memberships, subscriptions, credits, and licensing

Implement recurring access and music-rights workflows:

- Membership and subscription plans with renewal cadence, benefits, access scope, download credits, and license credits.
- Subscription lifecycle for pending, active, paused, cancellation scheduled, canceled, and expired.
- Renewal history and customer access management.
- Credit ledger with grant, reservation, consumption, release, reversal, expiration, and balance.
- Licensing options per track, intended-use input, terms version, artist approval or license-credit redemption, issued license, generated document, entitlement, download, and customer history.
- Owner administration for plans, subscribers, renewals, cancellations, credits, licenses, and issued documents.

Acceptance:

- An owner activates a customer's membership or subscription and the customer receives its access and credits.
- Renewal adds the configured benefits exactly once through an idempotent server action.
- Cancellation applies at the configured boundary.
- One license credit covers the configured track and project scope and enters the immutable ledger.
- A customer obtains an issued license and sees it in account history.
- The artist can audit the complete subscription and license lifecycle.

### Milestone 7: Build Courses, video, pages, What's New, and contact

Implement the remaining public publishing tools:

- Courses, sections, lessons, ordered mixed-media items, access modes, progress, completion, and resume.
- Video index and detail routes, posters, artist context, credits, transcripts, external embed consent, and artist-hosted media.
- Structured pages and reusable content sections.
- What's New drafts, publication, unread count, read receipts, and resource links.
- Contact-form configuration, consent version, inquiry category, submission, administration status, notes, and approved delivery adapter.

Acceptance:

- A customer opens an allowed lesson, completes items, and resumes later.
- Protected lesson media follows the central access contract.
- A visitor reads video context and transcript before loading an external player.
- A customer sees an unread update count and clears it by reading updates.
- A contact submission stores the exact consent version and appears in administration.

### Milestone 8: Build telemetry, legal documents, and operations

Implement:

- Allowlisted first-party telemetry events with random session identifiers and optional internal user linkage.
- Consent mode, retention, pruning, meaningful-listen threshold, Global Privacy Control, and Do Not Track behavior.
- Daily aggregate queries and administration views for sessions, actions, listens, music, video, Courses, contact, memberships, subscriptions, and licensing.
- Privacy Policy and Terms and Conditions starters, setup answers, draft versions, artist approval, publication, and history.
- Diagnostics for D1, R2, identity, media jobs, migrations, and recent redacted failures.
- Operations views for health, job retry, access explanation, audit events, and safe maintenance.

Acceptance:

- Configured telemetry records only allowlisted fields.
- Consent and privacy signals change collection behavior immediately.
- Retention pruning removes eligible events and preserves aggregate facts.
- The artist edits, approves, publishes, and revises legal documents.
- Diagnostics identify a broken binding or media configuration through redacted output.

### Milestone 9: Make ChatGPT Work the setup and maintenance environment

Create the complete artist setup contract.

Implement `SETUP.md`, proposal schemas, ignored proposal storage, preflight, conversation prompts, preview, apply, reapply, check, diagnose, local media preparation, Site publication, export, export verification, disposable-local restore rehearsal, and maintenance commands.

The setup interview covers:

1. Artist name, words, and public contact.
2. Active capabilities and navigation.
3. Rights and approved media.
4. Catalog and release structure.
5. Streaming and download availability.
6. Customer libraries, grants, and protected delivery.
7. Memberships and subscriptions.
8. Download credits and license credits.
9. Licensing options and terms.
10. Courses and video.
11. Contact and consent.
12. Telemetry and retention.
13. Privacy and terms.
14. Accounts and publication.

The installation begins with the complete visual foundation. The conversation collects immediate source-level visual or structural changes only when the artist asks for them. Once the baseline is running, ChatGPT Work and Codex support ongoing natural-language changes to the visual system, page structure, names, navigation, active modules, and new functionality.

The local media command receives an artist-approved path, performs inspection and conversion locally, presents a derivative manifest, and publishes approved outputs to the Site. Product and setup language describe this as adding music to the artist's Site. R2 receives the approved bytes and D1 receives their metadata and access rules.

Preview displays the complete proposed changes, media actions, and external publication actions. Apply records approval and uses idempotent keys so reapply updates the intended records and creates each media job once.

Export creates artist configuration, catalog, access definitions, memberships, subscriptions, licensing definitions, content, legal versions, customer-independent operational configuration, media manifests, and checksums at an artist-approved local path. Customer-data export and hosted backup actions use their own approval and privacy review.

Acceptance:

- A fresh ChatGPT Work task can understand the repository from `AGENTS.md` and `SETUP.md`.
- Preflight identifies the exact local resources available.
- Preview mutates zero product state.
- Approved apply produces the configured public and administrative result.
- Reapply creates zero duplicate records or jobs.
- Export verification passes checksums and schema validation.
- Disposable-local restore reproduces equivalent artist content and access definitions.

### Milestone 10: Integrate, harden, and host the complete product

Run the complete user stories in one application:

1. Owner setup and identity publication.
2. Release creation, media preparation, publication, and streaming.
3. Customer sign-in, favorite, playlist, and listening history.
4. Artist-controlled access grant, library, and protected download.
5. Membership or subscription activation, renewal, credits, and cancellation.
6. License approval or credit redemption, issuance, document, and delivery.
7. Course access, progress, and resume.
8. Video, update, and contact.
9. Telemetry, legal documents, diagnostics, export, and recovery.

Verify production build, D1 migrations, R2 object policy, authorization boundaries, access-operation idempotency, accessibility, keyboard use, reduced motion, mobile layouts, touch targets, contrast, performance, redaction, and recovery.

Save one Sites version from the exact validated commit and packaged output. After Michael approves the specific hosting action and access level, use `sites:sites-hosting`, wait for deployment success, and open the returned Sites URL.

Acceptance:

- Every story completes from a clean local state.
- The exact source commit produces a successful Sites build and saved version.
- The approved hosted Site uses connected D1 and R2 bindings.
- Public music, customer account, protected delivery, and owner administration work at the hosted URL.
- Hosted errors and logs preserve the redaction contract.

## Parallel Execution

The primary task owns shared schemas, interfaces, repository replacement, integration, migrations, and the running application. Ten bounded assignments move in four waves.

Wave 1:

1. D1 schema, repositories, identity, roles, and access.
2. Exact visual foundation, public shell, account shell, administration shell, module registry, and navigation.
3. Music catalog, R2 media, range streaming, and player.

Wave 2:

4. Customer profiles, favorites, playlists, history, library, and delivery.
5. Access grants, entitlements, protected delivery, and customer access history.
6. Memberships, subscriptions, credits, licensing, and issued documents.

Wave 3:

7. Courses, lessons, media access, progress, and resume.
8. Video, structured pages, What's New, contact, and inquiries.
9. Telemetry, consent, privacy, terms, diagnostics, and operations.

Wave 4:

10. ChatGPT Work setup, media preparation, export, restore rehearsal, and maintenance.

Each assignment receives explicit file ownership and stable shared interfaces. The primary task integrates one wave, resolves shared changes, runs the milestone gate, and commits the coherent result before the next wave begins.

## Concrete Steps

Run all repository commands from the checked-out repository root.

### Confirm the exact starting point

    git status --short --branch
    git branch --show-current
    git remote -v

Expected remote:

    origin  https://github.com/sunflower-of-parchman/a-op.git

Review the governing files:

    sed -n '1,240p' AGENTS.md
    sed -n '1,240p' PRODUCT.md
    sed -n '1,220p' PLANS.md
    sed -n '1,320p' docs/architecture/visual-direction.md
    sed -n '1,240p' docs/architecture/data-and-ai-boundary.md
    sed -n '1,999p' plans/migrateAopToSites.md

### Refresh official Sites facts

Invoke the current `sites:sites-building` skill and read its linked persistence and authentication references. Use current official OpenAI documentation for every platform behavior. Record the initializer path, package versions, build scripts, D1 contract, R2 contract, authentication helpers, packaging command, and hosting connector shape in `Surprises & Discoveries`.

### Create the implementation branch

After the governing documents enter a coherent saved state:

    git switch -c codex/sites-rebuild
    git status --short --branch
    git ls-files

Build a reviewed replacement manifest containing the exact tracked paths leaving the active tree. Preserve the governing files listed in Milestone 0. Apply the manifest through `git rm --pathspec-from-file=<reviewed-manifest>`.

### Initialize the official starter

Create an empty temporary target:

    aop_starter_dir="$(mktemp -d /private/tmp/a-op-starter.XXXXXX)"
    cd "$aop_starter_dir"

Run the current Sites plugin's root-level `scripts/init-site.sh` with `$PWD` as its target. The active skill supplies the exact installed plugin path. Retain the installer session until dependency installation finishes.

Return to the repository and copy the generated starter structure into the root with a bulk mechanical copy that excludes `.git`. Restore the governing files and inspect:

    cd <a-op-repository-root>
    sed -n '1,240p' package.json
    sed -n '1,240p' app/page.tsx
    sed -n '1,240p' app/layout.tsx
    sed -n '1,260p' app/globals.css
    sed -n '1,240p' vite.config.ts
    sed -n '1,200p' .openai/hosting.json

Start the exact generated development command, retain its session, open the printed local URL once, and run:

    npm run build

Expected result: the local Site renders `a-op`, and the production build emits `dist/server/index.js`.

### Establish standard project commands

Add and maintain these scripts in `package.json`:

    npm run dev
    npm run build
    npm run typecheck
    npm run format:check
    npm run db:generate
    npm run db:migrate:local
    npm run verify:runtime
    npm run verify:music
    npm run verify:accounts
    npm run verify:access
    npm run verify:memberships
    npm run verify:licensing
    npm run verify:content
    npm run verify:operations
    npm run verify:setup
    npm run verify:all

Each command must exit successfully only after its named functional contract passes. Keep the command implementation small and product-specific.

### Apply schema changes

For each D1 milestone:

1. Update `db/schema.ts`.
2. Run `npm run db:generate`.
3. Inspect every generated SQL statement.
4. Run `npm run db:migrate:local`.
5. Exercise the affected product workflow.
6. Run the focused verification command and `npm run build`.

Prepared statements contain exactly one SQL statement. Multi-statement operations use D1 `batch` or the project transaction helper.

### Integrate each wave

Before a wave:

    git status --short
    npm run build

After each assignment returns:

1. Read the complete patch.
2. Reconcile shared schemas and interfaces first.
3. Integrate the assignment into the running application.
4. Exercise its public or administrative journey.
5. Run the focused verification command.
6. Run `npm run build`.
7. Update this ExecPlan.

After all assignments in the wave:

    npm run verify:all
    npm run build

### Save and host the complete Site

After the complete local gate passes, commit the exact validated source. Use the current `sites:sites-hosting` workflow to:

1. Create or reuse the Sites project.
2. Persist only the returned `project_id` and logical bindings in `.openai/hosting.json`.
3. Push the exact commit using the temporary source credential through a per-command authorization header.
4. Package with the current plugin's `scripts/package-site.sh`.
5. Save one Site version from the commit SHA and archive.
6. Request Michael's approval for the resolved deployment access level.
7. Deploy at the approved level.
8. Poll the deployment to success.
9. Open the exact deployed URL.
10. Exercise public music, customer access, protected delivery, and owner administration.

## Validation and Acceptance

### Foundation

- The active tree uses the current official Sites starter.
- `.openai/hosting.json` declares the logical D1 and R2 bindings.
- Production build emits the required Worker-compatible server output.
- D1 migration generation and local application succeed.
- R2 put, get, head, range, and metadata behavior succeeds.
- Official Sign in with ChatGPT helpers drive protected routes.

### Music

- Owner publishes a release, tracks, artwork, credits, and media.
- Visitor browses the catalog and streams with valid seeking.
- Player state persists across route navigation.
- Draft and published state produce the intended public result.
- Original media and derivatives have traceable versioned records.

### Accounts and access

- Customer signs in, saves favorites, creates playlists, and resumes listening.
- Library explains access source for memberships, subscriptions, licenses, credits, and grants.
- Every protected stream, download, lesson asset, and license document calls `decideAccess`.
- Owner and editor writes use server-side role checks.

### Access and delivery

- Validated owner action creates entitlement state and its audit event together.
- Replaying the same access operation produces one durable result.
- Expiry, cancellation, and revocation apply the configured access rule.
- Customer account shows membership, subscription, license, credit, access, and delivery history.

### Memberships, subscriptions, and licensing

- Plan configuration controls renewal cadence, access, benefits, and credits.
- Activation, renewal, cancellation, and expiration update access at the correct boundary.
- Credit ledger balances reconcile from immutable entries.
- License issuance records the selected track, project scope, customer, terms version, artist approval or credit source, entitlement, and document.

### Courses, video, updates, and contact

- Course access and progress survive sessions.
- Video context and transcript precede external embed activation.
- What's New unread state updates per customer.
- Contact submission records consent version and appears in administration.

### Telemetry, legal, and operations

- Telemetry accepts allowlisted fields and obeys consent, retention, GPC, and DNT settings.
- Artist publishes versioned privacy and terms documents.
- Diagnostics report binding, media, migration, and access health through redacted output.
- Export and disposable-local restore reproduce equivalent artist state.

### Complete product

- All ten user stories in Milestone 10 pass from a clean local state.
- Responsive layouts work at narrow phone, tablet, laptop, and wide desktop widths.
- Keyboard navigation, focus, reduced motion, contrast, and touch targets pass.
- Production build and complete verification pass from a clean dependency install.
- Approved Sites deployment completes from the exact validated source.

## Idempotence and Recovery

Git provides the source recovery boundary. The prior Nuxt source remains reachable through history after the active tree replacement. Each integrated functional milestone receives a coherent commit when Michael asks to save work.

D1 migrations move forward. Each schema change uses generated and inspected SQL. Local migration rehearsal targets the local binding. Hosted migration packaging uses the Sites contract.

Original R2 media objects are immutable. A retry reuses an idempotency key or creates a new derivative version. D1 stores the status and object identifiers required to resume an interrupted Site publication or job.

Access operations use a stable idempotency key. The access state and audit event are written together. Replayed operations return the existing result.

Credit activity uses immutable ledger entries. Reservations and reversals preserve a complete balance history.

Setup proposals carry a content hash, source-state fingerprint, approval record, and idempotency keys. Preview changes zero durable product state. Reapply updates the intended records and reuses existing media jobs.

Exports use a manifest, schema version, object list, sizes, and checksums. Restore rehearsal uses a disposable local D1 and R2 target and confirms the target before applying.

External publication actions pause at their explicit approval point. Local implementation continues through deterministic fixtures while those choices remain pending.

## Artifacts and Notes

Repository rename completed on 2026-07-18:

    https://github.com/sunflower-of-parchman/a-op

The repository remains private. The local `origin` uses the new URL.

Current official Sites guidance establishes:

- The capability path for multi-route sites with persistence, storage, identity, and uploads.
- D1 for structured durable state.
- R2 for audio, video, images, documents, exports, and other bytes.
- Logical bindings in `.openai/hosting.json`.
- Dispatch-owned Sign in with ChatGPT routes and server helpers.
- React, TypeScript, vinext, Vite, the Sites Vite plugin, and Worker-compatible output.
- Version packaging and hosting through the Sites workflow.

Implementation must refresh these facts at the start of Milestone 0 because platform commands and package versions can change.

The Sound for Movement company repository remains live, private, and read-only throughout implementation. Rebuild its authorized visual framework exactly in fresh React code and record the resulting paths and verification in `docs/provenance.md`. Keep company identity, content, media, customer data, secrets, endpoints, and machine paths in their existing private locations.

## Interfaces and Dependencies

### Platform dependencies

- Current official Sites starter.
- React and TypeScript versions produced by that starter.
- vinext and Vite versions produced by that starter.
- Sites Vite plugin and Cloudflare Worker-compatible build.
- D1 logical binding, normally `DB`.
- R2 logical binding, normally `MEDIA`.
- Drizzle schema and generated migrations.
- Dispatch-owned Sign in with ChatGPT helpers.
- Current Sites packaging and hosting connectors.

### Product interfaces

    type Role = "owner" | "editor" | "customer";

    interface IdentityContext {
      userId: string;
      email: string;
      fullName?: string;
      roles: Role[];
    }

    interface AccessRequest {
      identity: IdentityContext | null;
      resourceType: string;
      resourceId: string;
      action: "view" | "stream" | "download" | "edit" | "manage";
      now: string;
      context?: Record<string, unknown>;
    }

    interface AccessDecision {
      allowed: boolean;
      reason: string;
      source:
        | "public"
        | "role"
        | "membership"
        | "subscription"
        | "license"
        | "credit"
        | "grant"
        | "ownership";
      entitlementId?: string;
      expiresAt?: string;
      remainingUses?: number;
      downloadDisposition?: string;
    }

    interface MediaStore {
      put(input: MediaPutInput): Promise<MediaObject>;
      head(objectKey: string): Promise<MediaObjectHead | null>;
      get(objectKey: string): Promise<MediaBody | null>;
      getRange(objectKey: string, range: ByteRange): Promise<MediaRangeBody | null>;
      remove(objectKey: string): Promise<void>;
    }

    interface SetupProposal {
      schemaVersion: string;
      sourceFingerprint: string;
      artist: ArtistConfigurationInput;
      activeModules: ModuleKey[];
      catalog: CatalogProposal;
      access: AccessProposal;
      memberships: MembershipProposal[];
      subscriptions: SubscriptionProposal[];
      licensing: LicensingProposal;
      courses: CourseProposal;
      video: VideoProposal;
      contact: ContactProposal;
      telemetry: TelemetryProposal;
      legal: LegalProposal;
      media: MediaProposal[];
      externalActions: ExternalActionProposal[];
      approval?: ApprovalRecord;
    }

### Stable behavioral contracts

- Authentication comes from official Sites identity helpers and forwarded headers.
- Authorization comes from server-owned roles and `decideAccess`.
- D1 owns structured product state.
- R2 owns media and document bytes.
- The complete visual foundation in `docs/architecture/visual-direction.md` is the first implementation baseline.
- The module registry determines active public routes, account routes, administration, setup topics, jobs, and telemetry.
- An artist controls their fork, deployment, content, data, customer relationship, and artist-specific source changes.
- Original media objects remain immutable.
- Validated artist actions create auditable access state.
- Credit ledgers and issued license terms remain durable and auditable.
- Local media commands prepare artist-approved paths and publish approved outputs to the artist's Site.
- Ordinary Site operation is application-driven; deliberate ChatGPT Work sharing follows the artist's workspace controls.
- ChatGPT Work setup uses preview, explicit approval, idempotent apply, and verification.
- Michael approves identity, rights, access plans, legal language, accounts, and publication.

Revision note, 2026-07-18: Renamed the product and private GitHub repository to `a-op`, set the full title to `a-op: artist-owned platform`, centered the active plan entirely on working product behavior, placed the official Sites foundation first, allowed the active Nuxt tree to be replaced once the starter is ready, and retained the live Sound for Movement company repository as a private read-only functional reference.

Revision note, 2026-07-18: Made the complete Sound for Movement visual framework the exact React starting point, added modular capability activation and artist-controlled fork ownership, adopted `Courses` as the public teaching name, moved media intake to artist-approved local processing followed by Site publication, and recorded the verified D1, R2, application-runtime, and ChatGPT Work data boundaries.

Revision note, 2026-07-18: Centered the governing documents on application capabilities and durable state. Added exact artist-ownership language, identified D1 and R2 as Sites-provided storage inside the Sites service boundary, qualified model-training statements by workspace controls, and aligned access, memberships, subscriptions, credits, licensing, and delivery with the current Sites non-financial runtime scope.
