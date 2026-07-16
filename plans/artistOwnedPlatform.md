# Build the complete artist-owned web platform

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This plan must be maintained in accordance with `PLANS.md` at the repository root.

## Purpose / Big Picture

Build a complete, open-source, web-only platform that lets an independent musician operate a distinctive digital home on infrastructure they control. After implementation, an artist can use Codex to configure the project, connect a Supabase database and Stripe account, apply their identity, import and maintain albums and tracks, publish audio and video, sell downloads, offer music licenses and memberships, create educational paths, manage customer entitlements, view privacy-conscious telemetry, and deploy the site to a host such as Vercel under their own domain.

The platform is not an artificial-intelligence feature embedded in a music site. It is software designed to be understood, configured, and maintained by Codex in partnership with a nontechnical artist. The repository must therefore serve two audiences: the artist who makes creative and business decisions, and the coding agent that performs technical setup and implementation. A fresh clone must include safe agent instructions, human-readable guidance, working demonstration content, repeatable setup checks, and a path from local development to an explicitly approved deployment.

The working result is visible through one complete journey. Starting from a fresh clone, an artist tells Codex about their work and points it to a small approved media folder. Codex prepares the local environment, asks for creative and business choices, imports an album and tracks for approval, and launches a personalized site. A visitor can listen, create an account, complete a Stripe test purchase or license, receive the correct entitlement, access protected material, follow a learning path, and see video and editorial content. The artist can maintain these areas through an authenticated administration workspace. Automated tests, health checks, and a seeded judging deployment prove the system behaves safely.

This ExecPlan delivers the full product during OpenAI Build Week. The milestones are ordered by technical dependency so the application remains runnable while the complete surface is assembled. “Complete” means every capability described above works coherently in the supported single-artist deployment model. The defined product is a web platform for one artist or artist-led organization; multi-tenant marketplaces, native applications, digital-rights-management systems, tax-compliance services, general-purpose drag-and-drop builders, and AI features inside the deployed website are separate products outside this definition.

## Progress

- [x] (2026-07-14 23:19Z) Confirmed Build Week registration, submission requirements, deadlines, evidence requirements, and external-publication approval boundaries in `BUILD_WEEK.md`.
- [x] (2026-07-14 23:19Z) Chose the product direction: a web-only, artist-owned platform built and configured with Codex, without a required AI runtime feature.
- [x] (2026-07-14 23:19Z) Inspected the private Sound for Movement web stack read-only and confirmed that it contains proven patterns for Nuxt, Supabase, Stripe, music cataloging, audio, memberships, licensing, learning, video, administration, and telemetry.
- [x] (2026-07-14 23:19Z) Added the repository planning convention in `PLANS.md` and created this full-product ExecPlan.
- [x] (2026-07-15 00:03Z) Designated this as the primary implementation task, recorded GPT-5.6 Sol and GPT-5.6 Pro, and created the model-and-agent-use and capability-evidence records.
- [x] (2026-07-15 00:03Z) Established the configuration-authority and local/deployed media-processing contracts before application implementation.
- [x] (2026-07-15 00:19Z) Established the product contract, repository instructions, public language, provenance boundary, visual direction, architecture decision records, and Developer Tools track.
- [x] (2026-07-15 01:12Z) Completed Milestone 1: pinned and clean-installed the Nuxt 4 foundation; validated the fictional artist and semantic theme; started, migrated, seeded, and checked local Supabase; generated database types; passed unit, integration, database, production-build, desktop/mobile navigation, axe, and visual acceptance checks; and committed the implementation as `83c3b4f`.
- [x] (2026-07-15 01:48Z) Completed Milestone 2: created the consolidated account, role, publication, media, product, payment, order, entitlement, download, and storage schema; added email signup/sign-in, explicit owner bootstrap, owner/editor/customer RLS, seven buckets, server sessions, protected administration, public preview, private delivery, generated types, and role-policy tests; and committed the implementation as `12f5d66`.
- [x] (2026-07-15 01:48Z) Passed Integration Gate A from a clean reset: one generated public WAV played; four deliveries of one simulated event produced one payment event, order, and entitlement; the entitled customer received a 60-second signed file; the second customer received HTTP 403; the production browser-secret scan, schema lint, Chromium gate journeys, and full 10-test desktop/mobile regression passed.
- [x] (2026-07-15 02:36Z) Completed Milestone 3: made Supabase authoritative for runtime identity and design; added validated draft, preview, and explicit publication; implemented contact, social, distribution, logo, imagery, typography, navigation, footer, SEO, feature controls, all nine structured page-section editors, contact storage, audit records, unsaved-change protection, and responsive administration; and committed the implementation as `0982946` and `37a7b12`.
- [x] (2026-07-15 15:56Z) Complete the open-source license gate in commit `fd9dfd8`: Michael selected `AGPL-3.0-or-later`; the standard GNU license text, package metadata, README, ADR, and original demonstration-asset ledger agree. Publication remains separately approval-gated.
- [x] Implement artist onboarding, site configuration, design tokens, navigation, editable pages, contact surface, search-engine metadata, and the authenticated administration workspace.
- [x] (2026-07-15 04:21Z) Implemented Milestone 4 locally: release and collection drafts with atomic publication and authored order; manual and manifest-based catalog intake; signed resumable direct uploads; immutable source media; artwork optimization; durable local and container media processing; generated previews and waveforms; public catalog pages; persistent playback; and isolated customer favorites, playlists, and history. Commits `bc89195`, `021bc7a`, `ea7c0f9`, `fd17435`, `57587c1`, `db4e560`, and `21476f6` contain the implementation.
- [x] (2026-07-16 04:14Z) Completed the approval-gated Milestone 4 hosted-worker proof: the private deployed media service moved one generated fictional WAV through `pending -> processing -> ready`, produced one playable derivative and a 120-point waveform, preserved the immutable source hash, and passed retry plus expired-lease recovery.
- [x] (2026-07-15 05:03Z) Implemented Milestone 5 locally: service-neutral offerings and provider mappings; free, external, one-time, and recurring actions; server-created Checkout and portal sessions; raw-body signed webhooks; replay-safe atomic orders, subscriptions, refunds, cancellations, and entitlements; protected downloads; redacted webhook-failure recovery; owner operations; local simulation; and responsive customer journeys. Commit `058201c` contains the implementation.
- [x] (2026-07-16 04:14Z) Completed the approval-gated Milestone 5 Stripe sandbox proof: one-time purchase, signed fulfillment, replay idempotency, protected delivery, membership activation, portal-scheduled cancellation, terminal access removal, partial-refund retention, full-refund revocation, and cross-account denial passed with test-only objects.
- [x] (2026-07-15 05:42Z) Implemented Milestone 6 locally: explicit non-exclusive supported-use templates; immutable versioned selections; license-specific local and Stripe test checkout paths; replay-safe atomic issue and refund revocation; private ReportLab PDF generation; durable leased document recovery; entitlement-checked account delivery; owner operations; inquiry routing; and responsive customer journeys. Commit `d6991d2` contains the implementation.
- [x] (2026-07-16 04:14Z) Completed the approval-gated Milestone 6 Stripe sandbox proof: the USD 75 fictional dance-film checkout froze its exact terms, issued one replay-safe license, rendered a protected two-page PDF through the private document service, allowed purchaser delivery, denied the second account, and preserved refund revocation behavior.
- [x] (2026-07-15 07:34Z) Implemented Milestone 7: normalized learning areas, paths, courses, lessons, mixed-media sections, four access modes, progress and account resume, private delivery, safe rich text, consent-gated video, editorial drafts, explicit publication, complete owner previews, CI, and deterministic desktop/mobile browser verification. Commit `b49c36c` contains the implementation.
- [x] (2026-07-15 08:04Z) Implemented Milestone 8: optional first-party event collection with explicit consent and GPC/DNT enforcement; minimal session-only identifiers and bounded allowlisted fields; retention pruning; owner-only aggregates and settings; separate redacted setup, storage, worker, payment, delivery-adapter, and migration status; `npm run diagnose`; CI; and deterministic desktop/mobile browser verification. Commit `1b585c9` contains the implementation.
- [x] (2026-07-15 08:24Z) Implemented Milestone 9: a 14-topic Codex interview contract; ignored structured proposals; stale-aware read-only preview and diff; explicit local approval; deterministic configuration and two-track media application; post-apply verification; idempotent project-state updates; provider-neutral service, recovery, and maintenance runbooks; CI; and a complete fictional-artist integration proof. Commit `ce976ff` contains the implementation.
- [x] (2026-07-15 08:52Z) Implemented Milestone 10: deterministic versioned artist exports; strict content, media, service, operations, and manifest schemas; SHA-256 artifact and media inventories; explicit private/customer-data exclusions; tamper detection; local-only restore confirmation; migration-clean disposable restoration; exact comparison of all 25 portable tables; direct-public data and media checks; six service reconnection runbooks; CI; and automatic fictional-demo recovery. Commit `e12d3be` contains the implementation.
- [x] (2026-07-15 11:05Z) Implemented Milestone 11: same-origin request and redirect boundaries; strict production headers and content security policy; safe external-link schemas; secure cookies; request-size and rate limits; responsive empty, loading, offline, and unavailable states; one-main semantics; keyboard, focus, reduced-motion, viewport, and axe checks; explicit production performance budgets; pinned isolated PDF rendering; recovery runbooks and executable drills; local-only destructive guards; Auth/Kong reset recovery; CI; zero dependency vulnerabilities; clean database lint; and one passing uninterrupted full verification aggregate. Commit `8d1fca5` contains the implementation.
- [x] (2026-07-15 11:43Z) Completed all approval-independent Milestone 12 work: coherent fictional assets and provenance; screenshots; README, contribution, judge, and hosted-test documentation; deterministic `demo:local` and `demo:reset`; Chromium/WebKit coverage; one comprehensive clean-room rehearsal; and a second untouched two-command novice rehearsal that returned HTTP 200 and left the clone clean. Commits `aead7ab` and `0ab2c9e` contain the package.
- [x] (2026-07-15 11:43Z) Prepared the approval-independent Milestone 13 package: working description, judging guide, hosted plan, 2:55 demo script, submission checklist, final-authorization record, and clean-clone evidence. Commit `0ab2c9e` contains the public-facing materials.
- [x] (2026-07-15 12:05Z) Added `verify:package` to the full verification contract and passed one uninterrupted Node 24 aggregate across the foundation, authority spine, administration, catalog and media, commerce, licensing, learning, telemetry, setup, portability, hardening, recovery, 11 isolated desktop/mobile browser specifications, documentation and asset validation, Chromium/WebKit public judge journeys, and browser-secret scanning. Commit `6cd3575` records the aggregate contract.
- [x] (2026-07-15 12:22Z) Closed two completion-audit gaps: implemented optional Supabase OAuth as a typed, closed-default server-side PKCE flow with secure transaction cookies and a configured browser gate; and expanded the 15-job Linux workflow to cover catalog/media, commerce, dependency audit, the complete isolated browser regression, and the supported browser matrix. Commit `fdbd9fa` contains the implementation.
- [x] (2026-07-15 13:03Z) Passed the post-audit full Node 24 aggregate with optional OAuth and the expanded package contract: every local module, Integration Gate A, security, accessibility, four production performance budgets, recovery and clean restore, final setup and authority checks, 12 isolated desktop/mobile browser specifications, documentation and fictional assets, Chromium/WebKit judge journeys, and browser-secret scanning.
- [x] (2026-07-15 13:29Z) Prepared the complete approval-gated hosted operator path and safe evidence ledger: final-candidate freeze, provider isolation, Supabase dry-run and forward migration, project-bound reset contract, Stripe test journeys, deployed media/document workers, immutable Vercel preview, all-browser hosted proof, advisor review, two-reset rehearsal, availability handoff, and failure/rollback rules.
- [x] (2026-07-15 13:30Z) Implemented and locally proved the guarded hosted judge lifecycle in commit `c3dcf2d`: exact project/link/schema/marker/account/storage/fingerprint guards; private hosted identities; one-statement atomic initialization and targeted reset; preservation of provider configuration and Stripe mappings; seven-bucket cleanup; four-user session rotation; canonical Daymark restoration; redacted evidence; and two idempotent disposable local reset rehearsals integrated into `verify:recovery`.
- [x] (2026-07-15 13:55Z) Passed one uninterrupted post-reset Node 24 aggregate from checkpoint `b226602`: every local module, Integration Gate A, optional OAuth, setup and portability, production security/accessibility and four performance budgets, the guarded hosted-reset contract, recovery, 12 isolated desktop/mobile browser specifications, documentation and fictional assets, Chromium/WebKit public judge routes, and browser-secret scanning. A fresh dependency audit found zero vulnerabilities and local `public,private` database lint found no schema errors.
- [x] (2026-07-15 14:01Z) Reconciled the primary task against exported Codex Desktop metadata: task and session ID `019f6291-c1c9-7cf3-9da7-be2a19b7154c`, GPT-5.6 Sol for primary-task implementation turns, and GPT-5.6 Pro as the separate plan-analysis reviewer whose adopted recommendations Michael supplied to this task. Completion-time `/feedback` confirmation remains intentionally pending.
- [x] (2026-07-15 16:15Z) Finalized Artist-Owned Platform as the public project name by Michael's decision and reconciled the competition brief, project description, audit, submission checklist, hosted evidence, and model record.
- [x] (2026-07-15 17:08Z) Closed the final aggregate's meaningful-listen browser weakness in commit `fe2062a`: completed playback now performs terminal progress accounting, and the browser journey waits for the collected event instead of a fixed delay. Three fresh-demo focused Chromium runs and `npm run verify:telemetry` passed.
- [x] (2026-07-15 17:08Z) Passed the complete final-candidate Node 24 `npm run verify` aggregate from exact commit `fe2062aacaa9c808d6b05103d9fbcff144248ea0`, including every local module, the guarded reset and recovery contract, four production budgets, all 12 isolated desktop/mobile specifications, the repaired telemetry journey, documentation/assets, Chromium/WebKit judge routes, and browser-secret scanning. A fresh dependency audit found zero vulnerabilities and repository-pinned Supabase lint found no `public` or `private` schema errors.
- [x] (2026-07-15 17:37Z) Resumed the hosted-readiness goal and implemented the current Vercel Services worker contract locally: one public Nuxt service, two private request-driven containers, deployment-aware bindings, application-level bearer authorization, one-job claims, durable failure recovery, upload/license/retry dispatch, container builds, live auth probes, local queue connectivity, and unchanged FFmpeg/PDF behavior. No hosted resource was created or changed.
- [x] (2026-07-15 18:19Z) Froze the resumed local candidate: pinned Vercel CLI `54.21.1` detected the three services; the official schema accepted the configuration; fresh media and document images passed live auth and durable-queue probes; npm reported zero vulnerabilities; local `public,private` schema lint returned no errors; exact commit `04f23fa4b8632b04609cd2689b3b575ec2b193b0` passed the complete Node 24 aggregate; and immutable tag `build-week-hosted-candidate-20260715-121920` now identifies that runtime. No hosted resource was created or changed.
- [x] (2026-07-15 23:15Z) Ran the isolated hosted Supabase advisors read-only and classified all 155 results: zero errors; one Auth-setting warning; 17 auth initialization-plan warnings; 13 overlapping-policy warnings; and 124 information items. No provider setting, schema, data, account, deployment, or Sound for Movement resource changed.
- [x] (2026-07-15 23:58Z) Implemented forward migration `20260715231631_optimize_rls_advisor_policies.sql` in commit `f93af02`; a clean local reset and advisor rerun returned zero warnings and zero errors; every affected authority suite passed; exact commit `f93af023daf41a59c86251b471219b9a6eed4afc` passed the complete isolated-port Node 24 aggregate; immutable tag `build-week-hosted-candidate-20260715-175142` identifies the replacement runtime; and the linked non-mutating dry run proposed exactly this one migration while applying nothing.
- [x] (2026-07-16 00:08Z) Under Michael's approval, repeated the exact isolated-project guard and one-file dry run, applied only `20260715231631_optimize_rls_advisor_policies.sql`, proved 12/12 migration parity and clean linked lint, reduced hosted advisors from 31 warnings to the one separate Auth-setting warning, and preserved the exact fictional fixture, 4 accounts, 4 Stripe mappings, and 6 storage objects. No plan, billing, deployment, account, storage, Stripe, or Sound for Movement state changed.
- [x] (2026-07-16 00:35Z) Confirmed read-only that the isolated Build Week organization is on Supabase Free while leaked-password protection requires Pro or higher; preserved the bounded approval by leaving the setting, plan, and billing unchanged; and reran hosted advisors with the same `sha256:eb42bced1055` result: 0 errors, 0 database-policy warnings, 1 accepted plan-limited Auth warning, and 124 information items.
- [x] (2026-07-16 01:38Z) Under Michael's direction, created private GitHub repository `sunflower-of-parchman/artist-owned-platform-build-week`, attached it as `origin`, pushed the clean committed `main` branch, and connected that exact repository to Vercel. GitHub confirmed private visibility and default branch `main`; Vercel confirmed the connection and still showed zero deployments immediately afterward. The prior bootstrap workaround is retired.
- [x] (2026-07-16 04:14Z) Closed the hosted technical verification at exact runtime commit `c56a9bd170237288bae8eb1852fe1b281063952d`: Vercel reported the three-service Production deployment Ready; the stable platform alias passed the post-reset judge route in Chromium and WebKit; recent error-level and HTTP 500 logs were empty; GitHub Actions run `29469961758` passed all 16 jobs, including generated-type parity, clean-runner portability, recovery, the complete 68-journey desktop/mobile regression, and Chromium/WebKit; and local immutable tag `build-week-hosted-candidate-20260715-221715` identifies that runtime.
- [x] (2026-07-16 23:11Z) Added the guided first-clone artist scaffold in commit `dbfc659`: the unpersonalized local home page now labels each editable design element in its real composition; `npm run starter:local` launches that teaching view; `npm run demo:local` explicitly retains Daymark Assembly; personalization and production use authoritative artist content; desktop/mobile Chromium, accessibility, type, lint, unit, documentation, build, production-refusal, and live Chrome visual checks passed.
- [ ] Complete the remaining human and external gates listed in `docs/submission/remaining-work.md`. Michael resumed the work on 2026-07-15 with the repository safe and the remaining external actions still subject to their recorded approval boundaries.

## Surprises & Discoveries

- Observation: A polished fictional artist is strong functional evidence and weak first-clone teaching copy when it occupies the artist's own future site.
  Evidence: Michael's live homepage review identified the Daymark wordmark and poetic headline as content that looked prescribed rather than editable. The new local starter keeps the same typography, spacing, links, release surface, and responsive layout while literal labels name each decision; the finished Daymark fixture remains separately launchable and unchanged.

- Observation: Vercel's immutable per-deployment URL can remain protected while its stable Production project alias serves the approved public application.
  Evidence: Direct navigation to the immutable deployment URL returned Vercel's login surface in both engines, while `vercel inspect` tied the Ready deployment and stable aliases to exact commit `c56a9bd`; the stable alias then passed the complete post-reset route in Chromium and WebKit.

- Observation: Parallel clean runners can exhaust the anonymous public registry even when application and schema behavior are correct.
  Evidence: Supabase startup and `postgres-meta` type generation failed only on `toomanyrequests` responses. Retaining partial startup layers, retrying only recognized registry failures, and running the one type-generation job after clean-runner portability produced a 16/16 final Linux workflow without weakening schema or type-diff failures.

- Observation: Supabase advisor success requires both behavioral policy tests and structural policy review.
  Evidence: The hosted database had no error-level result and every authority suite passed, while the Performance Advisor still identified 17 per-row auth evaluations and 13 overlapping authenticated read policies. The forward migration evaluates stable auth helpers once per statement and gives each role one permissive read policy without widening write commands; the local advisor rerun returned zero warnings and the complete authority and browser aggregate remained green.
- Observation: A complete aggregate can coexist safely with a long-running repository development server when it uses the established isolated port contract.
  Evidence: The first aggregate attempt stopped at Nuxt's lock because the user's existing repository server owned port 3000. The task left that process untouched and reran with `NUXT_IGNORE_LOCK=1 PORT=3100`; every verification stage passed without disrupting the existing server.

- Observation: A safe evidence-only commit after candidate freeze intentionally makes the ordinary branch `HEAD` differ from the immutable runtime tag.
  Evidence: `build-week-hosted-candidate-20260715-221715` resolves to fully verified runtime commit `c56a9bd170237288bae8eb1852fe1b281063952d`, while this later local commit updates only evidence and operator documentation. The hosted runbook requires build and deployment from a clean detached worktree at that tag and a new aggregate and tag after any runtime-affecting change.
- Observation: The current Supabase CLI `db query --file` path prepares one statement and rejects a file containing separate `begin`, body, and `commit` commands.
  Evidence: The first disposable initialization was refused before mutation with `cannot insert multiple commands into a prepared statement`. Wrapping each guarded operation in one PostgreSQL `DO` statement preserved transaction atomicity and passed initialization plus two full resets.

- Observation: A stable fixture fingerprint must represent public product meaning instead of regenerated internal licensing identifiers.
  Evidence: The license publication function intentionally creates new template, option, offer, product, and price UUIDs. The first reset correctly failed an over-specific fingerprint; canonicalizing license terms and price facts by stable slugs and option keys produced identical hashes while a real page-title mutation was still refused.

- Observation: Firefox was an unnecessary verification branch for this project and produced a repeated environment-level startup loop before any application page loaded.
  Evidence: Michael stopped the goal and set Chrome/Chromium plus Safari/WebKit as the supported browser scope. The cross-browser configuration, CI workflow, README, runbooks, and evidence records now omit Firefox entirely.

- Observation: The Build Week repository began with only `BUILD_WEEK.md`; it had no application files or local ExecPlan convention.
  Evidence: `rg --files` returned only `BUILD_WEEK.md` before `PLANS.md` and this plan were added.

- Observation: The reference Sound for Movement application already demonstrates far more than catalog display. Its current dependency and source inventory includes Nuxt 4, Supabase, Stripe, audio processing, PDF generation, learning content, memberships, entitlements, video, first-party analytics, extensive administration, and Playwright/Vitest coverage.
  Evidence: The private reference repository's `package.json` and its `types/`, `composables/`, `server/`, and `supabase/migrations/` inventories contain the corresponding modules. This supports planning the complete product while also showing that safe generalization is substantial work.

- Observation: The difficult product problem is not merely producing pages. It is making infrastructure that normally requires a developer understandable and safely operable by a musician working with Codex.
  Evidence: The envisioned journey crosses database migrations, storage permissions, OAuth redirects, Stripe webhooks, DNS, secrets, audio files, content modeling, and deployment. These must be represented as guarded workflows with validation rather than prose-only instructions.

- Observation: Hosted audio administration requires a deployed processing path as well as a local Codex-operated command.
  Evidence: The private reference system proves ffmpeg-based preview and waveform work through local scripts. The reusable platform adds a durable job contract and one worker implementation that runs locally and as a deployed container, so hosted uploads reach a verifiable `ready` state.

- Observation: A capability can be implemented without yet being integrated, tested, demonstrated, or documented.
  Evidence: `docs/submission/capability-evidence.md` now tracks those evidence states separately so the complete product claim remains auditable throughout Build Week.

- Observation: Current Supabase Data API exposure and row authorization are separate controls.
  Evidence: The July 2026 Supabase quickstart and breaking-change index require explicit grants when tables are not automatically exposed, while RLS independently controls which rows an exposed role may use. New migrations must implement and test both layers.

- Observation: Current Supabase guidance recommends TUS resumable uploads and the direct storage hostname for large files.
  Evidence: The official resumable-upload guide recommends TUS above 6 MB, supports signed upload tokens, and advises versioned new object paths instead of overwrites. This reinforces the immutable-source media contract.

- Observation: Nuxt 4.4.8 requires Node `^22.12.0 || ^24.11.0 || >=26.0.0`; the host's default Node 25 is intentionally unsupported.
  Evidence: The project pins Node 24.14 and npm 11 in `.nvmrc`, `.node-version`, `.npmrc`, and `package.json`. A clean `npm ci` and the full foundation suite pass under the bundled Node 24.14 runtime.

- Observation: The first local Supabase startup delay came from Docker Desktop's container-start engine, not the migration or Supabase CLI.
  Evidence: Both Supabase CLI 2.109.1 and the installed 2.98.2 stopped at the Docker API start call, and a harmless one-shot `docker run` also blocked. `docker desktop restart` restored one-shot containers, after which the pinned CLI started Supabase and completed migration, seed, RLS read, and type generation.

- Observation: An opacity-based entrance animation can temporarily violate text contrast even when its final colors pass.
  Evidence: The mobile axe journey detected serious contrast violations while the hero was fading in. Removing opacity from the entrance keyframes preserved motion and produced zero serious axe violations on desktop and mobile.

- Observation: A Row Level Security policy and its table privilege are separate controls; both must permit an operation.
  Evidence: The first anonymous fixture read reached the correct published-row policy and still returned HTTP 401 because `anon` lacked `SELECT` on the new release and media tables. Adding the narrow grants made the same RLS-backed read pass.

- Observation: PL/pgSQL parameters and output columns should use distinct names from table columns in fulfillment functions.
  Evidence: The first policy fulfillment run found an ambiguous `provider_event_id` reference. Prefixing parameters, using local variables, and naming every replay constraint made the function unambiguous and all four event deliveries idempotent.

- Observation: Browser tests that type before Nuxt hydration can have their values replaced by the component's initial reactive model.
  Evidence: The first authority journey populated the server-rendered form before hydration and then observed empty fields. The form now exposes a disabled-until-mounted submit control, and Playwright waits for that control before filling; all desktop and mobile journeys pass.

- Observation: A composite verification command must restore every suite's database prerequisites after earlier mutation journeys.
  Evidence: The first aggregate Milestone 3 run passed each isolated gate but let the final browser suite inherit published configuration and pages while losing the Gate A entitlement. The aggregate command now performs a clean local setup and deterministic spine seed before the full responsive suite; the complete `npm run verify` command passes from arbitrary prior local state.

- Observation: Supabase signed TUS uploads use a dedicated signing route and pass the resulting signature in `x-signature`; they are not ordinary bearer-token uploads.
  Evidence: The upload implementation now requests `/storage/v1/upload/resumable/sign`, sends the returned token through `x-signature`, and completes a real browser-to-storage upload before the worker creates an optimized derivative.

- Observation: Database and browser journeys must establish their own fixture preconditions when they can run after other mutation suites.
  Evidence: Repeat catalog verification first exposed a fixed listening-history identifier left behind by an earlier run, and the customer-library journey correctly encountered a favorite created by the authority test. Both suites now normalize only their owned fixtures and pass regardless of execution order.

- Observation: Authority tests must isolate the exact order, entitlement, subscription, and resource they create because prior browser journeys may leave other valid customer state in the same local account.
  Evidence: The first aggregate commerce run correctly found four orders where an older policy assertion assumed one, and the first membership cancellation check correctly remained allowed through an unrelated active membership. Policy cleanup now owns its dependent download records, and commerce tests create independent purchase and membership resources; repeated verification passes after browser activity.

- Observation: A licensing demonstration must use one stable track identity from publication through document rendering.
  Evidence: The first focused browser journey exposed a fixture that named “Turn Toward Home” while its template referenced “A Measure of Distance.” Correcting the seeded foreign key made the public filter, immutable snapshot, issued record, PDF, and browser evidence agree on the same track.

- Observation: PDF text extraction alone does not prove a license document is usable.
  Evidence: The first rendered document contained the required text but split its second-page heading and footer poorly. Page rendering and visual inspection led to an intentional page break and canvas-owned footer; both final pages are readable without clipping, overlap, or orphaned content.

- Observation: Supabase database lint should be treated as a required behavioral gate even when migrations apply successfully.
  Evidence: The licensing migration applied and its authority tests passed, while `db lint` still found an output-parameter ambiguity in the template publication function. Qualifying the table alias removed the ambiguity; a clean reset, schema lint, and licensing suite then passed together.

- Observation: A complete browser gate must isolate stateful milestone specifications and wait for Nuxt hydration after direct navigation or reload.
  Evidence: The first all-specification run let parallel publication, commerce, and entitlement journeys change the same seeded database, while fast interactions could reach server-rendered controls before their handlers mounted. `scripts/run-e2e.mjs` now resets before each specification and `tests/e2e/helpers.ts` makes direct navigation hydration-aware; all nine specifications pass together.

- Observation: External video privacy is testable at the network boundary.
  Evidence: The public video journey sees an artist-owned poster, credits, and transcript before consent and asserts that no external iframe exists. The approved YouTube or Vimeo embed is created only after the visitor chooses to load it.

- Observation: Optional audience measurement and required operational health need different authority, retention, and presentation boundaries.
  Evidence: Milestone 8 keeps session-only allowlisted events in forced-RLS tables with no anonymous or authenticated grants, while setup health and current operational checks use separate service-owned records. The owner API returns only 30-day aggregates and redacted status; authority tests prove raw-table denial and scan the shareable diagnostic for URLs, credentials, emails, and session identifiers.

- Observation: One shared TypeScript schema may need different module-resolution behavior in Nuxt's shared project and direct Node execution.
  Evidence: The setup schema initially needed a `.ts` extension for Node's stripped-TypeScript loader while Nuxt's generated shared typecheck rejected that import form. A package-private import map now gives both runtimes one canonical schema without duplicating validation, and both `npm run typecheck` and `npm run setup:interview -- --json` pass.

- Observation: Missing external services are valid local setup results when they are represented as explicit, actionable checkpoints.
  Evidence: The Milestone 9 integration proposal requests hosted Supabase, Google OAuth, Stripe test mode, email delivery, Vercel, and a custom domain. Local application performs none of those actions, reaches a passing setup check, and records five `approval-required` runbooks in non-secret project state.

- Observation: Repeatable ownership evidence requires content-derived identity rather than an export-time timestamp.
  Evidence: Milestone 10 writes stable, sorted JSON; derives the export ID from the artist slug and artifact hashes; and stores application and migration versions without a changing creation time. Two independent exports of unchanged state are byte-for-byte identical and share the same snapshot hash.

- Observation: A local database reset can restart Supabase Auth without refreshing Kong's retained upstream route.
  Evidence: The aggregate recovery drill observed a healthy replacement Auth container while `/auth/v1/health` still returned HTTP 502 through Kong. Restarting only this repository's Kong container immediately restored HTTP 200. Shared setup and reset code now polls Auth, performs that project-scoped recovery only when needed, and passed the complete reset-heavy aggregate.

- Observation: A machine-level Python upgrade can silently invalidate an otherwise pinned license-document workflow.
  Evidence: The host changed to Python 3.14 without ReportLab during the full browser gate. `npm run setup:documents` now creates an ignored isolated environment from exact worker requirements, and both local execution and tests resolve that interpreter deterministically.

- Observation: Server-rendered checkout controls need an explicit hydration boundary before consequential browser actions.
  Evidence: A full page load could expose the simulated completion button before Vue attached its handler. The control now remains disabled until mounted, and the complete commerce and licensing browser journeys pass from fresh navigation.

- Observation: Performance evidence is most useful when expressed as an executable production-build budget rather than a one-time score.
  Evidence: The hardening command starts the built Node server, fails on response, request, console, media-loading, and byte-budget regressions, and records four critical routes. The final aggregate measured 60–70 ms load events, 7–8 requests, 374–377 KB total transfer, and zero initial media bytes.

## Decision Log

- Decision: Build the complete described platform rather than presenting only a catalog prototype.
  Rationale: The reference system supplies proven concepts and the Build Week thesis depends on showing that Codex can transfer a sophisticated artist-owned operating model, not merely generate a themed site.
  Date/Author: 2026-07-14 / Michael and Codex

- Decision: Treat the complete platform as the Build Week outcome and preserve that definition throughout execution.
  Rationale: The product logic and working reference architecture already exist. The one-week accomplishment is using Codex to generalize, implement, document, validate, and package the entire system for another artist. Schedule discoveries may change milestone order, but they do not preemptively reduce the product to a slice.
  Date/Author: 2026-07-14 / Michael and Codex

- Decision: Keep the product web-only and do not add a model call, chatbot, agent runtime, native iOS application, or other AI feature to the deployed visitor experience.
  Rationale: Build Week requires the project to be built with Codex and GPT-5.6; the artist-owned platform is itself the product. Codex belongs in setup, customization, maintenance, and evidence of how the product was made.
  Date/Author: 2026-07-14 / Michael and Codex

- Decision: Record GPT-5.6 Sol and GPT-5.6 Pro as the Build Week models and keep their use explicit, inspectable, and separate from the visitor runtime.
  Rationale: Both models contribute through Codex during planning, implementation, setup reasoning, debugging, validation, and documentation. The public site remains independently operable without an OpenAI API key. Exact task-level contributions must be reconciled with session metadata rather than inferred.
  Date/Author: 2026-07-15 / Michael and Codex

- Decision: Use this Codex task as the primary implementation task.
  Rationale: It contains the product origin, competition research, architecture, full plan, and milestone decisions. The majority of core implementation, integration, and verification will remain here so the final `/feedback` Session ID represents the project accurately.
  Date/Author: 2026-07-15 / Michael and Codex

- Decision: Design one deployment for one artist or artist-led organization, with multiple authorized administrators and many customer accounts.
  Rationale: A single-artist deployment preserves data ownership, branding freedom, simpler security boundaries, and understandable operations. A hosted multi-artist marketplace would be a materially different business and architecture.
  Date/Author: 2026-07-14 / Codex

- Decision: Use Nuxt 4, Vue, TypeScript, Supabase, and Stripe as the primary platform architecture, with Vercel as the documented initial hosting path while keeping ordinary Node-compatible deployment possible.
  Rationale: This reflects the proven Sound for Movement web architecture, provides a full server-rendered application with authentication and commerce, and matches the services discussed for artist setup.
  Date/Author: 2026-07-14 / Michael and Codex

- Decision: Treat the private Sound for Movement repository as a read-only, user-owned reference and keep all Build Week implementation in this separate repository.
  Rationale: This prevents interference with the production application, preserves unrelated work, and makes competition-period contributions and provenance legible.
  Date/Author: 2026-07-14 / Codex

- Decision: Build a clean consolidated Supabase baseline rather than copying the private application's entire historical migration chain.
  Rationale: A new adopter needs a comprehensible schema representing the current public platform contract. Historical production repairs and Sound for Movement-specific data changes would add risk and obscure the reusable design.
  Date/Author: 2026-07-14 / Codex

- Decision: Separate configuration authority by category.
  Rationale: Shared schemas define the contract; `artist.config.ts` supplies bootstrap defaults; Supabase is authoritative for artist-editable runtime identity, design, content, navigation, and module settings; environment configuration is authoritative for secrets; and `setup/project-state.json` records only non-secret setup progress. This prevents drift while preserving fresh-clone reproducibility.
  Date/Author: 2026-07-15 / Michael and Codex

- Decision: Give an unpersonalized local clone a literal teaching scaffold while preserving Daymark Assembly as the explicit complete demonstration.
  Rationale: The first screen should help an artist and Codex name and replace real page elements without suggesting that the fictional artist's language is a template. A development-only presentation layer preserves the working database fixture and layout, follows project-state personalization, and is structurally unable to replace published artist content in production.
  Date/Author: 2026-07-16 / Michael and Codex

- Decision: Prove the Authority and Fulfillment Spine immediately after the database and authentication foundation.
  Rationale: Authentication, RLS, simulated signed payment fulfillment, entitlements, and protected delivery are shared by purchases, licensing, memberships, learning, and private media. An early walking skeleton lets every later module extend a verified authority model while preserving the complete product scope.
  Date/Author: 2026-07-15 / Michael and Codex

- Decision: Keep audio processing outside ordinary Nuxt requests and support the same worker locally and as a deployed container.
  Rationale: Original audio can be large and ffmpeg processing can outlive ordinary requests. Direct private-storage uploads, durable `media_jobs`, and one idempotent worker make local Codex operation and hosted administration equally real.
  Date/Author: 2026-07-15 / Michael and Codex

- Decision: Use private, request-driven Vercel container services as the first hosted path for both durable workers.
  Rationale: Current Vercel Services and container functions can keep the workers outside public routing, supply deployment-aware internal bindings, include FFmpeg and Python, and scale to zero. Supabase jobs, leases, retries, and idempotent artifacts remain the durable authority, while one shared server-only bearer secret provides application-level authorization. The OCI images remain portable to another HTTP-capable host.
  Date/Author: 2026-07-15 / Codex

- Decision: Treat artist portability as an executable product capability.
  Rationale: Artist ownership includes a versioned export of configuration and content, a verified media inventory, database and customer-data procedures, and a tested path away from the current hosting arrangement.
  Date/Author: 2026-07-15 / Michael and Codex

- Decision: Use a same-origin browser boundary and allow only validated internal, HTTPS, loopback-development, and exact Stripe destinations.
  Rationale: The application uses server-owned sessions and does not need blanket cross-origin credential access. Central URL validation, mutation-origin checks, secure headers, and explicit redirect policies prevent configuration or provider data from becoming an open redirect or cross-site mutation path.
  Date/Author: 2026-07-15 / Codex

- Decision: Make performance and recovery executable repository contracts.
  Rationale: Fixed production-load budgets and repeatable recovery drills provide evidence that future artist changes preserve usable pages, rerunnable setup, payment reconciliation, media retries, and portable restore behavior. Documentation alone cannot detect regression.
  Date/Author: 2026-07-15 / Codex

- Decision: Use a project-bound targeted hosted reset instead of any linked full-database reset.
  Rationale: Judges need deterministic state while migration history, provider secrets, webhook configuration, buckets, worker connections, and Stripe mappings remain intact. Exact reference, link, schema, marker, account-set, storage, and fingerprint guards keep the mutation limited to the dedicated fictional installation, and private identities rotate on every reset.
  Date/Author: 2026-07-15 / Codex

- Decision: Isolate the license-document renderer in a pinned project-local Python environment.
  Rationale: ReportLab output and PDF inspection must remain reproducible across machines and host Python upgrades. The renderer environment contains no payment credential and is rebuilt from exact requirements.
  Date/Author: 2026-07-15 / Codex

- Decision: Separate the portable artist definition from customer and provider account backups.
  Rationale: Published identity, pages, catalog, offers, licensing definitions, learning, video, editorial structure, privacy settings, and hashed media can move safely through a strict artifact contract. Customers, messages, behavioral events, payment history, subscriptions, issued licenses, credentials, and provider identifiers require their own approved encrypted provider exports and retention decisions.
  Date/Author: 2026-07-15 / Codex

- Decision: Enter the Developer Tools track.
  Rationale: The personalized artist site proves the system works. The transferable Build Week product is the agent-operable repository with schemas, setup, security boundaries, media processing, runbooks, verification, portability, and ongoing Codex maintenance.
  Date/Author: 2026-07-15 / Codex

- Decision: License the repository and its original fictional demonstration assets under `AGPL-3.0-or-later`.
  Rationale: Michael chose a reciprocal open-source license so artists can use and change the platform while modified network-hosted versions must offer their corresponding source under the same license. Publication remains a separate approval.
  Date/Author: 2026-07-15 / Michael

- Decision: Make setup executable and testable. Human documentation, `AGENTS.md`, agent runbooks, configuration schemas, preflight scripts, and health checks are all product features.
  Rationale: Codex can only reliably guide a nontechnical artist when the repository expresses its requirements and can verify each service connection without exposing secrets.
  Date/Author: 2026-07-14 / Michael and Codex

- Decision: Keep setup proposals complete, local, ignored, stale-aware, and separate from external service execution.
  Rationale: Codex can reason conversationally about the artist's full intended installation while deterministic scripts preserve reviewability. Applying only to local Supabase after a recorded approval gives the artist a complete personalized proof; hosted accounts, costs, uploads, deployments, DNS, and messages remain named checkpoints under their own action-specific approval.
  Date/Author: 2026-07-15 / Codex

- Decision: Make optional analytics first-party, session-only, field-allowlisted, owner-aggregated, and independent from operational status.
  Rationale: An artist can learn which public work and direct-support journeys are useful without creating advertising profiles or mixing audience behavior with accounts, raw searches, payment facts, or infrastructure logs. Server enforcement of enablement, consent, GPC, DNT, and retention preserves the visitor's authority even when client state is stale.
  Date/Author: 2026-07-15 / Codex

- Decision: Keep musicians as the primary first-release audience while allowing the content, education, and licensing models to serve accompanists, dancers, choreographers, teachers, and other performing artists.
  Rationale: A precise initial audience makes the product and demonstration understandable. The architecture can support related performing-arts practices without weakening the music-centered story.
  Date/Author: 2026-07-14 / Michael and Codex

- Decision: Keep the public design configurable and open in composition. Do not make every control, object, or content surface an enclosing card by default.
  Rationale: Artists need expressive sites rather than a visibly generic dashboard template. Cards should communicate a meaningful group, selectable item, or functional boundary.
  Date/Author: 2026-07-14 / Michael's repository guidance

- Decision: Require explicit approval before any public deployment, repository publication, domain or DNS change, paid-resource creation, live Stripe operation, email send, demo-video publication, or Devpost submission.
  Rationale: These operations change external state, may create costs, or communicate publicly. Local development and test-mode verification can proceed without them.
  Date/Author: 2026-07-14 / Michael's repository guidance

- Decision: Support Chrome/Chromium and Safari/WebKit as the complete browser contract and keep Firefox outside local and CI verification.
  Rationale: Those engines represent Michael's intended judging and operating environments. Firefox added an environment-level startup branch without product evidence and is not part of the approved project scope.
  Date/Author: 2026-07-15 / Michael

- Decision: Serialize database-type generation behind clean-runner portability and retry only recognized public-registry rate limits.
  Rationale: Type drift must remain a hard failure, while anonymous container-registry throttling is unrelated to schema correctness. The dependency removes the initial pull surge and bounded cooldown retries preserve deterministic failure for every non-registry error.
  Date/Author: 2026-07-16 / Codex

- Decision: Keep offer descriptions, access targets, prices, and publication state authoritative in the application while using Stripe identifiers only as provider mappings.
  Rationale: The artist must be able to understand and move the catalog independently of a payment provider. The server creates Checkout and portal sessions, verified raw-body webhook events establish payment facts, transactional database functions grant access, and browser return URLs only report durable server state.
  Date/Author: 2026-07-15 / Codex

- Decision: Automate only complete, explicit, non-exclusive license options and route unusual, broadcast, commercial, or exclusive uses to an artist inquiry.
  Rationale: The buyer must see every supported use, audience, distribution, term, territory, attribution rule, and price before payment. The system may freeze an artist-approved option; it must not infer consequential legal terms during checkout.
  Date/Author: 2026-07-15 / Codex

- Decision: Make the pre-checkout selection snapshot the immutable authority for both fulfillment and document generation.
  Rationale: Later template revisions must not change what a buyer purchased. Verified payment atomically issues the license, durable document job, and entitlement from the same frozen facts, while the private worker renders that exact snapshot without holding payment credentials.
  Date/Author: 2026-07-15 / Codex

- Decision: Use a deliberately limited structured rich-text subset and require explicit visitor consent before external video embeds.
  Rationale: Artists need emphasis, lists, and safe links without accepting arbitrary HTML or script execution. Poster-first video keeps publication useful while allowing the visitor to decide whether a third-party player receives a request.
  Date/Author: 2026-07-15 / Codex

- Decision: Defer the project name, email provider, and final public demonstration media choice until their dedicated decision gates, while allowing independent implementation to continue.
  Rationale: These choices matter but do not block establishing the application architecture. Developer Tools and `AGPL-3.0-or-later` are selected; media provenance is explicit and publication remains separately approval-gated.
  Date/Author: 2026-07-14 / Codex

## Outcomes & Retrospective

Milestone 0 is complete. The repository carries the product contract, public introduction, setup entrypoint, agent rules, provenance ledger, visual direction, primary-task and model evidence, capability matrix, and architecture decisions for deployment, stack, schema, entitlements, configuration, setup, media, portability, design, track, and license choice. The Developer Tools track and `AGPL-3.0-or-later` are selected.

Milestone 1 is complete. A new artist can now clean-install a pinned Node 24 and Nuxt 4 application, run a named preflight, start and reset the local Supabase stack, apply the first migration, insert and anonymously verify a fictional published artist, generate database types, launch a coherent responsive public site, and run deterministic foundation and browser verification. The evidence is commit `83c3b4f`, the passing setup and verification commands, generated `setup/project-state.json`, and inspected desktop/mobile output. Authentication, administrator roles, storage policies, and the full authority schema remain Milestone 2 work.

Milestone 2 and Integration Gate A are complete. A visitor can create a customer account and sign in; an explicitly bootstrapped owner can enter protected administration; public roles can read and play only the published preview; owners and editors can maintain content through current role state; customer orders and entitlements are isolated; payment facts remain service-owned; and a protected route grants a short-lived download only after the central access decision. The clean-reset `npm run verify:spine` proof, commit `12f5d66`, schema lint, browser-secret scan, 10 desktop/mobile journeys, and inspected administration/release surfaces provide the evidence. OAuth remains optional and disabled until an artist supplies approved provider credentials. Milestone 3 builds on this authority foundation in the paragraph below.

Milestone 3 is complete. An owner can now change public identity, contact information, links, logo and imagery paths with required alternative text, semantic colors, typography, navigation, home content, footer, search metadata, and enabled modules through a database-backed workspace. The same workspace composes ordered prose, image, action, credits, links, featured release, featured learning, video, and contact sections with private drafts and explicit publication. The local contact endpoint validates consent, rejects a honeypot, enforces a database rate limit, stores messages without sending email, and records consequential mutations in the audit log. Evidence includes implementation commits `0982946` and `37a7b12`, a passing aggregate `npm run verify`, schema lint with no findings, 13 unit tests, 4 administration browser journeys, 14 passing desktop/mobile regression journeys with 4 intentional shared-database skips, browser-secret scanning, and inspected identity, page-editor, contact, and mobile surfaces. Catalog and media intake remain Milestone 4 work.

Milestone 4 is complete locally and hosted. An owner or editor can manually author releases, tracks, credits, artwork, and collections; review private drafts; publish validated authored order atomically; request a durable signed TUS upload; and retry processing failures. Codex can inspect an approved media folder, produce a rights-gated editable proposal, apply it idempotently, and run the same worker library locally or through the private deployed service to create metadata, preview, waveform, and optimized-artwork derivatives without changing the source. Visitors can navigate published releases, tracks, and collections and use one persistent accessible player; signed-in listeners can maintain isolated favorites, ordered playlists, and history. In the approved isolated deployment, a generated fictional WAV reached `ready`, produced one derivative and 120 waveform points, played publicly, and passed retry plus expired-lease recovery. Evidence is the seven implementation commits from `bc89195` through `21476f6`, the hosted evidence record, clean migration replay, database lint, `npm run verify:catalog`, production build, and passing local and hosted browser journeys.

Milestone 5 is complete locally and in Stripe sandbox. An owner can publish free, external, one-time, and recurring offerings; map Stripe products and prices without moving editorial authority out of the application; inspect redacted failures; and request an explicit verified-event replay. A customer can create durable Checkout intents, orders, memberships, refunds, and entitlements; retrieve protected downloads; inspect account history; and lose expired or revoked access without losing an unrelated permanent purchase. The hosted proof completed one-time purchase, same-event replay, membership activation, portal scheduling, terminal cancellation, partial and full refunds, protected delivery, and cross-account denial with all provider objects reporting test mode. Evidence is commit `058201c`, the later refund and cancellation corrections, `npm run verify:commerce`, clean schema lint, production and secret checks, local browser journeys, and the hosted evidence record.

Milestone 6 is complete locally and in Stripe sandbox. An owner can publish complete, non-exclusive uses for a track, revise them without mutating prior versions, map the resulting offers for Stripe test mode, inspect issued licenses, and retry failed documents. A customer sees the exact terms and price before checkout, supplies the licensee and project facts, receives one replay-safe issued license and private PDF in account history, and loses access after a full refund; unsupported uses enter an inquiry. The hosted proof completed a USD 75 fictional dance-film checkout, froze its exact terms, issued one license, rendered and visually verified both PDF pages through the private document service, returned 200 to the purchaser and 403 to the second account, and preserved refund revocation. Evidence is commit `d6991d2`, later worker and reset corrections, clean migration replay and schema lint, `npm run verify:licensing`, production and secret checks, and local plus hosted browser evidence.

Milestone 7 is complete. An owner can privately compose, reorder, preview, and explicitly publish a three-lesson path containing safe prose, image, audio, external or hosted video, downloads, and prompts; maintain standalone video and editorial records; and keep removed published records archived instead of breaking learner history. Visitors see the correct public, account-required, individually entitled, or membership-entitled explanation; protected media uses the central access decision; a member records monotonic progress and resumes the next lesson; and another account cannot read that state. External embeds remain poster-only until consent, and unsafe HTML, scripts, links, and providers are rejected. Evidence is commit `b49c36c`, clean schema lint, `npm run verify:learning`, the catalog regression, formatting, lint, type checking, setup health, production build, browser-secret scanning, and the passing nine-specification deterministic desktop/mobile browser gate.

Milestone 8 is complete. A visitor can explicitly allow or decline optional artist-owned measurement, change that choice on the privacy page, and rely on GPC or DNT as a server-enforced refusal. Consented page, catalog-search, real media-start and meaningful-listen, commerce, license, download, learning, and contact moments use a random browser-session identifier and a strict field allowlist; dynamic checkout identifiers and search words are excluded. An owner can change collection and retention settings, view 30-day aggregates without raw sessions, and inspect redacted migration, storage, worker, payment-webhook, Stripe test, contact-adapter, and setup state. Evidence is commit `1b585c9`, `npm run verify:telemetry`, setup verification, database lint, type checking, lint, production build, browser-secret scanning, and the complete ten-specification desktop/mobile browser regression. Hosted service checks continue to state their action-required condition until the separately approval-gated external proofs occur.

Milestone 9 is complete. A fresh Codex task can read the repository, emit and conduct the complete artist interview, produce a validated proposal, preview a field-level diff without mutation, stop for explicit human approval, and then apply only the approved local configuration and media. The integration proof creates a fictional North Window Practice identity and two generated WAV tracks, rejects an unapproved apply, processes both tracks, detects five intentionally unconnected services, records exact runbooks, verifies the installation, and reapplies without duplication before restoring the Daymark Assembly demonstration. Evidence is commit `ce976ff`, `npm run verify:setup`, formatting, lint, type checking, production build, browser-secret scanning, and the provider-neutral setup, service, maintenance, and recovery documentation. No external account was mutated and no credential or local service URL appeared in the setup result.

Milestone 10 is complete. An artist can create a deterministic portable directory containing four hashed structured artifacts and bundled content media, verify every schema, relationship, artifact hash, object size, and object hash, and retain exact instructions for the separately approved provider/customer backup. The restore rehearsal refuses an omitted confirmation or any non-local target, resets the local schema to migrations, creates a disposable owner, restores all 25 content and relationship tables plus storage objects, compares every record count, verifies direct-public surfaces and public media, reports six external-account reconnection runbooks, rejects a tampered artifact, and recreates the fictional demonstration. Evidence is commit `e12d3be`, `npm run verify:portability`, formatting, lint, type checking, production build, browser-secret scanning, and a final passing `npm run setup:check`. No customer record, credential, provider identifier, signed URL, private task identifier, or local service URL appeared in the export or restore result.

Milestone 11 is complete locally. A new artist receives strict same-origin request and redirect handling, nonce-based production security headers, bounded requests and rates, validated public links, secure sessions, graceful empty/offline/unavailable states, one semantic main landmark, visible keyboard navigation, reduced-motion behavior, responsive public and administrative routes, and deterministic PDF tooling. Production budgets now fail regressions in home, catalog, release, and learning loads; recovery drills prove safe repeated setup, payment reconciliation, media retry, deterministic export, clean restore, local-only reset refusal, and final installation health. Evidence is commit `8d1fca5`, the zero-finding dependency audit and database lint, six passing desktop/mobile hardening journeys, four passing performance budgets, the complete recovery drill, and one uninterrupted `npm run verify` ending in all eleven isolated browser specifications. Hosted Supabase advisor, media-worker, and Stripe sandbox evidence remains approval-gated and will be recorded only against Michael-approved external targets.

All approval-independent Milestone 12 work is complete. The repository carries a coherent original fictional artist, machine-readable asset ledger, screenshots, full README, contribution contract, deterministic two-command demo, reset command, judge quickstart, hosted-test plan, and cross-browser package gate. One untouched clone ran only `npm ci` and `npm run demo:local`, returned HTTP 200, and remained clean. A separate clone passed the full foundation, personalization, browser-secret, Chromium/WebKit, reset, and server rehearsal. The current full Node 24 aggregate includes the judge package and passed every module, recovery drill, all 12 isolated desktop/mobile browser specifications, documentation and asset validation, Chromium/WebKit public journeys, and browser-secret scanning. Evidence is commits `aead7ab`, `0ab2c9e`, `6cd3575`, and `fdbd9fa` plus `docs/submission/clean-clone-evidence.md` and `docs/submission/completion-audit.md`. `AGPL-3.0-or-later` is selected; the public hosted judge environment remains a Michael-controlled gate.

The Milestone 13 technical package is complete under the final Artist-Owned Platform name. The repository includes a direct project description, full judging guide, redacted hosted plan, 2:55 narrated demo script, hosted evidence, and submission checklist with every external action separated. Exact runtime `c56a9bd` is Ready on Vercel, Linux CI passed 16/16 jobs, and the post-reset stable Production alias passed Chromium and WebKit. `/feedback` confirmation, recorded video timecodes, judge sharing, publication, and Devpost confirmation remain the explicitly deferred competition-closeout actions.

The first completion audit found and closed two local gaps after the package was assembled. Optional OAuth is now real application behavior: an artist-selected allowlist controls visible providers, a server-side PKCE flow binds a one-use verifier to the callback in short-lived HTTP-only cookies, unsafe returns fall back to the account, and the focused configured/disabled browser gates pass without external mutation. The Linux workflow now defines 15 jobs covering every module, the dependency audit, complete desktop/mobile regression, and all three required browser engines. Evidence is commit `fdbd9fa` and `docs/submission/completion-audit.md`; actual hosted-provider success and remote workflow results remain named external gates.

The hosted judge reset is now implementation-complete and proven locally. A dedicated project can be initialized only when its linked reference, exact schema, empty application tables, empty Auth account set, and empty dedicated buckets agree. Later checks and resets require the stored project hash, exact four-account set, and canonical fixture hash; the targeted reset preserves migration and provider state, restores Stripe mappings by stable product and price facts, clears only dedicated bucket objects, recreates only the four fictional users, and proves session rotation. The same core passed target, marker, account, storage, and real content-drift refusals, initialization, two identical resets, public/role/storage checks, provider preservation, and ordinary-demo restoration. Evidence is commit `c3dcf2d` and the passing Node 24 `npm run verify:recovery`. Actual hosted execution remains separately approval-gated.

Checkpoint `b226602` then passed the complete uninterrupted Node 24 aggregate with the guarded reset included in the ordinary recovery contract. Every local capability, production build and hardening check, four route budgets, 12 isolated desktop/mobile specifications, Chromium/WebKit judge route, documentation/assets, and secret scan passed; the refreshed dependency audit reported zero vulnerabilities and local database lint reported no `public` or `private` schema errors. This was the approval-independent technical baseline before the final license and public-name decisions.

Michael then approved `AGPL-3.0-or-later` and finalized Artist-Owned Platform as the public name. The first aggregate after those decisions exposed one real short-preview weakness: browsers do not guarantee a `timeupdate` at the meaningful-listen boundary before playback ends. Commit `fe2062a` makes completed playback perform terminal progress accounting and makes the Playwright journey wait for the actual collection response. Three fresh-demo focused Chromium repetitions, the telemetry module gate, and the complete uninterrupted Node 24 aggregate passed from exact commit `fe2062aacaa9c808d6b05103d9fbcff144248ea0`; the refreshed dependency audit found zero vulnerabilities and the repository-pinned Supabase CLI found no `public` or `private` schema errors. That was the prior locally verified implementation baseline. The resumed hosted-readiness milestone added the request-driven private worker topology and froze exact commit `04f23fa4b8632b04609cd2689b3b575ec2b193b0` as immutable tag `build-week-hosted-candidate-20260715-121920` after the complete aggregate, image, dependency, schema, CLI, and configuration gates passed. The remaining work requires human confirmation or explicitly approved external state.

The goal then resumed for hosted readiness. Current Vercel Services guidance made a single-project topology possible: the Nuxt application is the only public service and privately invokes media and document containers through deployment-aware bindings. Both worker entrypoints now share their CLI runtimes, accept one authenticated job request at a time, and leave accepted database work durable when a dispatch is absent or fails. Focused unit, lint, and type checks passed; both OCI images built; live containers proved non-sensitive health, 401 refusal, redacted failure, and authenticated local queue access; and the existing media and licensing integrations still passed real FFmpeg and PDF work. The complete aggregate, audit, schema lint, pinned CLI, official schema, commit, and immutable-tag gates then passed, establishing the exact local hosted-readiness candidate recorded above.

The read-only hosted advisor baseline then identified one hosted Auth setting and 30 database-policy optimizations without finding an error. Commit `f93af02` adds a forward-only policy migration that evaluates auth helpers once per statement and consolidates authenticated reads while preserving public publication, drafts, customer isolation, and command-specific administrator writes. A clean local reset, zero-warning advisor rerun, all affected authority suites, and the complete isolated-port Node 24 aggregate passed. Michael then approved the exact twelfth migration; authoritative follow-up proves 12/12 hosted parity, clean linked lint, zero remaining database-policy warnings, and unchanged fixture integrity. The Auth entitlement checkpoint is complete: the isolated organization is on Free, the Pro-or-higher leaked-password feature remains unchanged, and the final advisor report is stable.

The approved hosted technical closeout is complete. The private Git-connected Vercel project serves one public Nuxt service and two private workers; hosted media, Stripe sandbox commerce and memberships, licensing, protected documents, cross-account denial, two guarded resets, provider preservation, and the final judge route all passed. Clean-runner corrections culminated in GitHub Actions run `29469961758`, where all 16 jobs passed from exact commit `c56a9bd170237288bae8eb1852fe1b281063952d`; the complete desktop/mobile regression ran 68 Chromium journeys, and the dedicated Chromium/WebKit gate passed. Vercel reported that exact three-service deployment Ready, the stable platform alias passed Chromium and WebKit after the final reset, and recent error-level plus HTTP 500 log queries returned no entries. Local tag `build-week-hosted-candidate-20260715-221715` freezes the verified runtime. The working result now matches the Purpose / Big Picture for the complete single-artist platform; only the intentionally deferred competition recording, sharing, publication, and submission actions remain.

The first-clone experience now begins with the product's actual visual composition and literal names for each artist-editable element. A new artist can run `npm run starter:local`, see where their name or logo, headline, introduction, actions, release, supporting material, and footer will live, and discuss those decisions with Codex before applying content. The complete Daymark Assembly installation remains available through `npm run demo:local`, and production builds always use authoritative artist content. Commit `dbfc659`, four desktop/mobile starter journeys, the unchanged four-journey Daymark regression, live Chrome inspection, and the production-refusal probe provide the evidence.

At the end of each implementation milestone, append a dated paragraph here describing what a new artist can now do, what evidence proves it, and any capability that remains incomplete. At project completion, compare the working fresh-clone and judge journeys with the Purpose / Big Picture section, and distinguish finished features from documented future extensions.

## Context and Orientation

The repository root is referred to as `<repository-root>` in tracked documentation. `BUILD_WEEK.md` records event dates, rules, official links, submission requirements, approval boundaries, and progress. `PLANS.md` defines how to maintain this plan. `plans/artistOwnedPlatform.md` is the controlling implementation plan. The repository is new and has no application code or commits at the time this plan is created. Machine-specific paths belong only in ignored local configuration.

The private Sound for Movement application is referred to as `<private-reference-repository>`. Its machine-specific path belongs in an ignored `setup/local-paths.json` file. It may be inspected read-only to understand user-owned architecture and behavior. Do not edit it, import its secrets, copy its private data, or assume that a production-specific migration belongs in this project. When a reusable implementation is adapted from it, record the source concept or file and the new generalized result in `docs/provenance.md`. Search the new repository for Sound for Movement names and private URLs before every public-release candidate.

The project is a single-artist platform. “Single-artist” means one deployed instance represents one musician, ensemble, accompanist, composer, or artist-led organization. That instance may have multiple owner or editor accounts. Visitors and customers have separate accounts. The database is not shared across unrelated artists.

“Entitlement” means a durable record granting an account access to something, such as an album download, a licensed track, a course, or membership-only material. Stripe confirms a payment; the platform's server verifies that event and atomically creates the corresponding order and entitlements. Browser code must never grant access based only on a success-page redirect.

“Row Level Security,” abbreviated RLS, means database policies that decide which rows a Supabase user may read or change. Public visitors may only read published public content. Customers may only read their own private records and content granted by entitlements. Editors and owners may maintain the artist's content. Server-only credentials must never appear in browser code.

“Codex-native” means the repository includes stable instructions, scripts, configuration contracts, and checks that allow Codex to guide setup and maintenance safely. It does not mean the public website calls an AI model. The human supplies creative identity, rights decisions, prices, service accounts, and approval for consequential actions. Codex writes and changes code, organizes approved content, performs local setup, explains service checkpoints, and validates results.

The initial repository layout must become:

    AGENTS.md                       repository-wide agent rules and product boundaries
    README.md                       human introduction, quick start, and project explanation
    SETUP.md                        artist-facing guided setup entrypoint
    artist.config.ts                typed public identity, feature, navigation, and design configuration
    app/                            Nuxt pages, layouts, components, composables, middleware, and assets
    server/                         private API routes, Stripe handlers, media delivery, and service adapters
    shared/                         types and validation schemas used by browser and server code
    supabase/                       local configuration, consolidated migrations, seed data, and database tests
    scripts/                        preflight, setup, import, validation, backup, and redacted diagnostic commands
    docs/agent/                     Codex runbooks for setup, services, content, maintenance, and recovery
    docs/artist/                    human guides for identity, catalog, commerce, licensing, learning, and operations
    docs/architecture/              data model, authorization, entitlements, media, and deployment explanations
    docs/provenance.md              pre-existing reference concepts and Build Week generalization record
    docs/submission/                model, capability, judging, demo, and submission evidence
    content/demo/                   redistribution-safe sample identity, writing, artwork, audio, and video metadata
    setup/project-state.json        non-secret record of completed setup stages and enabled modules
    workers/media/                  shared local and deployed audio-processing worker
    tests/                          unit, integration, database-policy, and browser journey tests

The public application must provide home, music, release, track, collection, licensing, learn, course or path, video, about, contact, sign-in, account, and legal surfaces when their modules are enabled. The authenticated administration workspace must provide overview, identity and theme, pages and navigation, music, media, commerce, licensing, memberships, learning, video, telemetry, and system-status areas. Features may be disabled through validated configuration without leaving broken navigation.

The core data model must include site settings, administrator roles, profiles, pages, navigation, albums, tracks, collections, ordered collection membership, artwork and media objects, playlists, favorites, products, prices, carts or checkout intents, orders, order items, subscriptions, membership tiers, entitlement grants, download records, license templates, license selections, issued licenses, learning areas, paths, courses, lessons, lesson progress, videos, contact messages, consent records, analytics events, and operational audit records. Use stable UUID identifiers internally and human-readable slugs in URLs.

## Plan of Work

The critical dependency chain is database authority, secure media, central entitlements, commerce and licensing fulfillment, and finally the agent-guided setup that composes those systems. Public pages and administration can advance alongside that chain once the shared schemas exist, but no feature is considered finished until it uses the real authorization and publication rules. This prevents an impressive-looking interface from concealing incomplete ownership or payment behavior.

The Build Week cadence is organized to complete the whole platform. July 14 establishes the initial contract and plan. July 15 completes the reviewed planning baseline, application, schema, authentication, storage, and Authority and Fulfillment Spine. July 16 completes artist identity, administration, catalog intake, deployed media processing, and listening. July 17 completes Stripe commerce, memberships, entitlements, and licensing. July 18 completes learning, video, editorial publishing, and telemetry. July 19 completes the Codex-native setup, maintenance, and portability experience. July 20 completes full integration, security, accessibility, performance, clean-clone packaging, and the judging environment. July 21 completes final regression work, evidence, the demo, and submission preparation before the 6:00 PM Mountain deadline.

Every product module remains part of the completion standard. If implementation evidence changes the most effective order, update `Progress` and `Surprises & Discoveries`, keep the application runnable, and continue through all remaining milestones. Every final control and public claim must be backed by working behavior. Test-mode external services provide real integration evidence for judging; decorative mocks do not satisfy a milestone.

### Milestone 0: Establish the product contract and provenance boundary

Write `README.md`, `AGENTS.md`, `docs/architecture/product-contract.md`, and `docs/provenance.md` before porting functional code. Preserve `docs/architecture/configuration-authority.md`, `docs/architecture/media-processing-contract.md`, `docs/submission/model-and-agent-use.md`, and `docs/submission/capability-evidence.md` as controlling contracts created during the reviewed planning baseline. The product contract must define the single-artist model, supported modules, administrator and customer roles, external-action approval gates, data ownership, and what “artist-owned” means. The provenance record must distinguish pre-existing Sound for Movement concepts from new Build Week generalization work and must be updated with each adapted area.

Create an Architecture Decision Record directory at `docs/architecture/decisions/`. Add short records for the single-artist deployment, Nuxt/Supabase/Stripe stack, consolidated schema, entitlement authority, configuration authority, agent-readable setup, media processing, portability, and public design configuration. Decide the Build Week track by the end of this milestone; Developer Tools is the leading candidate because the agent-operable repository is the transferable product and the personalized site proves it works. Record the open-source license decision before the repository becomes public. Compare a permissive license such as MIT, which allows proprietary derivatives, with a network-copyleft license such as AGPL-3.0, which requires published modified network software to remain open. Michael must choose the license based on the intended gift and stewardship model.

Acceptance for this milestone is a repository whose purpose and boundaries can be understood without prior conversation. `rg -n "Sound for Movement|soundformovement" .` may find explanatory provenance references, but it must find no copied branding, production URL, personal data, credentials, or redistributable media assumptions.

### Milestone 1: Bootstrap a reproducible application and local demonstration

Create the Nuxt 4 TypeScript application at the repository root using Node 24 and npm. Add Nuxt Image, Supabase, Pinia, VueUse, Tailwind, Zod, Nuxt Security, Vitest, Playwright, axe-core, ESLint, and Prettier. Add `package.json` scripts for development, type checking, linting, unit tests, integration tests, database tests, end-to-end tests, production build, setup preflight, local setup, seed reset, health checks, and the complete verification suite. Generate and commit the npm lockfile. Use `npm ci` for clean-clone, continuous-integration, and judging verification after the initial dependency resolution.

Create `artist.config.ts` and validate it through a Zod schema in `shared/schemas/artistConfig.ts`. The initial demo identity must be clearly fictional and use only redistribution-safe content in `content/demo/`. Design tokens must cover color, typography, spacing, corners, surface treatment, logo assets, navigation, and feature flags. Public components must consume semantic tokens rather than embedding a Sound for Movement palette.

Add local Supabase configuration and a setup script that checks Node, npm, Docker, Supabase CLI availability, writable paths, and environment variables without printing secret values. `npm run setup:local` must be safe to rerun and must start Supabase, apply migrations, seed the demonstration artist, generate TypeScript database types, and report the local URLs. `npm run dev` must then show a coherent demonstration home page and navigation even before later modules are complete.

Add a continuous-integration workflow under `.github/workflows/verify.yml` that runs every verification step not requiring private credentials. Acceptance is a fresh-clone sequence that reaches a running local page with one documented command path. `npm run verify:foundation` must run formatting checks, linting, type checking, unit tests, and a production build, and the same foundation checks must pass in the visible workflow.

### Milestone 2: Create the database, authentication, storage, and authorization foundation

Create consolidated migrations in `supabase/migrations/` in dependency order. Separate public content, account data, commerce records, learning records, and operational events into understandable tables and database functions. Add the base products, simulated payment events, orders, entitlements, media objects, and download records needed by Integration Gate A even though the complete Stripe catalog is delivered in Milestone 5. Add indexes for slugs, published-state queries, ownership, entitlement lookup, payment identifiers, and chronological metrics. Generate `shared/types/database.ts` from the local schema rather than hand-maintaining it.

Configure Supabase authentication for email sign-in and optional OAuth providers. OAuth providers remain disabled until an artist supplies provider credentials and configures redirect URLs. Implement `owner`, `editor`, and `customer` roles. Use an invitation or explicit owner bootstrap process; never let the first arbitrary public signup become an administrator.

Create public artwork and preview-media buckets plus private source-audio, download, license-document, lesson-media, and administrative buckets. Storage policies must mirror database access. Full-resolution audio and purchased files must be delivered through short-lived signed URLs from server routes after entitlement checks.

Implement the initial `decideAccess` contract and a protected download route backed by one seeded release, one public preview, and one private fixture. Add database-policy tests that run as anonymous, customer, editor, owner, and service-role identities. They must prove public users cannot read drafts, customers cannot read another customer's orders or licenses, editors cannot modify server-owned payment records, and owners can maintain content without gaining access to secret material.

Acceptance is a local site where a visitor can sign up and sign in, an explicitly seeded owner can enter the administration area, the seeded release and preview are publicly readable, and all role-policy tests pass. The generated browser bundle must contain no service-role key or Stripe secret.

### Integration Gate A: Prove the Authority and Fulfillment Spine

Before expanding the administration and product surfaces, prove the shared authority path end to end. Start from a clean local database. Sign in as the seeded owner and two seeded customers. Read the one published release and play its public preview. Submit one deterministically signed simulated payment event for the first customer. Process the event transactionally into exactly one order and one entitlement. Request the private fixture through the protected download route and receive it as the entitled customer. Request the same fixture as the second customer and receive a denial. Replay the payment event at least three times and prove that no duplicate order or entitlement appears.

This gate uses the production-shaped event, fulfillment, entitlement, and signed-delivery interfaces even though Stripe test mode is connected later. It must pass database-policy, integration, and Playwright tests. Record the exact files, commit, tests, manual actions, and outcome in `docs/submission/capability-evidence.md`. Later commerce, license, membership, learning, and media features extend this spine rather than defining separate access systems.

Acceptance is a single verification command, `npm run verify:spine`, that resets the local fixtures, runs the payment replay and cross-account denial tests, and exits successfully with one order, one entitlement, one allowed protected delivery, and one denied delivery.

### Milestone 3: Build artist onboarding, identity, navigation, and administration

Implement `app/pages/admin/` as an accessible workspace rather than a generic grid of cards. The artist must be able to edit site name, biography, contact information, social and distribution links, logo and imagery, semantic colors, typography choices, navigation, footer, search metadata, and enabled modules. Follow `docs/architecture/configuration-authority.md`: shared schemas define the contract, `artist.config.ts` supplies bootstrap defaults, Supabase is authoritative for artist-editable runtime values, environment configuration is authoritative for secrets, and `setup/project-state.json` records only non-secret setup status.

Implement reusable page sections for prose, images, calls to action, credits, links, featured releases, featured learning paths, video, and contact. This is a structured page composer, not a freeform drag-and-drop HTML editor. The schema must preserve authored order and allow draft, preview, and publish states. Create home, about, and contact defaults that the artist can replace.

Add unsaved-change protection, preview, explicit publish controls, image alternative-text requirements, keyboard operation, and responsive layouts. Add a server-owned contact endpoint with validation, rate limiting, spam resistance, and an optional mail adapter. The local demonstration stores contact messages without sending external email.

Acceptance is an owner changing the fictional artist's name, colors, biography, navigation, and home content through the administration workspace, previewing the result, publishing it, and seeing the public site change without editing source code.

### Milestone 4: Build the catalog, media intake, and listening experience

Implement albums, tracks, collections, artwork, credits, genres or artist-defined taxonomies, release dates, duration, key, meter, tempo, mood, instruments, descriptive text, explicit ordering, and publish state. The schema must allow a track to appear on one primary album and in multiple ordered collections without duplicating the audio record.

Build administration forms for single and bulk entry. Add resumable direct-to-storage uploads for large source audio, image validation and optimization, durable `media_jobs`, audio metadata inspection, duration verification, waveform generation, and preview generation. Implement the shared worker described by `docs/architecture/media-processing-contract.md` at `workers/media/index.ts`, with `npm run media:work` and `npm run media:watch` locally and the root-context `Dockerfile` for hosted processing. Keep the original source immutable in private storage. Generate or accept a public preview according to artist-configured policy. Never overwrite a source file during conversion.

Build public music, release, track, and collection pages with a persistent accessible player. Support queueing, play and pause, seeking, next and previous, keyboard control, route changes, responsive behavior, and one active audio source at a time. Add customer playlists, album and track favorites, and recently played history behind account access. Preserve artist-authored release and collection order.

Create `scripts/import-media.ts` for the Codex-guided intake journey. It may inspect approved files with ffprobe or equivalent local metadata tools and propose records, slugs, track order, and missing fields in a review manifest. It must not publish, upload, or infer rights without explicit confirmation. Applying an approved manifest must be idempotent by content hash and stable identifier.

Acceptance is an artist importing or manually creating an album with artwork and at least two tracks, editing the proposed metadata, publishing it, and listening through the public site. Reapplying the same approved import manifest must not duplicate albums, tracks, or media. The same approved audio fixture must reach `ready` through both the local worker and the explicitly approved deployed worker configuration, and the hosted site must retrieve its waveform and play its generated preview.

### Milestone 5: Build commerce, memberships, and the entitlement engine

Create a service-neutral product model that maps artist offerings to Stripe product and price identifiers without making Stripe the database of editorial truth. Support free items, externally linked items, one-time album or track downloads, recurring membership tiers, and licensing products. Price display must include currency and clearly distinguish purchase, membership, and license actions.

Implement server-created Stripe Checkout sessions, a signed webhook endpoint, idempotent event storage, atomic order fulfillment, subscription updates, refund and cancellation handling, and customer portal sessions. “Atomic” means the database either records the complete payment result and its entitlements together or records neither, preventing half-finished access grants. Treat webhook verification as authoritative; a browser return URL only displays current server state.

Implement the entitlement engine as a small stable module shared by downloads, membership content, education, and licenses. It must answer whether a user can access a resource, why access exists, when it expires, and whether it was revoked. Keep grants auditable. Signed download routes must check the entitlement at request time and log successful delivery without exposing permanent storage URLs.

Provide a deterministic local Stripe simulation for automated integration tests and a separate documented Stripe test-mode journey using official test credentials. Never require live mode for development or judging. The administration workspace must show product mappings and fulfillment status without exposing secret keys.

Acceptance is a customer completing a simulated and then test-mode one-time purchase, receiving exactly one order and the correct album entitlement despite webhook retries, downloading the protected file, subscribing to a membership, accessing member material, and losing future membership access after a tested cancellation or expiry rule while retaining any explicitly permanent purchase.

### Milestone 6: Build music licensing and license delivery

Implement artist-defined license templates containing plain-language usage categories, allowed media, audience or distribution ranges, term, territory, attribution, exclusivity, and pricing rules. Keep the initial rule engine intentionally explicit: supported choices and calculated prices must be visible to the buyer before checkout. Unusual requests must route to an inquiry rather than silently inventing legal terms.

Create a licensing journey from a track page through usage selection, price explanation, account or buyer details, Stripe checkout, signed fulfillment, and an issued license record. Generate a human-readable license document from the exact selected terms and immutable template version. Store the document privately and expose it through the customer's account with entitlement checks. Make clear that the provided templates are artist-configurable business documents and not legal advice.

Implement an artist view of issued licenses with track, licensee, terms, date, amount, payment state, and document status. Add recovery for delayed webhooks and document-generation failures without double charging or issuing conflicting records.

Acceptance is a test buyer licensing a demonstration track, seeing the same terms before and after payment, receiving one issued license and protected document after webhook retries, and finding that license in their account. An unsupported use must produce an inquiry path rather than checkout.

### Milestone 7: Build education, learning paths, video, and editorial publishing

Implement learning areas, paths, courses, ordered lessons, lesson sections, rich text, images, audio, video, downloadable resources, and learner progress. Allow each unit to be public, account-required, individually entitled, or membership-entitled. Reuse the central entitlement engine and private media-delivery routes rather than creating separate authorization logic.

The artist administration workspace must create, reorder, preview, and publish paths, courses, lessons, and mixed-media sections. The learner experience must preserve deliberate authored order, resume progress, mark completion, and show the next meaningful lesson. Add video pages with credits, poster imagery, transcript or description, accessible playback or approved external embeds, and explicit publication state.

Add an editorial publishing surface for essays, announcements, learning notes, or artist-defined informational pages using the same safe structured-content renderer. Sanitize rich text on the server and prevent untrusted script or embed injection.

Acceptance is an artist building a three-lesson learning path containing prose, image, audio, and video, placing one lesson behind membership, and publishing it. An anonymous visitor can view the public lesson, a non-member is shown the configured access explanation, a test member can continue and record progress, and the account accurately resumes the next lesson.

### Milestone 8: Build privacy-conscious telemetry and operational status

Implement first-party events for page views, media starts and meaningful listens, catalog searches, product interest, checkout initiation and completion, downloads, license interest and completion, course progress, contact conversion, and setup health. “First-party” means the event is sent directly to the artist's own application and database rather than to a third-party advertising network.

Define event purpose, retention, identifiers, and consent behavior in `docs/artist/privacy.md`. Collect the minimum needed fields, avoid raw secret or payment data, and provide a configuration that disables optional analytics. Respect browser privacy signals where required by the chosen policy. Separate operational logs needed for security or fulfillment from optional audience analytics.

Build an artist-facing metrics area showing understandable trends and content performance, plus a system-status area for failed webhooks, media processing, email adapter status, storage configuration, and migration version. All diagnostics must redact tokens, connection strings, personal addresses, and payment details.

Acceptance is a visitor journey producing the documented events, the owner seeing aggregated results, consent settings changing optional collection behavior, and `npm run diagnose` producing a useful redacted report that can be safely shared with Codex.

### Milestone 9: Build the Codex-native artist setup and maintenance experience

Create `SETUP.md` as the nontechnical entrypoint. It should tell an artist how to obtain or open the repository with Codex and give one starting request, such as “Help me set up my artist-owned site.” `AGENTS.md` must then instruct Codex to run preflight, explain the human-agent responsibility boundary, conduct the interview, preserve user work, avoid unapproved external state, and update `setup/project-state.json` as stages finish.

Implement `npm run setup:interview` to emit a structured interview covering artist identity, audience, site goals, visual direction, pages, catalog location, commerce, licensing, memberships, learning, video, contact, privacy, and deployment intentions. Codex asks those questions conversationally and writes `setup/proposals/<proposal-id>.json`. `npm run setup:preview -- <proposal>` validates the proposal and produces a non-mutating diff. After explicit artist approval, `npm run setup:apply -- <proposal>` performs deterministic changes. `npm run setup:check` verifies the result before updating `setup/project-state.json`.

Create agent runbooks for Supabase local and hosted projects, authentication and OAuth, storage, Stripe test mode and later live mode, Vercel, custom domains and DNS, email, media import, backup, restore, upgrades, and common failures. Each runbook must state which steps Codex can perform locally, which require a connected plugin or CLI, which create external state or cost, and which require explicit human approval. Instructions must work without assuming a particular plugin; connected Supabase, Vercel, or payment tooling may accelerate the same documented contract.

Completed setup instructions must not simply disappear. `setup/project-state.json` must retain a non-secret, auditable record of enabled modules, migration version, completed checks, and remaining external steps. The human-facing setup UI may collapse completed stages, while the recovery instructions remain available for future maintenance or a new machine.

Acceptance is a new Codex task reading only the repository, taking a fictional artist through the guided local setup, applying an approved identity and two-track import, detecting intentionally missing service configuration, explaining the exact human checkpoint, and reaching a passing `npm run setup:check` without exposing credentials or mutating an external account.

### Milestone 10: Make artist ownership portable and verifiable

Implement `npm run export:artist`, `npm run export:verify`, and `npm run restore:check`. The export must include a versioned snapshot of public configuration and design, navigation and pages, catalog metadata and credits, product and licensing definitions without secret Stripe values, learning and editorial structure, a media inventory with hashes and storage paths, the current schema and application versions, database backup instructions, customer-data export procedures, and a redacted service-connection manifest.

The export may reference large media through a verified manifest rather than forcing every file into one archive. `export:verify` must validate every structured artifact and confirm that each media reference has a matching hash and documented retrieval path. `restore:check` must prove that a fresh local installation can accept the portable content and identify any artist action required to reconnect external accounts. Exports must never contain service secrets, private task metadata, unapproved personal data, or permanent signed URLs.

Acceptance is an artist producing an export from the configured demonstration, verifying it, initializing a clean local database, importing the portable configuration and content, and seeing equivalent public catalog, licensing, learning, video, and design behavior. The evidence matrix must record the export manifest, tests, and manual comparison.

### Milestone 11: Harden security, accessibility, reliability, and performance

Audit all trust boundaries: browser to server, server to Supabase, Stripe to webhook, uploads to media processing, public content to renderer, and administrator actions to database. Add schema validation, rate limiting, content-type and size enforcement, signed URL expiry, webhook replay protection, idempotency keys, secure headers, cross-site request protections where applicable, and explicit server-only modules. Run Supabase advisors against a disposable or approved environment and resolve new actionable findings in the clean schema.

Test keyboard navigation, visible focus, semantic landmarks, form labels and errors, alternative text, captions or transcripts, color contrast, reduced motion, and screen-width behavior. Use axe checks in Playwright for critical public and administrative pages, followed by manual browser review. The visual system must permit artist expression while retaining accessible token constraints.

Measure public home, music, release, and learning pages under production build. Optimize images, audio loading, database queries, cache headers, and client bundles based on evidence. Do not preload full audio. Add graceful empty, loading, offline, service-unavailable, payment-pending, and media-processing states.

Document database and storage backup and restore, Stripe reconciliation, failed media retry, and versioned upgrade procedures. Setup and migrations must be safe to rerun. Destructive reset commands must be clearly local-only and reject a production connection.

Acceptance is a passing full verification suite; zero known critical or high security findings within the project scope; no serious axe violations in defined journeys; a successful production build; documented recovery drills for database reset, failed webhook replay, and media retry; and a responsive manual review on mobile and desktop viewports.

### Milestone 12: Package the complete fresh-clone and judging experience

Replace temporary fixtures with a coherent fictional demonstration artist using original or explicitly redistribution-approved audio, artwork, text, and video. Record provenance and license for each asset. The demonstration must exercise every enabled module without using Michael's private catalog or Sound for Movement branding.

Complete `README.md` with the purpose, screenshots, architecture, requirements, five-minute local path, full service path, supported platforms, module overview, test commands, security model, deployment model, costs that may exist despite free software, open-source license, contribution guidance, and troubleshooting. Complete `docs/submission/judge-quickstart.md`, the artist and agent documentation, and all internal links. Add `npm run demo:local` and `npm run demo:reset` so the judge path is deterministic.

Run a clean-room rehearsal from a new clone or temporary directory with no untracked local configuration. A novice-following-Codex path and a judge path must both work. The judge path may use an approved hosted demonstration and test account, but must not require rebuilding the project or using a live payment method.

Acceptance is a clean clone that reaches the demonstration locally using the documented commands, an agent-guided personalization rehearsal that changes identity and imports media, a complete hosted-test plan with redacted credentials, and no dependency on the private Sound for Movement repository.

### Milestone 13: Assemble the Build Week submission evidence

Update `BUILD_WEEK.md` and `README.md` with the final project name, selected track, working description, scope of new competition-period work, important decisions made by Michael, and specific contributions from Codex, GPT-5.6 Sol, and GPT-5.6 Pro. Reconcile `docs/submission/model-and-agent-use.md` and `docs/submission/capability-evidence.md` with task metadata and dated commits, then capture the `/feedback` session ID from this primary implementation task.

Prepare `docs/submission/judging-guide.md`, `docs/submission/project-description.md`, and `docs/submission/demo-script.md`. The video script must fit under three minutes, show a fresh or near-fresh artist setup, reveal the functioning personalized site, demonstrate at least one direct transaction or entitlement, and briefly explain the agent-readable repository and how Codex performed the implementation. The script should describe the work honestly as agent-coded and human-directed.

Verify that judges have free and unrestricted access through the required period, that any test payment path uses Stripe test mode, and that every public asset is authorized. Prepare but do not perform repository publication, hosted production promotion, video upload, external sharing, or Devpost submission without Michael's explicit action-specific approval.

Acceptance is a complete submission package satisfying every item in `BUILD_WEEK.md`, a final judge rehearsal under three minutes, a recorded session ID, a clean or intentionally documented Git state, and explicit approval checkpoints remaining for each publication action.

## Concrete Steps

Run all commands from `<repository-root>` unless a step says otherwise. Keep the application runnable and commit after each coherent milestone.

The initial implementation sequence is:

    git status --short --branch
    npm install
    npm ci
    npm run setup:preflight
    npm run setup:local
    npm run dev

After Milestone 1, the expected setup transcript should resemble:

    Preflight: PASS
    Local Supabase: running
    Migrations: current
    Demo seed: applied
    Generated database types: current
    Nuxt: http://localhost:3000

After Milestone 2, prove the shared authority path before expanding dependent modules:

    npm run verify:spine

The expected semantic result is:

    Public release and preview: PASS
    Signed simulated payment: PASS
    Transactional order and entitlement: PASS
    Entitled protected delivery: PASS
    Cross-account denial: PASS
    Three-event replay idempotency: PASS

The deterministic setup lifecycle must expose:

    npm run setup:interview
    npm run setup:preview -- setup/proposals/<proposal-id>.json
    npm run setup:apply -- setup/proposals/<proposal-id>.json
    npm run setup:check

The media worker and portability commands must expose:

    npm run media:work
    npm run media:watch
    npm run export:artist
    npm run export:verify
    npm run restore:check

The judge environment must expose:

    npm run demo:local
    npm run demo:reset

The routine focused verification commands must be:

    npm run format:check
    npm run lint
    npm run typecheck
    npm run test:unit
    npm run test:integration
    npm run test:db
    npm run test:e2e
    npm run build

The repository must expose one aggregate command:

    npm run verify

The expected final summary is semantic rather than tied to a brittle test count:

    Formatting: PASS
    Lint: PASS
    Typecheck: PASS
    Unit: PASS
    Integration: PASS
    Database policies: PASS
    End-to-end: PASS
    Production build: PASS

Use `npm run setup:check` after any service or environment change. It must report named checks and redact all values:

    Artist configuration: PASS
    Supabase connection: PASS
    Database migration: PASS
    Storage policies: PASS
    Authentication redirects: PASS or ACTION REQUIRED
    Stripe test mode: PASS or ACTION REQUIRED
    Stripe webhook: PASS or ACTION REQUIRED
    Deployment: LOCAL or ACTION REQUIRED
    Domain: LOCAL or ACTION REQUIRED

Use Stripe simulation for automated tests. When Michael separately approves connecting a Stripe test account, use the documented test-mode command and record only non-secret evidence in `docs/submission/judging-guide.md`. Never include keys or webhook secrets in terminal transcripts, Git, screenshots, or diagnostics.

Before any release candidate, run:

    rg -n --hidden --glob '!node_modules/**' --glob '!.git/**' '/Users/|michaelwall|file://|Sound for Movement|soundformovement|SUPABASE_SERVICE_ROLE|STRIPE_SECRET|BEGIN (RSA|OPENSSH|EC) PRIVATE KEY' .
    npm run diagnose
    npm run verify
    git status --short

Review every match. Explanatory provenance and public author-credit matches are allowed; machine-specific paths, private usernames, branding outside provenance, production endpoints, secrets, private data, local credentials, personal email addresses, and unauthorized media are not.

## Validation and Acceptance

The project is accepted as complete only when all of the following behaviors work together in one supported installation.

An artist can start from a fresh clone, ask Codex to begin setup, complete the identity interview, run local Supabase, apply an approved configuration, and launch the demonstration without editing source code manually. The system gives specific, non-secret guidance for any unconnected external service.

The setup lifecycle produces a structured proposal, a validated non-mutating preview, an explicit approval boundary, a deterministic application, a verification result, and an updated non-secret project-state record. GPT-5.6 Sol and GPT-5.6 Pro operate through Codex; the installed public application remains functional without an OpenAI API key.

An owner can sign in to the administration workspace; change the artist identity and public navigation; create, import, reorder, preview, and publish albums and tracks; maintain pages, videos, licensing terms, membership tiers, and a learning path; and view redacted operational and audience information. An editor can maintain content but cannot alter server-owned payment events or owner-only settings.

An owner or editor can upload approved source audio directly to private storage in the hosted demonstration. The durable job becomes visible, the deployed worker creates versioned preview and waveform derivatives, and the public player uses them only after the job reaches `ready`. The same worker behavior passes locally.

A visitor can navigate an expressive responsive site, listen to public previews, explore releases and collections, view public educational and video content, contact the artist through a protected endpoint, create an account, and manage consent. Keyboard and screen-reader fundamentals must work on all critical journeys.

A test customer can purchase a download, receive exactly the intended entitlement after repeated webhook delivery, retrieve a protected file through a short-lived URL, buy a supported license with consistent terms and a private document, join a membership, access a protected lesson, record course progress, and manage the subscription through the Stripe test customer portal. Another customer cannot read or use those records.

The site records only documented first-party events, honors its configured consent rules, and gives the owner understandable aggregate metrics. Operational diagnostics identify broken service connections without revealing secret or personal values.

The artist can create and verify a portable export, initialize a clean local installation, restore public configuration and content, reconcile media through the hashed inventory, and receive explicit instructions for reconnecting external accounts without carrying secrets into the export.

The complete automated suite passes against the local environment and continuous integration, the production build starts successfully, and a clean-clone rehearsal follows the documented `npm ci` path. The hosted judge environment supports deterministic reset and does not require judges to rebuild the application. The public demonstration and competition artifacts must contain only approved assets and must remain unpublished until explicitly approved.

## Idempotence and Recovery

All setup and import commands must be safe to rerun. Database migrations are forward-only and versioned. Local development may use a clearly named reset command that refuses any non-local Supabase URL. Hosted database changes require a generated migration, a review of the SQL and policies, and explicit approval before applying to an external project.

Media imports use stable identifiers and content hashes. Reapplying an approved manifest updates the matching draft record or reports a no-op; it never creates silent duplicates. Original source media remains unchanged. Interrupted uploads and conversions can resume or restart into a temporary object before an atomic final record is created. Media workers claim jobs through leases, use versioned derivative identifiers, and cannot let a stale attempt overwrite a later successful result.

Stripe webhook handling stores event identifiers and makes fulfillment idempotent. Retrying the same event must not duplicate orders, entitlements, subscriptions, or licenses. Failed fulfillment remains visible and can be replayed from a documented local or test-mode command. Refund and cancellation operations append auditable state changes rather than erasing payment history.

Configuration application writes a preview and diff before changing tracked files or database settings. `setup/project-state.json` contains no secrets and can be regenerated from checks. Secrets live only in ignored environment files or connected service stores. `.env.example` contains names and explanations, never usable values.

Artist export is repeatable and versioned. Creating an export twice from unchanged state produces equivalent structured content and hashes. Restore checks operate against a disposable local database and never overwrite an existing installation without an explicit reviewed target.

Deployment, DNS, OAuth-provider, live Stripe, email, and public-release steps stop at an approval checkpoint. If approval is not given, local and test-mode verification remain valid and the plan records the external step as pending rather than attempting a workaround.

## Artifacts and Notes

The central Build Week evidence set must eventually include:

    BUILD_WEEK.md
    README.md
    AGENTS.md
    SETUP.md
    plans/artistOwnedPlatform.md
    docs/provenance.md
    docs/architecture/configuration-authority.md
    docs/architecture/media-processing-contract.md
    docs/architecture/product-contract.md
    docs/architecture/decisions/
    docs/submission/model-and-agent-use.md
    docs/submission/capability-evidence.md
    docs/submission/project-description.md
    docs/submission/judging-guide.md
    docs/submission/judge-quickstart.md
    docs/submission/demo-script.md
    setup/project-state.json
    test-results/ or a concise checked-in verification summary

The Git history is part of the evidence. Commit messages should describe observable milestones, and `docs/provenance.md` should identify which generalized capabilities were informed by pre-existing user-owned work. `docs/submission/capability-evidence.md` must connect every public claim to the new files, commit, automated test, manual or judge action, and final demo timecode. The README must avoid claiming that Codex supplied the artistic purpose or business judgment. A precise description is that Michael directed the product, supplied the operating knowledge and creative decisions, and Codex performed the implementation, generalization, tests, setup automation, and technical documentation using GPT-5.6 Sol and GPT-5.6 Pro.

The provisional demonstration story is: a dance accompanist opens the repository with Codex, describes a warm and direct identity, supplies approved cover art and two original tracks, enables licensing and a rhythm-learning path, reviews Codex's proposal, and launches a personalized local site. A visitor listens, licenses a track in Stripe test mode, signs into the resulting account, retrieves the license, and opens a membership lesson. The final demo may simplify screen time, but the underlying judge environment must retain the complete modules.

## Interfaces and Dependencies

Use Node 24, npm, Nuxt 4, Vue 3, and TypeScript. Use Supabase for PostgreSQL, authentication, Row Level Security, and object storage. Use Stripe Checkout, Billing, webhooks, and the customer portal for payment flows. Use Zod at every untrusted configuration and request boundary. Use Pinia only for genuine client-side state such as the player and cart; server and database data should use Nuxt data utilities and typed service modules. Use Vitest for unit and integration tests, Supabase SQL tests or an equivalent local policy harness for database authorization, and Playwright with axe-core for complete browser journeys.

The stable shared configuration interface in `shared/schemas/artistConfig.ts` must validate an `ArtistConfig` with identity, design, navigation, feature, contact, commerce, licensing, learning, telemetry, and deployment-safe public settings. Follow `docs/architecture/configuration-authority.md`: repository code defines schemas and bootstrap defaults, Supabase owns artist-editable runtime state, environment variables own secrets, and `setup/project-state.json` owns only non-secret setup status. Secret settings must use a separate server-only `ServiceConfig` validated from environment variables.

The server entitlement module must expose behavior equivalent to:

    type ResourceRef = {
      kind: 'track' | 'album' | 'collection' | 'download' | 'license' | 'course' | 'lesson' | 'video'
      id: string
    }

    type AccessDecision = {
      allowed: boolean
      reason: 'public' | 'purchase' | 'license' | 'membership' | 'admin' | 'expired' | 'missing'
      entitlementId?: string
      expiresAt?: string
    }

    async function decideAccess(userId: string | null, resource: ResourceRef): Promise<AccessDecision>

All protected server routes must call the same decision layer or a database function implementing the same contract. Do not duplicate membership or purchase checks in individual page components.

The media-import interface must separate inspection from application:

    async function inspectMedia(inputDirectory: string): Promise<ImportProposal>
    async function validateImportProposal(proposal: unknown): Promise<ImportProposal>
    async function applyApprovedImport(proposal: ImportProposal): Promise<ImportResult>

`ImportProposal` contains proposed files, content hashes, metadata, order, slugs, rights confirmations still required, and planned destinations. `applyApprovedImport` must reject a proposal whose required confirmations are incomplete.

The media worker must expose behavior equivalent to:

    type MediaJobStatus = 'pending' | 'processing' | 'ready' | 'failed'

    type MediaJobClaim = {
      jobId: string
      mediaId: string
      sourceHash: string
      sourcePath: string
      processingProfileVersion: string
      leaseExpiresAt: string
    }

    async function claimMediaJob(workerId: string): Promise<MediaJobClaim | null>
    async function processMediaJob(claim: MediaJobClaim): Promise<void>

The same worker library must serve `npm run media:work`, `npm run media:watch`, and the container entrypoint. Derivatives are keyed by source hash, processing-profile version, and kind. Job finalization must reject stale leases.

The setup checker must return structured results as well as readable terminal output:

    type SetupCheck = {
      id: string
      status: 'pass' | 'action-required' | 'fail'
      summary: string
      safeDetails?: Record<string, string | number | boolean>
      runbook?: string
    }

The Stripe webhook layer must verify signatures before parsing business data, store the event identifier, perform fulfillment transactionally, and return a successful retry-safe response only after the event is durably recorded. The license generator must render from a versioned immutable snapshot of the selected terms, not from a mutable current template.

Avoid unnecessary platform dependencies. Email is an adapter with local capture as the default. Vercel is the first documented host, not a hard runtime dependency. OAuth providers are optional. Telemetry is first-party and can be disabled. The public site must continue to present published content and public previews when Stripe is not configured; commerce actions must then display an honest artist-configured unavailable state.

Revision note, 2026-07-14: Created the initial full-product ExecPlan from the Build Week requirements, the ideation conversation, and a read-only inventory of the proven Sound for Movement web architecture. The plan intentionally covers the entire artist-owned platform while ordering milestones around database authority, entitlements, and Codex-guided setup so implementation can remain demonstrable throughout the week.

Revision note, 2026-07-14: Added the dated Build Week cadence and critical dependency chain so the complete scope has an explicit path to the competition deadline without presenting unintegrated mock surfaces as finished features.

Revision note, 2026-07-14: Reframed the delivery commitment after Michael identified that preemptively comparing the project with years of production maturity weakened the intended Build Week ambition. The complete platform is now explicit as the competition outcome; schedule discoveries may change implementation order but do not lower the definition of completion.

Revision note, 2026-07-15: Incorporated the independent GPT-5.6 Pro review and Michael's confirmation that Build Week uses GPT-5.6 Sol and GPT-5.6 Pro. Added the primary-task record, model evidence contract, configuration authority, Integration Gate A, shared local and deployed media worker, executable portability, capability evidence matrix, public-path hygiene, continuous integration, deterministic judge path, and revised milestone numbering. These additions strengthen integration and evidence while preserving the complete product definition.

Revision note, 2026-07-15: Completed the Milestone 0 product, provenance, agent, design, and architecture contracts; selected Developer Tools; recorded the license as a Michael decision before publication; and incorporated current Supabase guidance on Data API grants, RLS, and signed TUS storage uploads.

Revision note, 2026-07-15: Completed Milestone 1 with the pinned Nuxt 4 application, validated fictional artist configuration, semantic public design, local Supabase migration and RLS-backed seed, generated types, setup automation, CI, clean `npm ci`, production build, desktop/mobile Playwright and axe checks, visual acceptance, and implementation commit `83c3b4f`.

Revision note, 2026-07-15: Completed Milestone 2 and Integration Gate A with explicit account roles, forced RLS and Data API grants, seven storage buckets, email authentication, service-owned transactional fulfillment, central entitlements, 60-second signed delivery, generated public media, all-role database tests, clean-reset replay verification, browser-secret scanning, schema linting, desktop/mobile browser regression, visual acceptance, and implementation commit `12f5d66`.

Revision note, 2026-07-15: Completed Milestone 3 with database-authoritative artist configuration, validated versioned drafts, explicit publication and audit records, complete identity and design administration, all structured page-section editors, server-owned consent-based contact storage, deterministic aggregate verification, responsive browser coverage, visual acceptance, and implementation commits `0982946` and `37a7b12`.

Revision note, 2026-07-15: Completed Milestone 4 locally with authored catalog publication, signed immutable media intake, one local/container worker implementation, public listening, and private listener libraries. Hosted worker deployment remains an explicit approval gate.

Revision note, 2026-07-15: Completed Milestone 5 locally with application-owned offerings, Stripe Checkout and portal adapters, verified replay-safe fulfillment, memberships, refunds, cancellations, protected downloads, redacted recovery, and deterministic local commerce. Stripe sandbox use remains an explicit approval gate.

Revision note, 2026-07-15: Completed Milestone 6 locally with explicit artist-authored licensing, immutable selection and version authority, replay-safe issued licenses, private PDF documents, entitlement-checked delivery, refunds, inquiry routing, owner recovery, CI, and implementation commit `d6991d2`. Stripe sandbox use remains an explicit approval gate.

Revision note, 2026-07-15: Completed Milestone 7 with ordered mixed-media learning, four central access modes, private lesson delivery, progress and account resume, consent-gated video, safe structured rich text, editorial publishing, complete owner previews, deterministic isolated browser orchestration, and implementation commit `b49c36c`.

Revision note, 2026-07-15: Completed Milestone 8 with first-party session-only analytics, explicit consent and browser privacy-signal enforcement, configurable retention and disablement, owner-only aggregates, separate redacted operational checks, a shareable diagnostic, CI, real-audio browser evidence, and implementation commit `1b585c9`.

Revision note, 2026-07-15: Completed Milestone 9 with the 14-topic Codex interview, complete ignored proposals, stale-aware read-only preview, explicit local approval, deterministic artist and media application, post-apply verification, idempotent non-secret project state, provider-neutral service and recovery runbooks, CI, and implementation commit `ce976ff`.

Revision note, 2026-07-15: Completed Milestone 10 with deterministic versioned artist exports, strict portable schemas, hashed structured artifacts and bundled media, explicit private-data exclusions, redacted service state, backup procedures, tamper detection, migration-clean disposable restore, all-table equivalence and public-access checks, automatic demonstration recovery, CI, and implementation commit `e12d3be`.

Revision note, 2026-07-15: Completed Milestone 11 locally with same-origin security and redirect contracts, strict production headers, secure sessions, responsive service states, keyboard and axe coverage, explicit production performance budgets, reproducible PDF tooling, executable recovery drills, local reset safeguards, project-scoped Supabase gateway recovery, CI, a zero-finding dependency and schema audit, and implementation commit `8d1fca5`.

Revision note, 2026-07-15: Completed all approval-independent Milestone 12 work with original fictional assets, screenshots, deterministic demo and reset commands, full judge and contribution documentation, Chromium/WebKit coverage, and two clean-clone rehearsals. Commits `aead7ab` and `0ab2c9e` contain the package; final licensing and hosted proof remain explicit gates.

Revision note, 2026-07-15: Prepared the approval-independent Milestone 13 description, judging guide, hosted-test plan, 2:55 demo script, submission checklist, and clean-clone record in commit `0ab2c9e`. Final identity, license, external verification, `/feedback`, recording, publication, and submission remain pending their named approvals.

Revision note, 2026-07-15: Michael selected `AGPL-3.0-or-later` for the repository and its original fictional demonstration assets. Commit `fd9dfd8` added GNU's standard license text and reconciled package metadata, README, architecture, asset provenance, completion audit, and submission checklist. Repository publication remains a separate approval.

Revision note, 2026-07-15: Michael finalized Artist-Owned Platform as the public project name. Reconciled the competition brief, project description, completion audit, submission checklist, hosted evidence, model record, and remaining-gates ledger without publishing or deploying anything.

Revision note, 2026-07-15: Added the complete judge package to the primary `npm run verify` contract in commit `6cd3575` and passed one uninterrupted Node 24 aggregate through every local module, recovery and security gate, 11 isolated browser specifications, documentation and assets, Chromium/WebKit judge journeys, and browser-secret scanning.

Revision note, 2026-07-15: Implemented the project-bound hosted initialization, verification, and targeted reset contract in commit `c3dcf2d`; integrated its refusal, two-reset, identity-rotation, storage, provider-preservation, and redaction proof into `verify:recovery`; and left all actual hosted mutations behind their named approvals.

Revision note, 2026-07-15: Passed the complete post-reset Node 24 `npm run verify` aggregate from checkpoint `b226602`, refreshed the zero-vulnerability dependency audit, and confirmed clean local `public,private` schema lint.

Revision note, 2026-07-15: Closed the completion-audit OAuth and CI gaps in commit `fdbd9fa` with a closed-default Supabase PKCE implementation, configured and disabled browser gates, and 15 Linux jobs covering every local module, full browser regression, dependency audit, and the cross-browser package route; added the requirement-level completion audit; and passed the expanded full aggregate through 12 isolated browser specifications.

Revision note, 2026-07-15: Stabilized completed-playback meaningful-listen accounting and its response-backed Chromium proof in commit `fe2062a`; passed three fresh-demo focused repetitions, `verify:telemetry`, the full Node 24 aggregate from exact commit `fe2062aacaa9c808d6b05103d9fbcff144248ea0`, a zero-vulnerability dependency audit, and error-level `public,private` schema lint.

Revision note, 2026-07-15: Implemented the private request-driven Vercel Services topology in commit `04f23fa`; rebuilt and live-probed both worker images; passed the pinned CLI and official schema checks, zero-vulnerability dependency audit, clean `public,private` schema lint, and the complete Node 24 aggregate; and froze immutable local candidate `build-week-hosted-candidate-20260715-121920`. All provider creation, linking, deployment, and publication remain separately approval-gated.

Revision note, 2026-07-15: Under Michael's explicit Stage 1 and Stage 2A approvals, created isolated Build Week Supabase, Vercel Services, and Stripe sandbox resources; linked this checkout only to the approved Supabase project; confirmed 11 local and 0 remote migrations with pinned CLI `2.109.1`; and completed a non-mutating dry run that proposed exactly the 11 tracked forward migrations in order. A second migration-history read still found 0 remote migrations. Applying migrations remains a separate approval gate, and no Sound for Movement codebase or provider resource was changed.

Revision note, 2026-07-15: Under Michael's explicit Stage 2B approval, applied exactly the 11 reviewed forward migrations to the dedicated Build Week Supabase project without seed data, custom roles, reset, or repair. Remote history then matched 11 local to 11 remote versions in order; generated public types matched the tracked file after normalizing Supabase's environment-specific PostgREST `14.5` metadata block; and linked error-level lint found no errors in `public` or `private`. The CLI's post-push pg-delta catalog-cache warning was recorded after direct verification established that the schema application succeeded. Hosted fixtures remain a separate approval gate, and no Sound for Movement codebase or provider resource was changed.

Revision note, 2026-07-15: Under Michael's explicit Stage 3 approval, created ignored mode-`0600` private hosted inputs and ran the project-bound initializer exactly once against the dedicated Build Week Supabase project. The initializer and an independent hosted check both passed at reset contract version `2026-07-15.1`, verifying four fictional non-local Auth identities, Daymark Assembly public and role-aware content, six fictional objects across all seven storage boundaries, zero Stripe provider mappings, and fixture `sha256:ba0da2991582`. No password, email, provider credential, or full project reference entered tracked evidence; Stripe configuration, deployment, the first hosted reset, and judging access remain separate approval gates. No Sound for Movement codebase or provider resource was read or changed during initialization.

Revision note, 2026-07-15: Under Michael's explicit Stage 4A approval, confirmed the dedicated Stripe catalog was empty and created exactly three test-only products with default prices: the USD 12 Lines We Carry download, USD 75 Dance film study license, and USD 8 monthly Daymark Circle membership. Every returned product and price had `livemode: false`; the provider identifiers were saved through the temporary local owner-authorized administration API and recorded only as safe hashes. An independent Stripe catalog read and hosted check verified three products, three prices, three mappings, the unchanged fixture `sha256:ba0da2991582`, four accounts, and six storage objects. At that checkpoint, the second fictional live-performance license was intentionally unmapped pending a separate decision; no Checkout session, webhook, portal configuration, deployment, live-mode object, or real payment was created, and no Sound for Movement resource was touched.

Revision note, 2026-07-15: Under Michael's separate Stage 4A-2 approval, created the USD 125 Turn Toward Home small-live-performance license as one test-only Stripe product and one-time price, then saved its provider identifiers through the temporary local owner-authorized administration API. Independent provider reads verified four products and four prices with `livemode: false`; the hosted check verified four complete owner mappings while preserving fixture `sha256:ba0da2991582`, four accounts, and six storage objects. The added product and price are recorded as `sha256:6a4caf5aba0d` and `sha256:6fb5baecea00`. No Checkout session, webhook, portal configuration, deployment, live-mode object, real payment, Sound for Movement code, or Sound for Movement provider resource was touched.

Revision note, 2026-07-15: Under Michael's explicit Stage 6 approval for one immutable Vercel Preview, corrected the worker build context and converged both private services on a qualified shared runtime in commits `f83a7ff`, `9fd3944`, and `048fe05`. Candidate `build-week-hosted-candidate-20260715-161907` passed focused worker, service, documentation, type, format, and shared-container route checks; Vercel CLI `54.21.1` built the web service and both private Linux AMD64 images with Preview-only environment values. Vercel then listed both the default Preview attempt and a second explicit `--target preview` attempt as Production while Building. Each was removed immediately, no third attempt was made, and an exact-project read confirmed zero deployments, zero custom domains, and seven Preview-only environment variables. Hosted verification remains blocked on a Preview-classified deployment. No webhook, judge share, production alias, custom domain, Sound for Movement code, or Sound for Movement provider resource was changed, and no deployment URL remains available or was shared.

Revision note, 2026-07-15: Read-only Vercel project inspection and current official documentation established the cause of the Stage 6 contradiction: Vercel automatically promotes the first deployment in every newly created project to Production, and removing each contained attempt restored `hasDeployments: false`, causing the rule to repeat. The exact Services project is Git-unlinked, `live: false`, and has zero deployments and aliases, so production-branch automation was not involved. Commit `b8cb378` added a tested local-only generator for a disposable, `noindex`, no-application, no-secret Build Output bootstrap and updated the runbook with exact containment and removal rules. Executing that temporary Production-classified `--skip-domain` bootstrap remains a separate action-specific approval; no provider state changed during the investigation or preparation.

Revision note, 2026-07-15: Michael separately approved the guarded temporary bootstrap. CLI `54.21.1` deployed the disposable static artifact with `--prebuilt --prod --skip-domain`; it reached Ready, but Vercel still assigned two automatic `.vercel.app` Production aliases. This contradicted the approved no-domain contract, so the primary task removed the exact deployment before creating the application Preview and verified zero deployments, `live: false`, zero aliases, seven Preview-only environment values, and no custom, branch, custom-environment, or redirect domains. The original bootstrap contract is now blocked and must not be repeated. A revised contract must explicitly account for the temporary automatic aliases observed here and receive new action-specific approval.

Revision note, 2026-07-15: A follow-up read-only review of Vercel's official deploy and alias documentation and the exact pinned CLI `54.21.1` implementation established that `--skip-domain` sets `autoAssignCustomDomains: false`; it disables custom Production-domain auto-assignment and does not claim to suppress the immutable deployment URL or Vercel-managed automatic `.vercel.app` aliases. The bootstrap generator now adds `no-store`, CSP, framing, referrer, content-sniffing, permissions, and crawler-denial response headers; emits mode-`0600` files; and declares that platform-managed URLs are expected while custom domains remain forbidden. Tests verify the complete artifact, header map, manifest, modes, refusal, and confirmation behavior. This local preparation creates no provider state. Executing the revised contract remains a new action-specific approval gate.

Revision note, 2026-07-15: Ran the dedicated hosted Supabase Security and Performance Advisors read-only and recorded only safe counts and hashes. Forward migration `20260715231631_optimize_rls_advisor_policies.sql` resolves all 17 auth initialization-plan and 13 overlapping-policy warnings while retaining command-specific RLS authority. Clean local replay, zero-warning advisors, all affected database suites, and the complete isolated-port Node 24 aggregate passed at exact commit `f93af023daf41a59c86251b471219b9a6eed4afc`; immutable tag `build-week-hosted-candidate-20260715-175142` identifies that runtime. Applying the twelfth migration, changing leaked-password protection only when already entitled without an upgrade or billing change, and rerunning the hosted advisors remain separate approval-gated actions. If the Pro-or-higher feature is unavailable, the operator records that plan limitation instead of creating a paid resource.

Revision note, 2026-07-16: Under Michael's approval, repeated the exact isolated-project hash and one-file dry-run guards, applied only the reviewed twelfth policy migration, and verified exact 12/12 migration history plus clean linked `public` and `private` lint. The hosted advisor result fell from 31 warnings to one Auth-setting warning, proving all 30 database-policy optimizations are active. The guarded hosted check preserved the exact fixture fingerprint, four fictional accounts, four Stripe mappings, and six storage objects without session rotation. The CLI repeated its already-recorded non-fatal pg-delta certificate-cache warning, so completion relies on direct history, lint, advisor, and fixture evidence. Leaked-password protection remains unchanged until its existing no-cost entitlement is confirmed; no upgrade or billing change is authorized.

Revision note, 2026-07-15: Michael stopped the active long-running goal after a repeated Firefox startup path became unproductive. Firefox is not part of the supported browser contract. Chrome/Chromium and Safari/WebKit remain the supported matrix in local checks, CI, hosted proof, and judging documentation. The task terminated its Firefox and Docker-pull processes, preserved the existing repository server and all provider boundaries, and recorded the uncompleted external work in `docs/submission/remaining-work.md`. This stop is not a completion claim.

Revision note, 2026-07-15: Michael resumed the remaining Build Week work. Read-only Chrome inspection confirmed the isolated Build Week organization is on Supabase Free; official Supabase documentation places leaked-password protection on Pro and above. The existing bounded approval therefore resulted in a documented plan limitation with no Auth, plan, or billing change. A final hosted advisor rerun at `2026-07-16T00:35:35Z` matched `sha256:eb42bced1055` with zero errors, zero database-policy warnings, one accepted Auth warning, and 124 information items. The revised Vercel deployment remains a separate action-specific approval boundary.

Revision note, 2026-07-16: Reconciled the complete technical outcome at exact runtime `c56a9bd170237288bae8eb1852fe1b281063952d`: local immutable tag `build-week-hosted-candidate-20260715-221715`, Ready three-service Vercel deployment, final stable-alias Chromium/WebKit proof, empty error-level and HTTP 500 log review, and GitHub Actions run `29469961758` passing 16/16 jobs. This evidence-only closeout remains local so the verified deployment does not change. Only the explicitly deferred competition recording, sharing, publication, and submission actions remain.

Revision note, 2026-07-16: Michael's live first-clone review established that the fictional Daymark identity should demonstrate completion without speaking for a new artist. Commit `dbfc659` adds a development-only starter presentation whose literal labels occupy the real public composition, a one-command `starter:local` path, an explicit unchanged `demo:local` path, project-state-aware defaults, production refusal, documentation, and isolated desktop/mobile accessibility coverage. No Supabase data, provider state, deployment, or Sound for Movement resource changed.
