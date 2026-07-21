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
- [x] (2026-07-18 20:32Z) Recorded the Sound for Movement-derived visual foundation for the first React implementation, including Lato, semantic color values, both themes, layout, primitives, motion, imagery, language, and accessibility.
- [x] (2026-07-18 20:32Z) Defined the modular installation contract: music and access form the core, each artist activates the capabilities they need, and `Courses` is the public teaching-area name.
- [x] (2026-07-18 20:32Z) Verified the current official Sites storage guidance and Work mode data guidance, then recorded the D1, R2, local media, application runtime, and workspace data-control boundaries.
- [x] (2026-07-18 20:44Z) Verified the updated governing documents with `git diff --check`, a trailing-whitespace scan, required ExecPlan-section checks, all exact visual token values, current product naming, and required-file checks.
- [x] (2026-07-18 21:35Z) Refocused the governing product and implementation contracts on the application artists use and the durable state it owns.
- [x] (2026-07-18 21:35Z) Recorded artist ownership, the Sites-provided D1 and R2 service boundary, deliberate ChatGPT Work sharing, workspace-specific training controls, and the current Sites non-financial runtime scope.
- [x] (2026-07-18 21:40Z) Verified the reconciled documents with `git diff --check`, a trailing-whitespace scan, all twelve required ExecPlan sections, drift-phrase scans, and exact ownership, storage, model-request, and runtime-scope assertions.
- [x] (2026-07-18 23:13Z) Rechecked the current official OpenAI Sites documentation and installed Sites skills; recorded the generated React 19.2.6, Next 16.2.6, vinext 0.0.50, Vite 8.0.13, Wrangler 4.92.0, Drizzle 0.45.2, D1, R2, identity, version, and deployment contracts.
- [x] (2026-07-18 23:13Z) Created `codex/sites-rebuild` from clean authority commit `4c96148` and applied an exact reviewed 362-path replacement manifest while preserving the governing product, plan, architecture, provenance, license, notice, and ignore files.
- [x] (2026-07-18 23:13Z) Initialized the current official Sites starter exactly once in a clean temporary workspace and moved its complete React, TypeScript, vinext, Vite, Worker, Drizzle, D1, and R2 foundation into the repository.
- [x] (2026-07-18 23:13Z) Completed Milestone 0 with the exact visual tokens, pinned Lato, dark and light themes, open public shell, functional layouts, healthy local development server, production build, and desktop/mobile browser journey.
- [x] (2026-07-18 23:24Z) Removed the living mosaic direction and every generated temporary image and social-card asset at Michael's direction; the neutral installation now uses open left-aligned typographic headers and adds imagery only when an artist supplies approved material.
- [x] (2026-07-19 00:02Z) Completed Milestone 1: applied the inspected seven-table Drizzle migration to local D1; proved D1 and R2 state across a server restart; exercised optional and required Sign in with ChatGPT helpers; resolved fictional customer, editor, and owner roles from D1; enforced central server access; and returned exact `200`, `206`, `403`, `404`, and `416` media responses through bound R2.
- [x] (2026-07-19 00:02Z) Added the repeatable runtime gate and verified strict types, lint, formatting, the five-stage production build, production simulation-off configuration, ten client bundles with no server-only values, two foundation checks, 45 runtime checks, an empty migration queue, and a complete restart journey that retained zero R2 verification objects.
- [x] (2026-07-19 01:42Z) Completed Milestone 2 with versioned artist and page publication, dependency-safe module activation, paired navigation publication, explicit owner bootstrap, scoped editor drafting, owner-only structural publication, customer profiles, and working public, account, setup, and administration shells.
- [x] (2026-07-19 01:42Z) Verified the repaired six-migration chain, 18-table schema, transaction-bound role checks and operation receipts, 79 focused runtime checks, 21 static schema checks, the five-stage production build, exact local D1 repair, the complete stream-only HTTP journey, and desktop/mobile DOM behavior in both themes with zero retained D1 test rows, zero R2 objects, zero temporary files, zero imagery, zero overflow, and no browser errors.
- [x] (2026-07-19 03:09Z) Completed Milestone 3 implementation with immutable catalog revisions for tracks, releases, collections, credits, and media metadata; scoped administration and owner publication; public music routes; authorized range delivery; one root-persistent accessible player; and the meaningful-listen boundary.
- [x] (2026-07-19 03:09Z) Verified the 30-table, ten-migration D1 schema; 25 catalog, delivery, and player checks; 16 schema and interface checks; seven structured-page boundary checks; strict types, lint, formatting, the five-stage production build, and packaged runtime integrity. Desktop and mobile DOM checks passed in both themes with no overflow or browser errors. The repository contains no image, audio, or video files, and real audible playback remains pending until artist-approved audio is supplied.
- [x] (2026-07-19 04:12Z) Completed Milestone 4 with explicit customer activation, customer profiles, track and release favorites, ordered playlists, frozen listening history, server-backed resume, live access explanations, retained grant and entitlement history, protected streaming and downloads, and successful-delivery history.
- [x] (2026-07-19 04:12Z) Verified the 37-table, fourteen-migration schema and empty local migration queue; 30 customer, access, delivery, schema, and player checks; 13 API and interface checks; strict types, lint, repository formatting, the five-stage production build, and packaged runtime integrity. A no-screenshot local HTTP journey returned the public Site, signed-in activation UI, and server-denied inactive customer library exactly as expected. No image tool, screenshot, asset file, or R2 write was used.
- [x] (2026-07-19 04:36Z) Rechecked current official Sites limits and Stripe test-environment guidance, then incorporated Michael's Build Week commerce direction: one complete commerce domain, a permanently test-locked Sites adapter, Stripe-hosted Test Checkout, signed test webhooks, hard live-credential and `livemode` rejection, visible Test Mode state, no card fields in `a-op`, and corrected Sites residency language.
- [x] (2026-07-19 05:12Z) Completed Milestone 5 with immutable access-plan definitions, exact atomic issuance, idempotent grant replay, owner revocation and expiry, live entitlement and delivery administration, core customer Access history, identity-aware protected catalog views, and server-projected stream and download controls.
- [x] (2026-07-19 05:12Z) Verified the 40-table, fifteen-migration schema and empty local migration queue; 27 access, entitlement, catalog, and delivery checks; 18 API, interface, and laboratory checks; strict types, lint, repository formatting, the five-stage production build, and packaged runtime integrity. The HTTP journey proved `401` anonymous and `403` non-owner administration, exact plan, issuance, and revocation replay, protected track `404 -> 200 -> 404`, retained customer history, a production-off laboratory, exact D1 baseline restoration, zero retained rows, zero R2 writes, and zero temporary files.
- [x] (2026-07-19 08:44Z) Completed Milestone 6 with one permanently test-locked commerce domain: hosted Stripe Test Checkout, raw-byte signed webhooks, one-time and recurring orders, memberships, subscriptions, renewal and cancellation history, download and license credit ledgers, exact-revision download redemption, exclusive license acquisition, issued licenses, deterministic protected license documents, customer results, administration evidence, and central protected delivery.
- [x] (2026-07-19 08:44Z) Verified Milestone 6 with 129 domain and integration checks, 70 static contracts, 22 final integrity and delivery checks, 17 focused schema-chain checks, strict types, lint, the five-stage production build, packaged 83-table and 23-migration integrity, and a real signed-webhook HTTP journey. Independent re-audit found no remaining critical or high-severity issue. The journey proved awaited recurring invoices, exactly-once fulfillment, replay idempotency, pre-write live-event and invalid-signature rejection, post-entitlement protected access, visible customer and operator evidence, exact D1 and module restoration, zero R2 objects, zero media rows, and zero temporary files.
- [x] (2026-07-19 09:34Z) Completed Milestone 7 across the schema-version 13, 86-table, 26-migration D1 foundation: Courses and resume, access-protected lesson delivery, video and transcripts, consent-gated external embeds, editorial publishing, reusable structured sections, composed pages, What's New and customer-private commerce links, contact consent, public booking and contact details, stored inquiries, status, and notes.
- [x] (2026-07-19 08:44Z) Closed the final Milestone 6 audit findings: every download-credit consumption and activation statement now repeats the exact published, protected, delivery-ready pinned-revision guard, and every license-credit balance, reservation, lot, allocation, ledger, and audit statement repeats the exclusive acquisition guard. Injected withdrawal and competing-checkout races leave access and losing credit state unchanged.
- [x] (2026-07-19 09:34Z) Verified Milestone 7 with 39 functional and integration checks, 26 static and schema checks, strict type checking, full lint, repository formatting, the five-stage production build, packaged 86-table and 26-migration integrity, local migration application, schema version 13, preserved contact consent and inquiry records, and a clean `PRAGMA foreign_key_check`. No media, image, screenshot, generated asset, temporary asset, or R2 write was used.
- [x] (2026-07-19 10:45Z) Completed Milestone 8 across the schema-version 15, 93-table, 29-migration D1 foundation: exact consent-aware browser and server telemetry, preserved day-level distinct totals, retention, legal drafting and immutable approval/publication history, exact-version legal pointers, count-only health, real operational-failure capture, customer administration, access explanation, job retry, and provider/card-safe diagnostic redaction.
- [x] (2026-07-19 10:45Z) Verified Milestone 8 with 27 focused unit and integration checks, 25 static/schema/laboratory checks, strict type checking, full lint, repository formatting, the five-stage production build, packaged 93-table and 29-migration integrity, both corrective migrations applied through local Wrangler, schema version 15, zero foreign-key violations, and the asset-free HTTP journey. The journey proved immediate consent behavior, one source event, owner aggregates, legal replay and publication, visible redacted failure evidence, production-off isolation, exact baseline restoration, zero retained rows, zero R2 objects, zero media bytes, and zero temporary files.
- [x] (2026-07-19 12:45Z) Completed Milestone 9 with the fourteen-topic ChatGPT Work setup contract, exact preview and approval, pre-write media resolution, deterministic local media profiles, approval-gated R2 publication, provider-neutral export, checksum verification, real-schema in-memory restore rehearsal, diagnosis, and maintenance surfaces.
- [x] (2026-07-19 12:48Z) Completed the local Milestone 10 integration and hardening gate across all ten story families, production build, 99-table and 33-migration schema version 19, security headers, performance budgets, recovery, Stripe Test Mode fulfillment, replay, rejection, protected access, visible evidence, and exact cleanup.
- [x] (2026-07-19 12:52Z) Re-audited every Stripe Test Mode recommendation. Eighty-two focused checks passed with no missing implementation requirement. A real Stripe-hosted Test Checkout and actual provider webhook rehearsal remains an approval-gated external acceptance exercise, alongside approved Sites hosting.
- [x] (2026-07-19 16:09Z) Simplified the public home at Michael's direction to the active functional navigation and footer. Removed all home narrative sections, ownership and Sites/ChatGPT explanatory copy, and the repository link; moved the existing audience privacy control and icon-only sun/moon theme switch into the footer. Verified strict types, 22 focused interface/security/telemetry checks, lint with three unchanged warnings and zero errors, the complete five-stage production build, and the running dark and light homepage in the in-app Browser.
- [x] (2026-07-19 16:09Z) Removed the theme toggle's enclosing border and recorded the shared visual-direction rule that standalone controls live in open space unless a boundary communicates a field, selection, state, group, or function.
- [x] (2026-07-19 18:20Z) Applied the responsive public header contract: desktop navigation remains horizontal, compact widths use a borderless accent-orange hamburger that transforms into an X, and the full navigation opens below the header with link, backdrop, Escape, and keyboard-loop closing behavior.
- [x] (2026-07-19 18:30Z) Corrected the compact navigation containing block after live browser review so the open panel uses the full header width rather than the menu-control width; added a regression contract for the anchoring rule.
- [x] (2026-07-19 18:32Z) Removed audience-measurement consent from the default public footer and simplified the footer to information links plus the theme control. Telemetry remains an optional capability for artists who activate broader first-party measurement; meaningful music-play tracking remains available through the music system.
- [x] (2026-07-19 18:41Z) Rebuilt the public footer as the approved broad functional directory: Explore, Membership, Learn, and Support groups use the published primary navigation; artist-supplied external and social links appear in Connect; legal links, artist copyright, and the theme control form the utility row. The layout reflows to two columns on compact screens without adding cards or placeholder links.
- [x] (2026-07-19 19:00Z) Separated the public header into left brand, centered primary navigation, and right Account action; kept ChatGPT sign-in behind Account; restored the shared header and footer around signed-in account pages; added registered-name account identity, owner/editor-only Admin Dashboard access, live library, credit, and license totals, and open account-area rows; and removed What's New from this iteration's customer account navigation.
- [x] (2026-07-19 19:12Z) Resumed and verified the integrated navigation milestone. Strict types and thirteen focused foundation, responsive-menu, account-role, route-alignment, and commerce-interface checks passed; lint completed with three unchanged warnings and zero errors; and the complete five-stage production build passed with fictional Stripe Test Mode verification values. The local development server remained available at `http://localhost:3001/` for live review.
- [x] (2026-07-19 19:18Z) Made the real customer Account overview directly reviewable through the standard local development server with a fictional customer identity. The fallback is explicitly development-only and flag-gated, preserves an anonymous local command, creates no application-owned authentication route, and leaves hosted Sign in with ChatGPT identity and D1 authorization authoritative. Strict types, sixteen focused identity/interface/route checks, formatting, the complete five-stage production build, and the packaged runtime boundary passed; the production artifact kept simulation off and exposed zero server-only values across 96 client files. Live browser review confirmed `/account`, the fictional customer heading, customer metrics and areas, and the local-safe Return home action.
- [x] (2026-07-19 19:40Z) Rebuilt Account as one personal page from Michael's direct Sound for Movement reference: `Hello [name]`, owner/editor-only Dashboard, compact live totals, Orders, Credits, and Profile in the page flow. Removed the account eyebrow, secondary account navigation, Access link, local Return home action, and the repeated Stripe Test Mode notice component from customer and administration pages. The profile save now refreshes the greeting immediately while Sites identity and D1 authorization remain server-owned. Strict types, 42 focused account/commerce/access/credit/licensing/membership/setup interface checks, targeted formatting, and the complete five-stage production build passed. Live browser review confirmed the one-page structure, zero account sub-navigation, zero repeated Test Mode notices, and the first-save transition to `Hello Michael`.
- [x] (2026-07-19 19:53Z) Applied Michael's text-color and account-density corrections: every word, link, label, and text status now uses neutral ink rather than accent orange, while orange remains available for non-text interaction cues and filled actions. Removed the second Credits section from Account so the credit balance appears once in the top summary.
- [x] (2026-07-19 19:58Z) Placed What's New directly inside the single Account page beside the customer summary when the capability is active. The compact view shows unread state and the newest published update with links to read it or view the complete feed, without adding account tabs or subpage navigation. Strict types, the focused account interface contract, formatting, diff integrity, and the complete five-stage production build passed.
- [x] (2026-07-19 20:04Z) Simplified the public shell at Michael's direction: About, Contact, and What's New remain available through the footer but no longer appear in the primary header navigation; the header divider is gone; the footer course group is named Courses; and public functional pages begin with their content rather than the oversized legacy title banner. What's New keeps its established product name. Strict types, 23 focused foundation, navigation, route, and module checks, formatting, diff integrity, the complete five-stage production build, and the running local What's New response passed.
- [x] (2026-07-19 20:14Z) Replaced Orders on the personal Account page with collapsible Downloads and Licenses collections. The summary now reports download credits, license credits, entitled downloadable tracks, and issued licenses once each. Download actions use the current server-projected protected track URL; license PDF actions appear only for ready documents attached to active issued licenses and use the protected document-delivery route. Strict types, 24 focused account/access/licensing interface and integration checks, formatting, diff integrity, and the complete five-stage production build passed.
- [x] (2026-07-19 20:25Z) Rebuilt Music as the Sound for Movement-derived library workspace while preserving the neutral installation and real Sites data boundaries. The complete sidebar, search, type, tag, sort, catalog views, favorites, playlists, listening history, compact rows, streaming, track-product, licensing-offer, favorite, and playlist actions now exist before music is added. An empty installation keeps the working interface visible and shows no fictional catalog records or placeholder media. Strict types, 19 focused interface checks, nine catalog/customer-library/commerce/licensing integration journeys, formatting, diff integrity, the complete five-stage production build, and the running local Music response passed.
- [x] (2026-07-19 20:31Z) Added a keyboard-operable Music Library sidebar disclosure on desktop and responsive layouts. Closing it reduces the desktop sidebar to a compact control rail and expands the catalog into the available width. Simplified the local Milestone 9 track fixture and the existing local preview record to the generic title `Track`, with no runtime subtitle; hosted data remains unchanged. Eleven focused Music and Milestone 9 contract checks, strict types, the complete five-stage production build, and the running local Music response passed.
- [x] (2026-07-19 20:37Z) Reorganized the Music Library controls around the working hierarchy: the open-sidebar control now sits at the sidebar's upper right; Search, Type, and Tag remain in the sidebar and apply directly; Apply and Clear controls are gone; and Sort sits above the live result count at the catalog's upper right. Reduced the page and section heading scale to restore the intended typography hierarchy. Four focused Music interface checks, strict types, the complete five-stage production build, and the running local Music response passed.
- [x] (2026-07-19 20:56Z) Completed the neutral Music Library views and durable musical metadata path. The open sidebar now distinguishes small section labels from larger library actions, anchors real customer playlists and listening history at the bottom, and provides automatically applying Search, Meter, Tempo, Key, and Duration disclosures. Explore, Tracks, Collections, Albums, and Favorites now render distinct real-data views and honest empty states, including the future Favorite Albums, Favorite Collections, and Favorite Tracks groups. Track revisions store meter, tempo, musical key, and duration; the public index, filtering, administration editor, portable export and restore path carry those values. Empty duration displays as `0:00`; every other missing metadata value remains blank. No fictional catalog, playlist, history, artwork, or metadata was added. The inspected 34th migration applied to local D1; strict types, 44 focused catalog, customer-library, Music, schema, and portability checks, lint with zero errors and three existing setup warnings, diff integrity, the complete five-stage production build, and HTTP `200` responses for all five running Music views passed.
- [x] (2026-07-19 21:05Z) Refined the Music Library to the established visual system. Removed library navigation icons, rounded search treatment, redundant nested Meter and Key labels, empty playlist and listening-history sentences, and unavailable-stream copy. Reduced Tempo and Duration inputs, left empty filter disclosures empty until metadata exists, and consolidated each desktop track into one horizontal row with an always-present empty artwork position, title, adjacent duration, compact metadata, available playback, and actions. Strict types, eleven focused Music, catalog, and customer-library checks, diff integrity, and the running local Music response passed.
- [x] (2026-07-19 21:17Z) Added the empty-catalog track and player interaction preview without durable fictional music. Tracks now shows exactly five interface-only rows and one Tempo, Meter, and Key header; each empty artwork position reveals Play on hover or focus, opens the actual root-persistent player with a five-item zero-duration queue, and keeps audio controls inactive until a real stream exists. Each Track name uses client navigation to a neutral detail page with Track, Artist / Album, Favorite, Download, Add to Playlist, License Track, and Buy Track. The player now includes a compact artwork position and remains visible across the detail transition. Strict types, fourteen focused Music and player checks, diff integrity, and a real in-app browser journey verified five rows, the `5 tracks` count, player reveal, five-item queue, detail navigation, all five actions, and player persistence.
- [x] (2026-07-19 21:20Z) Restored the complete action set to every empty-catalog preview row after the player interaction pass. Each row now keeps Download, Buy Track, License Track, Favorite, and Add to Playlist visible, while the artwork hover and focus control and the detail-page artwork control use a play triangle instead of the word Play. Fourteen focused Music and player checks, strict types, diff integrity, a production build, and a fresh in-app browser inspection verified all five actions on all five rows and the accessible triangle controls.
- [x] (2026-07-19 21:39Z) Completed the Music Library tablet and phone layout. The desktop sidebar is absent below 1100px; its eight essential destinations and tools become a single tablet row and a four-by-two phone grid. Search and Filters open the existing automatically applying controls without recreating sidebar chrome. Phone track rows keep artwork, identity, Buy Track, and a compact overflow control on one line, with Download, License Track, Favorite, and Add to Playlist retained inside that menu. Fourteen focused Music and player checks, strict types, diff integrity, a production build, and live 818px and 391px browser inspections verified the sidebar absence, exact navigation grids, working focused Search panel, compact action menu, and zero horizontal page overflow.
- [x] (2026-07-19 21:54Z) Completed the responsive Track action workflow. Track rows now remain one line at every width and shed Tempo, Meter, and Key before wrapping. Favorite is an accessible heart that fills with accent orange and uses the existing server-owned desired-state favorite write for published tracks. Add to Playlist opens the track chooser, performs revision-checked replacement for an existing playlist, or advances to Create New Playlist and creates it with the selected track through the existing idempotent D1 API. Phone overflow now opens a true modal action sheet containing View Track, favorite, download, purchase, license, and playlist actions. Nineteen focused Music, favorite, playlist, API, and D1 integration checks, strict types, diff integrity, a production build, and live browser journeys verified the single row, responsive metadata removal, orange pressed heart, playlist chooser and create form, and complete phone action sheet. Interface-only preview rows exercise UI state without creating fictional catalog records; durable writes require a published track.
- [x] (2026-07-19 21:58Z) Replaced the text heart glyph with one shared slender, rounded outline matching Michael's visual reference across Music track actions and compact account favorites. The pressed state retains the same shape and fills with accent orange. Eleven focused Music and customer-library interface checks, strict types, formatting, diff integrity, and the complete five-stage production build passed.
- [x] (2026-07-19 22:00Z) Replaced the desktop Track row's Download text button with a slender download-arrow link directly beside the approved heart icon. The control retains a track-specific accessible label and the complete phone action sheet keeps its explicit Download label. Eleven focused Music and customer-library interface checks, strict types, formatting, diff integrity, and the complete five-stage production build passed.
- [x] (2026-07-19 22:15Z) Added three blank Album and two blank Collection interface previews to the empty Music Library. Every preview card opens a neutral detail surface that reuses the exact five-row Track preview without creating catalog records or media. Sort and the live result count now share one line, Track rows expose a quiet hover and focus-within state, and the persistent player now uses labeled thin-line previous, play or pause, next, repeat, queue, volume, and close controls. Twenty-six focused Music, player, customer-library, and route checks, strict types, and the complete five-stage production build passed.
- [x] (2026-07-19 22:20Z) Simplified the Track download control to one slender downward arrow with no tray, added a restrained one-pixel hover lift to catalog items and compact actions, and corrected Track responsiveness against the actual Music content width. Tempo, Meter, and Key now occupy one bounded metadata column and disappear together before the row actions crowd them, including when the desktop sidebar changes the available workspace width. Ten focused Music and customer-library interface checks, strict types, diff integrity, and the complete five-stage production build passed.
- [x] (2026-07-19 22:37Z) Built the empty-installation Courses experience from Michael's Sound for Movement reference. Two interface-only Course paths each expose ten generic Posts, `0 of 10 completed`, a keyboard-operable horizontal filmstrip, current Post position, and public or membership access states. Three generic Category links filter the Post collection through shareable URLs. The preview creates no Course, Post, category, progress, or media records; published Courses continue through the existing D1, central-access, protected-delivery, completion, and resume contracts. Fourteen focused Course UI, validation, D1, access, range-delivery, and progress checks, strict types, the complete five-stage production build, and HTTP `200` responses for the index, category, Course, public Post, and membership Post routes passed.
- [x] (2026-07-19 22:45Z) Built the empty-installation Videos viewing room from Michael's Sound for Movement reference. One interface-only video stage and four blank selectable playlist items use only the requested generic labels; query-backed selection updates Now Playing, and an accessible local play or pause control demonstrates the player without requesting media. The preview creates no video, media, history, telemetry, D1, or R2 records. Published video automatically replaces it and continues through the existing protected hosted-delivery or consent-gated external-player contract. Twenty-one focused Video UI, validation, D1, publication, revision, transcript, delivery, access, and updates checks, strict types, the complete five-stage production build, and HTTP `200` responses for the index and selected blank Video routes passed.
- [x] (2026-07-19 23:01Z) Rebuilt the public Licensing page from Michael's Sound for Movement reference without copying prices or content. The empty installation now shows three One-Time Licenses, two Licensing Subscriptions, three Education Plans, generic Price and Benefit labels, a complete Custom Licensing form surface, and five native keyboard-operable FAQ disclosures. Published offers and recurring products replace their matching previews and retain the existing exact-terms, intended-use, authority, Stripe Test, credit, issuance, document, entitlement, and history contracts. The inquiry form switches to the existing stored-only, idempotent, consent-versioned Contact backend after the artist publishes a form; until then the complete preview remains visibly disabled and creates no record. Fifty-two focused Licensing, license-credit, document-delivery, provider, Contact, membership, and commerce checks, strict types, focused lint, diff integrity, the complete five-stage production build, and an HTTP `200` response for `/licensing` passed.
- [x] (2026-07-19 23:15Z) Added the dedicated public Membership page and aligned the active public navigation with `/membership`. The empty installation shows the requested compact `Membership` and `Price` plan summary beside an image-free linked benefit composition; a published membership or subscription product replaces the preview with its real name, description, cadence, and test price. Manage membership, Licensing, Courses, Music, Download credits, Playlists, and Favorites all resolve to their existing working destinations without creating a fictional relationship. Nineteen focused membership, navigation, and route checks, strict types, focused lint, formatting, diff integrity, and the complete five-stage production build passed. Live in-app browser review verified all seven destinations, the desktop layout, the single-column compact breakpoint, and zero horizontal overflow. Computer Use could not launch its task-owned browser because the workspace preflight reported no active macOS display geometry, so the existing in-app browser performed the bounded visual and route verification.
- [x] (2026-07-19 23:35Z) Built the owner Dashboard over the existing administration domains. The persistent rail now uses direct operator language for Dashboard, Entitlements, Inquiries, Courses, Videos, What's New, and Metrics; excludes Mailing list, Content Creator, and History; and marks the current nested workspace automatically. The Dashboard reads server-owned D1 totals for subscriptions, licenses, track orders, downloads, customers, catalog state, inquiries, and publishing queues, composes existing consent-aware telemetry, and provides range-aware Today, Past week, Past month, Year to date, and All time views. Focused D1, route, registry, and interface checks, strict types, lint with three unchanged warnings and zero errors, diff integrity, and the complete five-stage production build passed. Task-owned headless Chrome verified the owner Dashboard and requested destinations at 1440px and 390px with zero horizontal overflow and zero excluded tools; Computer Use remained unavailable because the required workspace preflight found no active display geometry.
- [x] (2026-07-20 01:29Z) Named the role-scoped Account action `Admin Dashboard` and retained its direct `/admin` destination at the upper right of the greeting. Only a live owner or editor receives the action; customer-only accounts remain personal account surfaces without administration access. Granted the current local Michael preview record owner authority in local D1 while preserving its customer role and account data. The focused Account interface contract, strict types, targeted formatting, diff integrity, complete five-stage production build, local role readback, and running Account response passed; the rendered page contains `Hello Michael` and the `/admin` action.
- [x] (2026-07-20 02:31Z) Completed the public support and player pass: added dedicated About and Login routes, placed Log in beside Account, kept Contact visible with its real published consent-backed form or an honest setup state, supplied substantial editable Privacy and Terms starters that never self-publish, added route-aware orange primary-navigation markers, and added persistent player shuffle. Strict types, 33 focused player, Music, public-support, legal, contact, route, and shell checks, focused lint with zero errors, and the complete five-stage production build passed. Computer Use verified the rendered Music underline, five-row player preview, accessible Shuffle off-to-on transition, current Login route, About page, Contact setup state, and legal starter. The existing port-3001 process was preserved; the current route manifest was verified through an isolated local preview on port 3101.
- [x] (2026-07-20 02:57Z) Reduced the visible administration area to the operator surfaces Michael requested: Metrics, Inquiries, Courses, What's New, Videos, and Entitlements. Metrics is now the `/admin` home and contains only range-aware activity and consent-aware website reporting. Removed the visible View site, Sign out, theme, revision status, workspace shortcut, Music editor, customer editor, membership, licensing, commerce, credits, page composition, legal, setup, operations, artist/module, and editor destinations. Their durable records, repositories, authority checks, and setup contracts remain intact for application behavior and ChatGPT Work operations. Strict types and 28 focused navigation, dashboard, access, commerce, credit, membership, and route checks passed.
- [x] (2026-07-21 retired) Retired the Sound for Movement judge-content packet, its private content builder and verifier, its local audio server, its documentation, and the public preview paths after the functional rehearsal completed. The neutral installation now receives all artist material through the general setup and media-publication contracts.
- [ ] (2026-07-20 release audit) Completed the read-only repository and release-boundary audit and rewrote `README.md` around the actual public, customer, administration, setup, and current-release surfaces. Type checking, formatting, the production build with fictional test credentials, and the production dependency audit passed. The final complete source test sweep passed 609 of 632 checks. The media-size and external Stripe acceptance blockers are resolved. Release remains open for the neutral one-shot installer exercise and the later test-contract audit Michael requested.
- [x] (2026-07-20 release cleanup) Removed about 1.68 GB of generated local output, including the production bundle that had copied ignored judge media. Removed the obsolete Sites replacement manifest, the unused D1 notes example, one stale architecture-decision index, nine unused barrel or static-navigation modules, and their stale formatter exclusions. Kept D1 migration metadata, local Wrangler state, approved source/import material, setup proposals and local configuration, the active ExecPlan, the restore loader, runtime laboratories, milestone verifiers, judge rehearsal tooling, and the current vinext configuration. Strict types, formatting, lint with zero errors and 16 review warnings, and ten source-focused route, delivery, and media-publication checks passed. The two selected foundation checks require a built `dist/` and therefore reported missing-artifact errors after the intentional generated-output removal; no production build was recreated during cleanup.
- [x] (2026-07-20 Stripe binding pass) Added the missing owner-only operation that binds a pending setup membership or subscription to one Stripe Test price, activates the exact linked plan, creates the active application product and immutable price, and marks the setup intent bound in one D1 transaction. Added the `Connect setup products` administration surface and allowed HTTP loopback return URLs only in local development. Created one matching $10 monthly product and price in the authenticated Stripe test environment without creating a customer, Checkout Session, payment method, subscription, charge, order, or entitlement. The fictional customer preview correctly received `403` from the owner route, so local D1 remains pending until an authenticated owner performs the connection. Strict types, 25 focused commerce checks, formatting, and the complete five-stage production build without configured Stripe credentials passed.
- [x] (2026-07-21 05:13Z) Completed the approved external Stripe Test acceptance rehearsal. Owner binding now covers membership, subscription, and exact track-license intents. A real hosted subscription checkout and provider-signed current-version invoice created one fulfilled order, active subscription and membership, two Course entitlements, and 15 download credits. A real hosted one-time license checkout advanced an approved request to issued, created its fulfilled order and issued license, granted track and document entitlements, and queued deterministic document generation. The application accepted only `livemode = false` provider facts and stored no card data.
- [x] (2026-07-21 05:18Z) Updated the Stripe adapter for the current `hosted_page` Checkout value and 2026-06-24 invoice shape, including paid-state derivation from terminal status plus zero remaining amount and exact subscription period projection from the non-proration subscription line. Fixed provider delivery ordering when a paid invoice reaches D1 before `checkout.session.completed`; the delayed checkout event now records an idempotent already-fulfilled receipt. Strict types and 22 focused Stripe projection and recurring-fulfillment checks passed.
- [x] (2026-07-21 cleanup) Removed the completed rehearsal's 957 MB local Wrangler D1/R2 state, 3.1 GB Sound for Movement import and public judge-media trees, demo setup proposals and local aliases, hosted fictional account file, stale Nuxt environment files, and generated TypeScript cache. Removed the artist-specific packet builder, verifier, audio server, documentation, package commands, hard-coded licensing artwork, and artist-name fallbacks. Archived the two task-created Stripe Test products and prices, canceled the two task-created Test subscriptions, deleted their two fictional Test customers, and removed the temporary checkout, binding, and listener files. Strict types, 29 focused commerce and licensing checks, diff integrity, and the complete five-stage neutral production build passed. The generated build and local cache were removed afterward. No production, Sites hosting, domain, DNS, or live-commerce action occurred.
- [x] Implement Courses, lessons, mixed media, access, progress, and resume.
- [x] Implement video, structured pages, What's New, contact, and inquiry administration.
- [x] Implement telemetry, consent, retention, privacy, terms, diagnostics, and operations.
- [x] Implement ChatGPT Work setup, personalization, media preparation, export, restore rehearsal, diagnosis, and maintenance.
- [x] Complete responsive, keyboard, accessibility, performance, security, and recovery verification across the integrated application.
- [ ] Save a Sites version from the exact validated source.
- [ ] After Michael approves the specific hosting action, deploy the complete Site at the approved access level and verify the working hosted product.

## Surprises & Discoveries

- Observation: Vite copies ignored files under `public/` into the Sites artifact.
  Evidence: The retired local rehearsal previously produced a 1.6 GB client artifact. Removing the public rehearsal tree before the final build returned the neutral production artifact to 18 MB total output with no artist media.

- Observation: Hidden verification infrastructure is active release infrastructure, while several top-level re-export files and the replacement manifest had no consumers.
  Evidence: Package scripts and the Milestone 10 integration gate invoke the runtime laboratories and milestone verifiers, and the portability restore path loads `lib/portability/node-alias-loader.mjs`. Repository-wide import and text searches found no consumers for the removed barrel modules, static `lib/navigation.ts`, D1 notes example, or replacement manifest.

- Observation: The new setup proposal can store page-hero choices while the public pages do not read them.
  Evidence: `db/page-presentation.ts`, the protected hero delivery route, and `PageHero` exist, but Courses, Videos, Membership, and Licensing pass `hero={null}` and prefer the catalog mosaic. The local proposal builder also clears `pageHeroes`. An approved one-shot proposal therefore cannot produce its requested public hero result.

- Observation: The current one-shot local installer is implementation work without an end-to-end contract.
  Evidence: `scripts/build-local-installer-proposal.mjs` and `scripts/install-local-site.mjs` have no focused test or documented invocation. The proposal builder reads `editorial-presentation.json` without applying the value, and a clean owner-bootstrap-to-install journey has not run.

- Observation: The release proof suite describes the previous interface and setup shape.
  Evidence: The final direct source sweep passed 609 of 632 checks. Failures include the former dashboard navigation, 34-migration and operation-count assertions, asset-free public pages, page-hero wiring, and older consent-component source patterns. The production source compiles, but the branch is not an exact validated candidate until intentional changes and their contracts agree.

- Observation: The neutral one-shot setup exercise still needs to confirm Posts, What's New, About, and public hero media alongside catalog, Courses, and Videos.
  Evidence: The packet manifest can prepare all approved content locally, but those remaining content families do not yet share the same preview, approval, and durable publication path as catalog, Course, and Video records.

- Observation: The requested administration capabilities already existed as durable, authorized workspaces and needed one operational front door rather than a second set of editors.
  Evidence: Contact inquiries, Course sections and lessons, What's New publication, Video publication, entitlements, customers, catalog state, commerce, and telemetry already resolve through owner or scoped-editor D1 repositories and mutation APIs. The new Dashboard composes their server-owned counts and routes without duplicating records, editors, or authority.

- Observation: Computer Use can be correctly available while its display-aware workspace cannot safely launch a new verification window.
  Evidence: Computer Use rejected the Codex application as a protected target, and the required task-owned Chrome preflight returned `No active displays were found`. The existing in-app browser remained available and completed the same local visual, destination, and responsive checks without creating or moving a desktop window.

- Observation: A public licensing inquiry cannot become active before the artist publishes exact consent text.
  Evidence: The fresh installation has no public Contact form or consent version. Licensing therefore renders the complete disabled form surface without inventing legal text; once configured, the same position uses the existing idempotent stored-only inquiry writer and freezes the accepted consent version with the submission.

- Observation: The empty video interface can demonstrate selection and player behavior without pretending that a media source exists.
  Evidence: The blank player keeps play or pause entirely in local interface state, makes no media or telemetry request, and creates no durable record. The first published D1 video replaces the preview automatically and returns to the real hosted or external playback contract.

- Observation: Importing the identity type now reaches the Cloudflare Worker environment while Node runs D1 integration tests.
  Evidence: The local account preview made `app/chatgpt-auth.ts` read `cloudflare:workers`; Node 25 rejected that scheme until the existing TypeScript test loader mapped it to an immutable empty test environment. The Course D1, access, range-delivery, and progress suites then passed unchanged.

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

- Observation: The current Sites runtime cannot process payment-card data or enable financial transactions.
  Evidence: Current official Sites guidance defines that boundary. The Build Week installation carries the complete commerce domain through a Stripe Test Mode simulation that accepts no real payment and moves no money; `docs/architecture/commerce-environment.md` locks the Sites adapter against live operation.

- Observation: Stripe Test Mode exercises commerce state without creating a financial transaction.
  Evidence: Current Stripe documentation states that test keys create simulated objects, accept no real payment methods, make no real charges, and move no money. Current Sites guidance still prohibits payment-card processing and financial transactions and does not state a Test Mode exception. The Build Week boundary therefore keeps all payment entry on Stripe's hosted test surface, describes the journey as a simulation, and hard-locks the Sites application against live credentials and live events.

- Observation: The Sites service boundary is not a geographic residency guarantee.
  Evidence: Current official Sites guidance states that Sites does not support data residency or inference residency at launch and applies that statement to deployed Sites, Site code, D1 and R2 data and file storage, generated artifacts, and logs.

- Observation: The 2026-07-18 initializer pins a newer Sites toolchain than the planning snapshot named generically.
  Evidence: The generated application uses React 19.2.6, Next 16.2.6, vinext 0.0.50, Vite 8.0.13, Wrangler 4.92.0, Drizzle ORM 0.45.2, and the Cloudflare Vite plugin 1.37.1. The copied starter lockfile was regenerated after adding only Lato, Prettier, and Wrangler-compatible Worker declarations required by the foundation.

- Observation: The official starter compiles without a checked-in Worker declaration environment, while repository-wide strict type checking needs one.
  Evidence: The first `tsc --noEmit` could not resolve `cloudflare:workers`, `D1Database`, `R2Bucket`, or `Fetcher`. Pinning `@cloudflare/workers-types` 4.20260702.1, the version compatible with Wrangler 4.92.0, and declaring the logical bindings in `worker-configuration.d.ts` made the complete typecheck pass.

- Observation: Ignored Nuxt build artifacts correctly survived the tracked-tree replacement and initially entered the new ESLint traversal.
  Evidence: The first lint run reported only files under ignored `.nuxt` and `.output` plus one new component issue. Explicit generated-directory ignores and a `useSyncExternalStore` theme implementation made the final lint run pass without findings.

- Observation: Vite's inline Cloudflare binding configuration and the Wrangler migration CLI otherwise create separate local views of D1 and R2.
  Evidence: The installed Cloudflare Vite plugin accepts a checked-in `configPath` and an explicit persistence path. `wrangler.local.jsonc`, Vite development, and local migration commands now share `.wrangler/state/v3`, the same logical binding names, D1 identifier, and R2 bucket name while `.openai/hosting.json` remains unchanged.

- Observation: D1 `batch()` is the transaction primitive for the Worker runtime.
  Evidence: The installed D1 driver executes manual `BEGIN`, application queries, and `COMMIT` as separate calls, while `D1Database.batch()` commits the prepared statements atomically. The M1 helper rejects empty work and keeps exactly one SQL statement in each prepared item.

- Observation: Once application routes import `cloudflare:workers`, the built Worker should be exercised in the Cloudflare-compatible local runtime rather than imported through Node's default ESM loader.
  Evidence: Node rejects the `cloudflare:` module scheme. The runtime verifier now starts the actual vinext and Cloudflare development Worker on one strict port, owns and stops only that child process, and exercises the observable HTTP journey there.

- Observation: Generated SQLite parent-table rebuilds can erase child records when foreign-key enforcement resumes between related rebuilds.
  Evidence: The first M2 migration chain rebuilt `navigation_sets` and `pages` after foreign keys had been restored, which cascaded away twelve neutral navigation items and eleven page revisions. The corrected migration keeps foreign keys off through all related parent copies, and the guarded forward repair restores only unchanged neutral parents that have no replacement children. Fresh-chain, damaged-chain, repeated-repair, changed-parent, custom-child, and `PRAGMA foreign_key_check` cases now pass.

- Observation: Route-level authorization and revision checks alone do not close a D1 mutation race.
  Evidence: An owner or editor can lose authority after the route read and before the batch runs, while two requests can begin from the same aggregate revision. Every M2 mutation now repeats live authority inside its D1 statements and binds its audit receipt to a request-specific operation marker. Page metadata lives on immutable revisions, module changes compare the complete registry vector, and losing mutations cannot create durable false-success receipts.

- Observation: Catalog publication needs exact revision references at every aggregate boundary.
  Evidence: Release and collection revisions now map to immutable track revisions through composite foreign keys. Later track edits create new revisions while already-published sequencing and metadata remain stable.

- Observation: Media provenance and protected delivery authority are distinct facts.
  Evidence: A security regression showed that treating the registering editor as a track owner preserved stream access after role revocation. Delivery now derives authority only from current server-owned roles and access facts, and the regression proves denial before any R2 read.

- Observation: Source-level media state changes must protect every published derivative dependency.
  Evidence: Rejecting an approved artwork source could otherwise invalidate a published release or collection using one of its derivatives. The media repository now blocks that transition atomically and preserves both the approved source revision and audit history.

- Observation: Protected readiness and public availability are separate catalog facts.
  Evidence: A protected track can have a ready approved stream derivative while its public stream mode remains unavailable. The current-revision read now keeps readiness server-side and projects a stream URL only after the current identity passes the exact public, account, or entitlement decision; public index reads still expose public streams only.

- Observation: True route-persistent playback requires one player boundary above every application shell.
  Evidence: Mounting the player provider and audio element in the root layout preserves queue and playback state across public, account, administration, and setup navigation while keeping the controls hidden until a server-approved stream exists.

- Observation: A public structured-page catch-all receives browser-generated one-segment requests as well as authored page slugs.
  Evidence: The browser journey reached a non-normalized segment such as `favicon.ico`. The public page read now returns not found before any D1 call, so metadata and page rendering produce a normal `404` without a server exception.

- Observation: Real audible acceptance requires artist-approved audio.
  Evidence: Michael requires the repository and verification flow to remain free of temporary or generated assets. Range parsing, access denial, exact R2 reads, player state, and meaningful-listen logic are fully verified with in-memory bytes and non-persistent binding doubles. Browser playback through a real derivative remains recorded as pending until approved material is supplied.

- Observation: Customer-facing saved state needs the current inactive revision as well as active list projections.
  Evidence: An active-only favorites read cannot safely restore a previously removed favorite because a null expected revision would conflict with the durable row. The public favorite control now reads the exact customer's current active or removed revision before sending a desired-state compare-and-set mutation.

- Observation: A useful customer library is a live access decision plus durable history, not a stored entitlement list.
  Evidence: Milestone 4 enumerates the exact customer's candidate resources, passes every requested action through `readAccessFacts` and `decideAccess` at the server-selected time, includes only currently allowed resources in the live library, and retains revoked, expired, exhausted, scheduled, and delivered records in separate history projections.

- Observation: Resume state belongs to D1 and can remain additive to public playback.
  Evidence: The root server enables history only for an active D1 customer with the active customer-library module. The player loads server-projected positions and revisions, serializes idempotent checkpoints, refreshes after a compare-and-set conflict, and keeps public playback running if account history is unavailable.

- Observation: D1 validates a rebuilt child's composite parent key against the legacy parent schema before the final parent rebuild is complete.
  Evidence: The first local application of migration `0014` stopped before acceptance with `foreign key mismatch - "__new_entitlements" referencing "access_grants"`. A migration-only unique subject index on the legacy grants table gives the new entitlement foreign key a valid parent during the transition; the corrected migration then applied all 28 commands, retained no bridge index, advanced schema version 6, and passed `PRAGMA foreign_key_check`.

- Observation: Large exact D1 authority predicates can exceed SQLite's expression-tree depth even when every individual condition is valid.
  Evidence: The real Milestone 6 runtime reached D1's expression-depth limit of 100 in membership and license fulfillment. Building the same guarded predicates as balanced boolean trees retained every authority and idempotency condition while the complete signed-webhook journey passed.

- Observation: Verified subscription lifecycle events can arrive before the initial paid invoice and multiple events can share one provider timestamp.
  Evidence: The recurring coordinator now stores pre-invoice lifecycle evidence, lets terminal deletion preempt later fulfillment, reconciles nonterminal state after invoice activation, and applies deterministic same-second precedence in favor of terminal and access-reducing facts.

- Observation: Finite-use delivery needs a resumable sequence that grants neither early access nor a stranded consumed credit.
  Evidence: Download-credit redemption prepares an exact future-dated entitlement that `decideAccess` rejects, then reserves and consumes one credit, verifies the pinned row, and atomically activates that same entitlement. Every mutation repeats the exact current published, protected, delivery-ready pinned-revision predicate. Withdrawal before reservation, at consumption, and after consumption leaves access inert and resumes only for the exact republished revision without another spend.

- Observation: An exclusive acquisition pre-read is insufficient when a competing path can win at a later D1 batch boundary.
  Evidence: The license-credit reservation batch now repeats one request, issued-license, and active-checkout predicate on the account, reservation, every lot, every allocation, the ledger, and the audit receipt. An injected winning checkout after the credit pre-read leaves every losing credit record byte-for-byte unchanged and makes downstream license issuance unreachable.

- Observation: Generated composite references require an actually unique parent key in SQLite.
  Evidence: The initial Milestone 7 course revision referenced `(access_plan_id, access_plan_revision)` against a parent pair without a unique index. The forward correction uses a real foreign key to `access_plans.id`, retains the revision as a frozen application-validated snapshot, and leaves every migration checkpoint clean under `PRAGMA foreign_key_check`.

- Observation: Reusable page sections need immutable revision pins and a separate publication authority.
  Evidence: Pages now store ordered links to exact published section revisions. Owners author, publish, and archive sections; a scoped `pages.write` editor may compose only already-published revisions inside an assigned page, while page structure and public publication remain owner-controlled.

- Observation: Account-scoped update links can expose another customer's commerce history unless the linked resource participates in every read predicate.
  Evidence: Order-linked What's New reads, unread counts, details, and receipts now require the exact active customer's fulfilled test order. D1 also rejects a public order update at the schema boundary.

- Observation: Generated SQLite rebuilds do not synthesize values for new non-null columns when copying the legacy table.
  Evidence: Drizzle generated a contact-form copy that selected the two new columns from the old schema. The inspected migration substitutes empty defaults, keeps foreign keys disabled across the parent rebuild, preserves existing consent and inquiry children, advances schema version 13, and passes the fresh and applied-chain foreign-key checks.

- Observation: Group-level distinct counts cannot produce a correct day-level session total by summation.
  Evidence: One session that performs actions in several event/resource groups appears once in every group. Schema version 15 persists the global distinct session and linked-account totals on `telemetry_aggregate_days` before raw events can be pruned; live and finalized administration now read those day-level values.

- Observation: A generated one-table legal-pointer rebuild cannot preserve both sides of a circular D1 foreign-key relationship under Wrangler's migration transaction.
  Evidence: The first generated correction passed an autocommit in-memory check and failed the real local D1 transaction. The inspected replacement rebuilds legal documents and versions together under deferred enforcement, creates the required composite uniqueness before copying, applies through Wrangler, and leaves all seven pointer/version foreign-key rows valid with zero violations.

- Observation: Server-owned outcomes need a different telemetry entry boundary from browser-observed facts.
  Evidence: Browsers are forbidden from claiming contact submission, fulfillment, entitlement, license, membership, subscription, and protected-delivery outcomes. The server now prepares a deterministic event in the same D1 batch as its durable source, obeys the exact request's consent, GPC, and DNT state, removes identity in anonymous mode, and refuses a late event after its UTC day has been finalized.

- Observation: A redacted operations table is useful only when real failures enter it and stored safe-looking values are re-evaluated before display.
  Evidence: Catalog delivery now records fixed-code, internal-derivative failures idempotently. The browser projection additionally rejects Stripe keys, webhook secrets, provider identifiers, hosted Checkout URLs, PAN-shaped strings, payment/customer fields, unsafe subjects, and free-form reasons while retaining enumerated access reasons and stable diagnostic codes.

- Observation: The current installed Playwright wrapper expects a `playwright-cli` executable that `@playwright/mcp` 0.0.78 no longer exports.
  Evidence: The package now exports `playwright-mcp`. The final dedicated CLI launch therefore stopped without a browser action; completed milestone browser journeys, the full HTTP integration gate, and the responsive, keyboard, contrast, reduced-motion, touch, and overflow contracts remain the local acceptance evidence. No screenshot or browser artifact was created.

- Observation: Current Stripe provider delivery can place a paid subscription invoice before `checkout.session.completed` and uses invoice fields that differ from older fixtures.
  Evidence: The approved Test-mode rehearsal delivered `invoice.paid` first under API version `2026-06-24.dahlia`, omitted the legacy boolean `paid`, and placed the exact subscription period on the non-proration subscription line. The adapter now projects those facts narrowly, and the later checkout event records the already-fulfilled order without duplicating access.

- Observation: Setup-created commerce definitions need one exact owner binding operation for each supported commerce kind.
  Evidence: The binding mutation now advances membership and subscription plans or the exact track, revision, license terms version, and option; it creates the active Test product and immutable price, creates the track-specific license offer when required, and marks the setup intent bound in the same transaction.

- Observation: New optional catalog metadata must preserve the semantic identity of older portable exports.
  Evidence: Emitting null-valued Meter, Tempo, and Key fields changed an older archive's semantic fingerprint after restore. Current exports omit absent optional fields, restore older records as null, and round-trip supplied values exactly; the complete portability export and double-restore rehearsal passes.

## Decision Log

- Decision: Retire the artist-specific rehearsal packet after proving the application plumbing.
  Rationale: Fresh installations now exercise the general setup and media-publication paths with artist-approved sources; the repository carries no private rehearsal builder, content map, media, or public preview path.
  Date/Author: 2026-07-21 / Michael and Codex

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

- Decision: Keep the initial public home focused on active functional navigation and place audience privacy, Privacy, Terms, FAQ, and the sun/moon theme control in the footer.
  Rationale: The initial surface should expose working destinations directly without template narrative, ownership language, Sites or ChatGPT explanations, or a repository link.
  Date/Author: 2026-07-19 / Michael

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

- Decision: Keep canonical owner, editor, and customer roles in D1 and make real owner bootstrap an explicit later setup action.
  Rationale: M1 needs deterministic fictional identities to prove role resolution without assigning authority to a real person. Hosted and artist-specific authority begins only through an approved setup operation.
  Date/Author: 2026-07-18 / Codex

- Decision: Use one checked-in local-only Wrangler configuration for Vite bindings and migration rehearsal.
  Rationale: Matching D1 and R2 identifiers plus one persistence root make restart behavior real and repeatable. Sites hosting continues to use `.openai/hosting.json`; the local configuration is never a deployment command.
  Date/Author: 2026-07-18 / Codex

- Decision: Enable the runtime laboratory only through `npm run dev:runtime` and package production with simulation explicitly off.
  Rationale: Fictional identity selection and laboratory writes are useful for deterministic local proof and must fail closed in normal development and production output.
  Date/Author: 2026-07-18 / Codex

- Decision: Support one validated HTTP byte range per media request and reject multi-range input with `416`.
  Rationale: Browser audio seeking and resume require bounded, open-ended, and suffix ranges. The single-range contract keeps R2 reads exact and avoids multipart response complexity while preserving correct full and partial delivery.
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

- Decision: Run the complete commerce domain as a permanently test-locked simulation in the Build Week Sites installation.
  Rationale: Stripe Test Mode creates simulated objects without accepting real payment methods, making real charges, or moving money. Stripe-hosted Test Checkout keeps card entry outside `a-op`; verified `livemode = false` webhooks exercise orders, memberships, subscriptions, licensing, credits, entitlements, and protected delivery. The Sites adapter rejects live keys and live events before writes and cannot be promoted to live through administration or ordinary configuration.
  Date/Author: 2026-07-19 / Michael and Codex

- Decision: Keep one commerce domain and require an explicit compatible-deployment capability for any future live operation.
  Rationale: Shared order and fulfillment contracts preserve the product as a complete artist-owned system. A chosen environment must permit and technically support real transactions, and live activation requires a fresh check, source-controlled capability, dedicated validation, and artist approval.
  Date/Author: 2026-07-19 / Michael and Codex

- Decision: Keep the neutral installation free of temporary imagery and omit the living mosaic from the `a-op` baseline.
  Rationale: The starting application should carry the artist's own approved material when it exists. Open left-aligned typographic headers keep the neutral product complete without manufacturing an interim image identity.
  Date/Author: 2026-07-18 / Michael

- Decision: Use ten bounded worker assignments in four integration waves.
  Rationale: Independent modules can move in parallel while the primary task owns shared contracts, integration, and the running application.
  Date/Author: 2026-07-18 / Codex

- Decision: Keep Sound for Movement private and read-only while using its complete visual framework as the authorized `a-op` starting point.
  Rationale: The visual system can be rebuilt exactly in React while company content, media, customers, secrets, endpoints, and production state remain in their current private locations.
  Date/Author: 2026-07-18 / Michael and Codex

- Decision: Give Michael action-specific authority over identity, rights, access plans, legal language, connected accounts, and publication.
  Rationale: Those decisions belong to the artist and can create external or legal consequences.
  Date/Author: 2026-07-18 / Michael and Codex

- Decision: Keep content structure and publication owner-controlled while allowing editors to maintain assigned drafts.
  Rationale: Page kind, module ownership, and the public revision determine availability. Storing them with the revision and promoting them together lets editors work inside an approved scope without changing the public gate before the owner publishes.
  Date/Author: 2026-07-19 / Codex

- Decision: Bind every durable mutation and audit receipt to live in-transaction authority and an exact operation marker.
  Rationale: Server-owned role facts and compare-and-swap state must still match when D1 executes the batch. A receipt proves that the requested state was the state actually written.
  Date/Author: 2026-07-19 / Codex

- Decision: Preserve already-applied development data with a guarded forward repair after correcting the original migration chain.
  Rationale: Fresh installations should never lose child rows, and an existing local database should return to the same valid neutral state without a reset or any change to artist-edited parents or replacement children.
  Date/Author: 2026-07-19 / Codex

- Decision: Publish catalog aggregates through immutable revisions and freeze exact track revisions inside release and collection revisions.
  Rationale: Public catalog state remains reproducible as tracks evolve, and D1 foreign keys enforce the aggregate relationship rather than relying on application convention.
  Date/Author: 2026-07-19 / Codex

- Decision: Treat media registration ownership as provenance only.
  Rationale: Protected delivery authority comes from current D1 roles and access records. Revoking an editor therefore removes protected-stream access even when that editor originally registered the source.
  Date/Author: 2026-07-19 / Codex

- Decision: Keep all Milestone 3 verification free of synthetic media and wait for artist-approved audio before running the audible and R2 publication journey.
  Rationale: The implementation can prove validation, authorization, range semantics, immutable catalog state, player behavior, and zero-read denials with in-memory data. Real media evidence should represent material the artist has approved for this Site.
  Date/Author: 2026-07-19 / Michael and Codex

- Decision: Mount the persistent player at the root application boundary.
  Rationale: One provider and one audio element preserve active playback and queue state across every public and operator route while rendering visible controls only for an approved stream.
  Date/Author: 2026-07-19 / Codex

- Decision: Create the customer role through one explicit signed-in activation operation.
  Rationale: Page reads remain read-only, the official ChatGPT identity supplies email and display name, and D1 atomically creates or reuses the application user, profile, customer role, and idempotent receipt while refusing disabled or revoked accounts.
  Date/Author: 2026-07-19 / Codex

- Decision: Treat playlists as ordered track-root references and listening history as a frozen heard revision plus current resume projection.
  Rationale: A playlist follows the track's current published revision while preserving customer order. Listening history records what the customer heard and separately resolves whether the track remains available now.
  Date/Author: 2026-07-19 / Codex

- Decision: Derive the live customer library from current access decisions and keep access and delivery history separately durable.
  Rationale: Revocation, expiry, exhaustion, membership, subscription, license, credit, and direct-grant changes must affect delivery and the visible library immediately without erasing the historical customer record.
  Date/Author: 2026-07-19 / Codex

- Decision: Freeze each access-plan definition after its first grant-set issuance and copy its revision into the issued set.
  Rationale: Existing customer authority must remain reproducible when an artist creates a later definition. Archived plans retain their grant and entitlement history, while a changed scope begins as a new plan.
  Date/Author: 2026-07-19 / Codex

- Decision: Activate plan issuance only after one exact grant and one exact entitlement exist for every plan item.
  Rationale: A pending grant set is never access authority. The atomic activation barrier, composite customer and resource foreign keys, and idempotent audit receipt prevent partial, cross-customer, replayed, or mismatched access from becoming live.
  Date/Author: 2026-07-19 / Codex

- Decision: Keep finite-use values unavailable until the Milestone 6 credit ledger owns reservation and consumption.
  Rationale: A stored remaining-use number without an atomic delivery ledger would display a limit the application cannot enforce safely. Milestone 5 grants are open-use; Milestone 6 adds the complete finite-use lifecycle before enabling that input.
  Date/Author: 2026-07-19 / Codex

- Decision: Make account Access a core customer surface independent of the optional saved-music library.
  Rationale: Every installation needs visible current authority, entitlement history, and delivery history. Favorites, playlists, and listening history remain activatable customer-library behavior.
  Date/Author: 2026-07-19 / Codex

- Decision: Let the signed paid invoice own initial recurring activation and keep earlier lifecycle facts as durable pending evidence.
  Rationale: A checkout completion does not prove recurring payment. Deferral, terminal preemption, and deterministic reconciliation preserve exactly-once orders, credits, relationships, and access across provider event ordering.
  Date/Author: 2026-07-19 / Codex

- Decision: Give one license request one exclusive acquisition path across hosted checkout, license-credit redemption, and owner issuance.
  Rationale: Existing open checkout and reserved-credit records are durable claims. Atomic issuance gates repeat the exact source condition so concurrent paths cannot create duplicate licenses or consume an unnecessary credit.
  Date/Author: 2026-07-19 / Codex

- Decision: Make download-credit redemption a resumable pending-entitlement sequence.
  Rationale: A future-dated exact entitlement is non-authoritative before consumption, while deterministic prepare, reserve, consume, and activate operations can recover safely without duplicate or stranded state.
  Date/Author: 2026-07-19 / Codex

- Decision: Generate Test Mode license documents deterministically from immutable issued snapshots and deliver them only after `decideAccess` succeeds.
  Rationale: Leased retryable jobs and idempotent R2 writes make document generation recoverable. Central authorization before every R2 read preserves revocation and expiry immediately.
  Date/Author: 2026-07-19 / Codex

- Decision: Keep the frozen course access-plan revision as application-validated historical data and reference the durable access-plan identity directly.
  Rationale: SQLite can enforce the stable plan identity while publication validates the recorded revision. This avoids a false composite foreign key and retains the exact access definition used by the published course.
  Date/Author: 2026-07-19 / Codex

- Decision: Let owners publish reusable content sections and let scoped page editors compose only those published revisions.
  Rationale: The artist controls reusable public language once, while assigned editors can arrange approved material without gaining section-authoring, structural, or publication authority.
  Date/Author: 2026-07-19 / Codex

- Decision: Keep order-linked What's New activity private to the exact customer who owns the fulfilled test order.
  Rationale: Account audience alone is not sufficient for customer-specific commerce history. Every feed, detail, unread, and read-receipt query repeats the exact order ownership and active-customer predicate.
  Date/Author: 2026-07-19 / Codex

- Decision: Store booking information and public contact details as explicit contact-form configuration.
  Rationale: They are public artist-authored contact content, distinct from private inquiry data, and belong in the same owner-controlled revisioned form configuration without a media or external delivery dependency.
  Date/Author: 2026-07-19 / Codex

- Decision: Persist global daily telemetry totals separately from per-event and per-resource groups.
  Rationale: Group rows support useful breakdowns, while one day-level distinct calculation preserves truthful session and linked-account totals after retention removes source events.
  Date/Author: 2026-07-19 / Codex

- Decision: Insert server-owned telemetry only beside the exact durable mutation that proves the outcome.
  Rationale: The shared D1 batch makes the fact replay-safe and prevents a browser, failed mutation, late finalized-day write, or changed consent state from manufacturing operational outcomes. Consent-required mode records only a granted browser request; anonymous mode stores no user link.
  Date/Author: 2026-07-19 / Codex

- Decision: Bind every legal document pointer to the matching document and immutable version with composite foreign keys.
  Rationale: A Privacy pointer must never reference a Terms version, including through direct D1 writes. Rebuilding both circular parents together keeps fresh and upgraded installations equivalent.
  Date/Author: 2026-07-19 / Codex

- Decision: Treat operational diagnostics as an allowlisted projection over real fixed-code failure records.
  Rationale: Operators need actionable component, code, time, count, and safe internal subject evidence. Provider objects, payment data, secrets, private paths, customer fields, and artist-authored free text do not belong in the browser diagnostic surface.
  Date/Author: 2026-07-19 / Codex

- Decision: Make `verify:sites-package` the strict Build Week packaging boundary.
  Rationale: Ordinary source builds remain available before an artist activates commerce. The Sites package gate requires complete `pk_test_`, `sk_test_`, and `whsec_` configuration first, rejects live or malformed values, and then runs the complete integrated gate. No administration or ordinary Sites configuration exposes a live switch.
  Date/Author: 2026-07-19 / Codex

- Decision: Treat Stripe as a conditional commerce dependency and bind setup products through an owner-only application operation.
  Rationale: Streaming and free publishing need no Stripe account. An artist who activates commerce creates matching products and prices in Stripe Test Mode, then supplies only the `price_` identifier. The application owns plan activation, product facts, access, fulfillment, and entitlements; Stripe owns hosted test payment entry and signed provider events.
  Date/Author: 2026-07-20 / Codex

- Decision: Resolve every setup media dependency before the first dependency-ordered topic mutation.
  Rationale: A missing or incompatible track, Course, or hosted-video derivative must fail the aggregate application before artist, navigation, catalog, legal, or receipt state can change. Writers re-resolve immediately at their own mutation boundary.
  Date/Author: 2026-07-19 / Codex

- Decision: Demonstrate the empty-catalog track and player experience through interface-only preview state.
  Rationale: Five neutral Track rows and a zero-duration queue let an artist inspect the complete interaction before approved music exists while D1, R2, entitlements, history, and telemetry remain free of fictional music activity.
  Date/Author: 2026-07-19 / Michael and Codex

- Decision: Extend the interface-only preview boundary to blank Album and Collection navigation.
  Rationale: Three neutral Album cards and two neutral Collection cards make the catalog hierarchy inspectable before publication. Their detail surfaces reuse the same five-row Track preview and never enter D1, R2, entitlements, history, or telemetry as artist content.
  Date/Author: 2026-07-19 / Michael and Codex

- Decision: Extend the interface-only preview boundary to Courses, Posts, and Categories.
  Rationale: Two neutral Course paths, ten Posts per Course, category filtering, a filmstrip, and public or membership states make the full teaching experience inspectable before artist material exists. The preview never enters D1, R2, access grants, progress, completion, or telemetry as artist content; real publication continues to replace it automatically.
  Date/Author: 2026-07-19 / Michael and Codex

- Decision: Extend the interface-only preview boundary to Videos.
  Rationale: One neutral player and four selectable Video rows make the complete viewing-room layout inspectable before artist media exists. Local play or pause state never enters D1, R2, playback history, or telemetry; published hosted or external video replaces the preview automatically.
  Date/Author: 2026-07-19 / Michael and Codex

- Decision: Extend the interface-only preview boundary to public Licensing choices and FAQs while keeping inquiries consent-bound.
  Rationale: Generic One-Time License, Licensing Subscription, Education Plan, Price, Benefit, Question, and Answer labels make the complete public hierarchy inspectable without manufacturing products, prices, licenses, entitlements, checkouts, or legal language. Published offers and plans replace previews. Custom Licensing becomes writable only through an artist-published Contact form and consent version.
  Date/Author: 2026-07-19 / Michael and Codex

- Decision: Give Membership its own public route and connect its benefit composition to existing capabilities.
  Rationale: The page can communicate the current plan, learning, music, credits, playlists, favorites, account management, and Licensing as one coherent membership surface. Generic `Membership` and `Price` labels keep the empty installation honest; an active published membership or subscription offer replaces them automatically.
  Date/Author: 2026-07-19 / Michael and Codex

- Decision: Compose the owner Dashboard from existing administration domains and translate route labels only in the operator shell.
  Rationale: One range-aware overview can report real D1 and consent-aware telemetry state while every detailed workflow keeps its current repository, mutation, authorization, and route contract. Entitlements, Inquiries, and Metrics express the operator's task directly; Mailing list, Content Creator, and History remain outside the requested `a-op` dashboard.
  Date/Author: 2026-07-19 / Michael and Codex

- Decision: Keep implementation machinery out of the everyday administration navigation.
  Rationale: ChatGPT Work and Codex handle artist configuration, approved folder-based media intake, catalog preparation, page composition, setup, portability, and maintenance against the repository's durable contracts. The web administration rail is reserved for Metrics, Inquiries, Courses, What's New, Videos, and Entitlements. Removing navigation entries does not weaken server authorization, durable histories, or the complete supported domain.
  Date/Author: 2026-07-19 / Michael and Codex

- Decision: Present substantial Privacy and Terms starters until an owner publishes an approved legal version.
  Rationale: A fresh installation needs a useful structure without claiming that generic language is the artist's policy. The public starter identifies its editable status and legal-review boundary; the existing immutable approval and publication workflow remains the only path to artist-approved legal copy.
  Date/Author: 2026-07-19 / Michael and Codex

- Decision: Keep shuffle as a persistent player preference and choose a different bounded queue item whenever the queue has more than one track.
  Rationale: The control works before media is added, remains available across navigation, avoids immediately replaying the current track, and continues to use only the server-approved queue.
  Date/Author: 2026-07-19 / Michael and Codex

- Decision: Build all five Music Library views over real published and customer data before artist content is present.
  Rationale: Explore, Tracks, Collections, Albums, Favorites, filters, playlists, and listening history can expose their real structure and honest empty states now, then populate automatically from D1 and approved artwork without replacing the interface or manufacturing demonstration content.
  Date/Author: 2026-07-19 / Michael and Codex

- Decision: Let documentation follow working modules.
  Rationale: The repository needs clear setup and operating contracts, while working behavior remains the measure of progress.
  Date/Author: 2026-07-18 / Michael

## Outcomes & Retrospective

Milestone 0 outcome as of 2026-07-18: the active tree is now the official Sites React structure on `codex/sites-rebuild`. It runs locally, builds into Cloudflare Worker-compatible output, packages logical D1 and R2 bindings, and presents the complete neutral visual foundation in dark and light themes.

The first React surface includes the open public shell, left-aligned typographic headers, functional page layouts, pinned Lato, exact semantic tokens, and keyboard, touch, responsive, theme, and reduced-motion behavior. The neutral installation contains no temporary imagery. The old Nuxt application remains recoverable through Git history and no Sound for Movement content, identity, media, data, secrets, endpoints, or machine paths entered the new tree.

Verification passed for strict type checking, lint, the five-stage production build, three focused server/foundation checks, desktop and mobile containment, dark and light theme operation, support-page navigation, theme persistence, and browser diagnostics. Milestone 1 now owns D1 persistence, R2 object and range behavior, identity, server roles, redacted errors, health, and simulation-mode proof.

Milestone 1 outcome as of 2026-07-19: the application now has one durable Worker runtime spine. The generated and inspected migration creates users, profiles, canonical roles, role assignments, audit events, runtime proofs, and media records. Prepared D1 statements, atomic batches, typed repositories, narrow R2 projections, request identifiers, redacted errors and logs, health, official identity helpers, and the default-deny `decideAccess` contract are integrated into running routes.

The runtime gate applies local migrations, starts the test-only laboratory, writes a D1 proof and R2 verification object, resolves anonymous, customer, editor, and owner authority, streams full and partial bytes, stops the server, reads the same D1 and R2 state from a fresh process, deletes the verification object, and confirms ordinary development returns `404` for the laboratory. The final `npm test` passed strict type checking, lint, repository formatting, the five-stage production build, production simulation-off and browser-bundle scans, two foundation checks, 45 focused runtime checks, and the real binding journey with `200`, `206`, `403`, `404`, and `416`. No verification media remains. Hosted dispatch behavior remains an approval-gated Milestone 10 check.

Milestone 2 outcome as of 2026-07-19: the running application now reads artist identity, active modules, public navigation, footer links, and public pages from published D1 revisions. Owners can draft and publish artist state, activate dependency-valid modules, publish primary and footer navigation as one snapshot, explicitly bootstrap an installation, assign or revoke scoped editors, and control page structure and publication. Editors can maintain assigned page drafts, customers can update their own profile, and public, account, setup, and administration shells expose these operations with real status and results.

The M2 schema contains eighteen tables and six forward migrations. Transaction statements repeat current owner, editor, scope, active-account, and revision predicates; exact operation markers join successful state changes to their audit receipts. Page module ownership and kind publish with immutable revision content, and module transitions compare one registry revision plus the complete ten-module vector. A migration-chain review found and repaired a generated foreign-key cascade defect without resetting local D1 or touching changed parents. Final checks passed strict types, lint, formatting, 79 focused runtime tests, 21 schema/static tests, the five-stage production build, packaged migration and secret-boundary inspection, a complete HTTP authority and publication journey, and DOM-only desktop/mobile checks in dark and light themes. The journey restored its exact D1 baseline and touched zero R2 objects and zero temporary files; the neutral interface contains zero imagery.

Milestone 3 outcome as of 2026-07-19: the music center now carries versioned tracks, releases, collections, credits, immutable source metadata, approved derivatives, processing state, and frozen publication mappings in D1. Owners can create, revise, preview, publish, and unpublish every catalog aggregate. Scoped editors can maintain assigned drafts. Public music index, track, release, and collection routes expose only published, active-module state through public-safe projections.

The root-persistent player carries an approved queue across application routes and provides play, pause, seek, previous, next, repeat, volume, queue, error status, keyboard operation, reduced-motion behavior, and meaningful-listen observation. Public and account-gated track delivery passes through `decideAccess`, validates one HTTP range, and reads only the authorized byte interval. Revoked editors cannot retain delivery access through source provenance, published artwork dependencies block destructive source rejection, and invalid catch-all page segments return a normal `404` before D1.

The final Milestone 3 gate passed 25 unit and integration checks, 16 schema and interface checks, seven structured-page boundary checks, strict type checking, lint, repository formatting, the five-stage production build, packaged migration and server-boundary inspection, and DOM-only desktop/mobile checks in dark and light themes. The packaged runtime contains thirty tables across ten migrations and no client-visible server values. The repository contains no image, audio, or video files; tests made no R2 writes. Audible playback, browser seeking through a real derivative, and approved R2 publication remain pending until artist-approved audio is supplied.

Milestone 4 outcome as of 2026-07-19: a signed-in person can explicitly activate a customer account, maintain their profile, save published tracks and releases, arrange published tracks into revision-safe ordered playlists, inspect frozen listening history, and resume through the root-persistent player. Every write derives the actor from the official authenticated identity, repeats active-customer and module authority inside D1, uses an idempotency receipt, and applies compare-and-set state where concurrent changes matter.

The account library now explains direct grants, memberships, subscriptions, licenses, and credits from current server-owned facts. Every live resource action is passed through `decideAccess`; revoked, expired, exhausted, and scheduled facts leave the live library immediately while remaining visible in grant and entitlement history. Protected stream and download routes decide access before R2, unauthorized requests perform zero object reads, successful downloads record one redacted delivery, and anonymous delivery is possible only for intentionally public downloads.

The final Milestone 4 gate passed 30 customer, access, delivery, schema, and player checks; 13 API and interface checks; strict type checking; lint; repository formatting; the five-stage production build; packaged migration and server-boundary inspection; and a no-screenshot local HTTP journey for the public Site, signed-in activation UI, and protected customer route. The packaged runtime contains thirty-seven tables across fourteen migrations and no client-visible server values. Verification created no image or media asset, invoked no image or screenshot tool, and wrote no R2 object. Milestone 5 now owns artist grant, revocation, expiry, access-plan, entitlement, and delivery administration.

Milestone 5 outcome as of 2026-07-19: owners can define one current published-resource access scope, issue it to an active customer exactly once, inspect the resulting grant and entitlement set, and revoke or expire the complete relationship without erasing history. Plan definitions freeze after first issuance; pending sets confer no authority; composite D1 constraints keep each grant and entitlement on the exact customer and resource; and every mutation repeats live owner authority and writes one idempotent audit receipt.

Account Access is a core customer surface independent of favorites and playlists. It projects current resources, access explanations, grant and entitlement history, and completed delivery history from server-owned facts. Authorized protected track pages receive revision-pinned stream URLs, and ready downloads receive same-origin revision-pinned links only while the downloads module and exact entitlement remain active. The final gate passed 27 focused state and delivery checks, 18 static contract checks, strict types, lint, formatting, the five-stage production build, packaged runtime inspection, and the production-off HTTP journey. The journey restored the exact D1 baseline and created zero media bytes, R2 objects, images, screenshots, or temporary files. Milestone 6 now owns finite-use credit accounting and the complete test-locked commerce, membership, subscription, and licensing lifecycle.

Build Week commerce boundary as of 2026-07-19: `PRODUCT.md` remains the canonical complete product narrative. The Sites installation will exercise checkout, orders, memberships, subscriptions, licensing, credits, entitlements, account results, and protected delivery through one Stripe Test Mode simulation. It will accept only test keys, keep payment entry on Stripe's hosted test surface, verify signatures, reject live events before writes, label test state visibly, and expose no live-commerce switch. The same domain can serve a future compatible deployment only after a fresh environment check, source-controlled capability, live validation, and artist approval.

Milestone 6 outcome as of 2026-07-19: the running application now carries one complete simulated commerce journey without accepting real payment or moving money. A signed-in customer can choose an active test product, license offer, membership, subscription, or credit product, continue to Stripe-hosted Test Checkout, return to durable account history, and receive the exact order, relationship, license, credits, entitlement, and protected delivery created by a verified signed test event. Operators can configure products and frozen benefits, inspect customer relationships and operational evidence, generate protected license documents, and manage the resulting histories. Checkout actions identify Stripe Test Mode and resulting records retain their exact test provenance. The empty installation also presents the complete public Licensing hierarchy through interface-only one-time, subscription, education, custom-inquiry, and FAQ surfaces while leaving prices, offers, consent, and customer state honest.

The recurring coordinator defers activation until a paid invoice, reconciles out-of-order lifecycle events, gives terminal and access-reducing evidence deterministic precedence, and creates each renewal order once. One license request has one exclusive acquisition path. Download credits use a non-authoritative pending entitlement followed by exact reserve, consume, and activation phases. License documents are deterministic, retryable, R2-backed Test Mode records and remain protected by central access on every delivery. Live credentials fail preflight, signed live events and invalid signatures write nothing, failed and canceled checkouts grant nothing, replay creates no duplicate state, and no card field enters React, D1, logs, telemetry, or audit records. The dedicated public Membership route now presents a real published recurring offer when one exists and otherwise preserves an interface-only neutral preview, with direct links into the existing member capabilities and account records.

The final Milestone 6 gate passed 129 domain and integration checks, 70 static contracts, 22 final integrity and delivery checks, 17 schema-chain checks, strict type checking, lint, the five-stage production build, packaged runtime inspection, and the real D1 signed-webhook HTTP journey. The reopened download-withdrawal and competing-acquisition paths now repeat their full authority predicates at every state-changing statement; an independent final audit found no remaining critical or high-severity issue. The packaged runtime contains eighty-three application tables across twenty-three migrations as Milestone 7's data foundation begins. The journey restored its exact D1 and module baseline and touched zero R2 objects, media rows, screenshots, image tools, repository assets, or temporary files.

Milestone 7 outcome as of 2026-07-19: the running application now carries Courses with ordered sections, lessons, mixed-media records, progress, completion, resume, and centrally authorized delivery; video drafts and publication with context, credits, transcripts, hosted delivery, and click-gated external embeds; editorial posts; reusable immutable content-section revisions; composed structured pages; What's New publication, unread state, read receipts, and public or customer-private resource links; and an owner-managed stored-only contact system with frozen consent, public booking information, public contact details, inquiry state, and notes. An empty installation now makes the complete Courses hierarchy and Videos viewing room reviewable through interface-only Courses, Posts, Categories, filmstrip navigation, public or membership states, one blank player, and four selectable blank Videos while keeping all durable records honest.

Publishing and private reads repeat live module, customer, editor, owner, revision, linked-resource, and readiness predicates at D1 execution boundaries. Public page reads join their pinned reusable sections into one publication snapshot. Order-linked updates remain account-private to the exact fulfilled test-order customer. Existing contact records survived the schema-version 13 parent rebuild with empty defaults for the two new public fields.

The final Milestone 7 gate passed 39 functional and integration checks, 26 static and schema checks, strict type checking, full lint, repository formatting, the five-stage production build, packaged runtime inspection, local migration application, and a clean foreign-key check. The packaged runtime contains eighty-six application tables across twenty-six migrations. The milestone introduced no image, audio, video, screenshot, generated asset, temporary asset, or R2 object; real media journeys remain reserved for artist-approved material.

Milestone 8 outcome as of 2026-07-19: the running application now records a strict allowlist of first-party audience facts, with random browser sessions, optional consented internal linkage, immediate consent/GPC/DNT enforcement, anonymous unlinking, meaningful-listen timing, replay-safe server outcomes, daily aggregation, retention, and owner reporting. Server facts for contact, favorites, playlists, Course completion, update reads, downloads, protected delivery, license issuance, memberships, subscriptions, and video load share the exact durable mutation or observable playback boundary. Finalized days reject late facts, and global day-level session/account totals survive source-event pruning without group overcount.

Owners can answer the installation-specific legal setup, save immutable Privacy and Terms drafts, approve an exact version, publish it separately, revise it without replacing the current public version, and inspect history. Composite D1 references prevent any document pointer from crossing into the other document's version. Operations now shows binding and schema health, count-only R2 state, failed media jobs, fixed-code delivery failures, redacted audit projections, exact customer relationships, access explanations through `decideAccess`, and guarded job retry. Stripe test/live keys, webhook material, provider objects, Checkout URLs, card-shaped values, payment/customer fields, free-form reasons, private paths, and unsafe subjects remain outside browser diagnostics.

The final Milestone 8 gate passed 27 focused unit and integration checks, 25 static/schema/laboratory checks, strict type checking, full lint, repository formatting, the five-stage production build, packaged runtime inspection, local forward migration rehearsal, and the real HTTP journey. The packaged runtime contains ninety-three application tables across twenty-nine migrations at schema version 15. The journey visibly proved consent before and after approval, exactly one source fact and owner aggregate, owner-only operations, redacted failure evidence, legal draft replay, approval, publication, history, public rendering, cleanup, and a production-mode `404`. It restored every D1 baseline and created zero R2 objects, media bytes, images, screenshots, repository assets, or temporary files. Milestone 9 now owns the complete ChatGPT Work setup, proposal, media-preparation, export, restore, diagnosis, and maintenance lifecycle.

Milestone 9 outcome as of 2026-07-19: a fresh ChatGPT Work task now has one strict fourteen-topic setup language, zero-write preview, exact-hash approval, owner-only deterministic apply, replay-safe receipts, safe diagnosis, fixed local media preparation profiles, approval-first Site publication, and customer-independent portability. Media bindings resolve approved ready sources and exact derivatives before any setup topic writes. Export verification checks fixed paths and checksums; disposable restore applies the complete checked-in D1 migration chain in memory, restores every portable entity twice without duplicates, and reproduces the exact semantic fingerprint with zero foreign-key violations.

The Milestone 9 gate passed 65 unit and integration checks, 30 static contracts, the complete fourteen-topic HTTP journey, strict type checking, lint, formatting, production build, packaged schema inspection, and schema version 19 across ninety-nine application tables and thirty-three migrations. Cleanup restored exact counts, mutable state, source fingerprint, and foreign keys. No media conversion, temporary asset, screenshot, R2 object, external call, environment-file inspection, or hosting action ran.

Milestone 10 local outcome as of 2026-07-19: one integrated gate now composes the current production build, forward migrations, all ten user-story families, M2, M5, M6, M8, and M9 clean-state laboratories, security headers, client budgets, application-schema recovery, and exact cleanup. The Stripe Test Mode journey proves a signed `livemode = false` webhook, exactly-once fulfillment, idempotent replay, zero-write live-event and invalid-signature rejection, durable customer and owner evidence, and protected access after entitlement. The packaged client is 966,936 bytes with a 189,805-byte largest file, source maps absent, and the production dependency audit reports zero vulnerabilities after locking PostCSS 8.5.14.

Administration Dashboard outcome as of 2026-07-19: an owner now enters Metrics as one responsive reporting surface with real D1 activity totals and consent-aware telemetry. The persistent administration rail contains only Metrics, Inquiries, Courses, What's New, Videos, and Entitlements. Content and media intake, setup, page composition, legal drafting, plans, commerce evidence, customer inspection, artist/module configuration, editors, portability, and operations remain durable application capabilities operated through ChatGPT Work, Codex, and their protected server contracts instead of appearing as everyday dashboard destinations.

The repository contains no image, audio, video, or document asset. Final static hardening passed twenty checks for contrast, keyboard and touch behavior, reduced motion, responsive containment, Test Mode visibility, payment-data absence, executable-content boundaries, sandboxed external video, secrets, dependency locking, and Worker headers. The approved Stripe-hosted Test Checkout and provider-webhook acceptance now passes for both recurring membership fulfillment and one-time license issuance. The local rehearsal state was removed afterward; task-created Test subscriptions were canceled, Test customers were deleted, and Test products and prices were archived. Stripe retains its normal sandbox event and completed-session history. Sites version hosting remains approval-gated; the next release action is the neutral one-shot installer exercise.

## Context and Orientation

### Repository state

Run implementation commands from the checked-out repository root.

The private remote is:

    https://github.com/sunflower-of-parchman/a-op.git

`main` remains at clean planning authority commit `4c96148`. The active branch is `codex/sites-rebuild`; Milestone 0 replaced its tracked Nuxt tree with the official Sites starter and the first React visual foundation. The prior implementation remains available in Git history. The branch returns to `main` only after the complete integrated candidate passes its gate and Michael chooses the save or merge action.

Current governing files:

- `PRODUCT.md`: product definition.
- `AGENTS.md`: repository operating rules.
- `PLANS.md`: ExecPlan convention.
- `plans/migrateAopToSites.md`: controlling implementation plan.
- `LICENSE`: open-source license.
- `docs/architecture/product-contract.md`: product, fork, capability, and completion contract.
- `docs/architecture/visual-direction.md`: exact starting visual foundation.
- `docs/architecture/data-and-ai-boundary.md`: Sites storage, local media, and ChatGPT Work data boundary.
- `docs/architecture/commerce-environment.md`: permanent Sites Stripe Test Mode, fulfillment, and no-card-data boundary.
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
- `commerce_products`, `checkout_sessions`, `orders`, `stripe_events`.
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

The application owns access-plan definitions, membership and subscription state, entitlements, credits, license issuance, protected delivery, and one commerce domain. Validated owner actions and verified fulfillment events update those records and the audit ledger together. Idempotency keys prevent repeated grants, renewals, credit changes, license issuance, fulfillment, or revocations from creating duplicate state.

`docs/architecture/commerce-environment.md` defines the Build Week Sites adapter as `stripe-test-simulation`. It accepts only Stripe test credentials, creates Stripe-hosted Test Checkout sessions, verifies webhook signatures, rejects `livemode` events before writes, and exposes no control that can enable live commerce. Checkout sessions, orders, memberships, subscriptions, licenses, credit-ledger entries, fulfillment events, and every commerce-created entitlement store `stripe_environment = 'test'` and `livemode = 0`. A future compatible deployment requires a fresh rules and technical-support check, source-controlled capability, live validation, and artist approval.

### ChatGPT Work operation

The Milestone 9 setup guide and `AGENTS.md` teach a fresh ChatGPT Work task to:

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
- Build the neutral `a-op` home shell with an open left-aligned typographic header.
- Build the shared open header primitive for About, Courses, Videos, Membership, Licensing, Contact, FAQ, and What's New.
- Keep the neutral installation free of temporary image assets; add imagery only from artist-approved material.
- Keep Music, detail, account, authentication, cart, administration, and legal surfaces on functional layouts.

Start the development server, open the exact printed local URL once, and run the production build.

Acceptance:

- The active application source is the official Sites structure.
- The old Nuxt application paths have left the active tree.
- The development server renders the complete `a-op` visual foundation in dark and light themes.
- Public and support headers remain open, left aligned, responsive, and free of temporary imagery.
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
- One commerce domain connecting test checkout, orders, memberships, subscriptions, licenses, credits, entitlements, account state, and protected delivery.
- A Sites commerce adapter permanently fixed to `stripe-test-simulation`, with clear failure for missing test credentials and hard failure for recognized live credentials.
- Stripe-hosted Test Checkout, point-of-action and record-level Test Mode labels, signed webhook verification over the unmodified body, `livemode = false` enforcement, test-environment fields on related records, and redacted idempotent fulfillment.
- No payment-card fields or unrestricted Stripe objects in React, D1, logs, telemetry, audit records, exports, or diagnostics.

Acceptance:

- An owner activates a customer's membership or subscription and the customer receives its access and credits.
- A signed-in customer selects a test product, completes Stripe-hosted Test Checkout with a Stripe-provided test method, receives exactly one verified test order and fulfillment, returns to visible account state, and receives the intended protected access.
- Renewal adds the configured benefits exactly once through an idempotent server action.
- Cancellation applies at the configured boundary.
- One license credit covers the configured track and project scope and enters the immutable ledger.
- A customer obtains an issued license and sees it in account history.
- The artist can audit the complete subscription and license lifecycle.
- Missing test credentials fail setup clearly; live credentials and signed `livemode = true` events fail before every application write.
- Invalid signatures, cancelled or failed checkout, and browser return parameters create zero entitlement, credit, membership, subscription, or license state.
- Exact webhook replay creates zero duplicate orders, licenses, credit grants, memberships, subscriptions, or entitlements.
- Checkout actions identify Stripe Test Mode at the point of action, and resulting simulated records retain visible test provenance without a repeated page-level notice.

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
7. Stripe Test Checkout, signed webhook, exactly-once order and fulfillment, account result, protected access, and administration evidence.
8. Course access, progress, and resume.
9. Video, update, and contact.
10. Telemetry, legal documents, diagnostics, export, and recovery.

Verify production build, D1 migrations, R2 object policy, authorization boundaries, access-operation idempotency, accessibility, keyboard use, reduced motion, mobile layouts, touch targets, contrast, performance, redaction, and recovery.

Save one Sites version from the exact validated commit and packaged output. After Michael approves the specific hosting action and access level, use `sites:sites-hosting`, wait for deployment success, open the returned Sites URL, and verify that its production URL remains permanently locked to `stripe-test-simulation`.

Acceptance:

- Every story completes from a clean local state.
- The exact source commit produces a successful Sites build and saved version.
- The approved hosted Site uses connected D1 and R2 bindings.
- Public music, customer account, protected delivery, and owner administration work at the hosted URL.
- Hosted errors and logs preserve the redaction contract.

Stripe Test Mode acceptance:

- A fresh Sites installation defaults to `stripe-test-simulation`; missing test credentials fail setup clearly and every recognized live credential fails preflight, build validation, and runtime initialization.
- Stripe-hosted Test Checkout and a signed `livemode = false` webhook complete the acceptance journey with exactly one order and exact fulfillment.
- Invalid signatures and signed live-mode events create or modify zero application state and preserve pre-existing records.
- Failed, expired, or cancelled test checkouts may retain non-fulfilling operational evidence, create no order fulfillment, grant, entitlement, credit, membership, subscription, or license, and preserve pre-existing access.
- Webhook replay creates no duplicate order, license, credit grant, membership, subscription, entitlement, or audit result.
- React, D1, logs, telemetry, audit records, exports, diagnostics, and client bundles contain no payment-card fields, secrets, or unrestricted provider objects.
- Checkout actions identify Stripe Test Mode at the point of action, and resulting records retain exact test-environment provenance without a repeated page-level notice.
- No administration control or ordinary Sites configuration can convert the hosted demonstration to live Stripe operation.

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
    sed -n '1,260p' docs/architecture/commerce-environment.md
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

Revision note, 2026-07-18: Made the Sound for Movement design system the React starting point, added modular capability activation and artist-controlled fork ownership, adopted `Courses` as the public teaching name, moved media intake to artist-approved local processing followed by Site publication, and recorded the verified D1, R2, application-runtime, and ChatGPT Work data boundaries.

Revision note, 2026-07-18: Centered the governing documents on application capabilities and durable state. Added exact artist-ownership language, identified D1 and R2 as Sites-provided storage inside the Sites service boundary, qualified model-training statements by workspace controls, and aligned access, memberships, subscriptions, credits, licensing, and delivery with the current Sites non-financial runtime scope.

Revision note, 2026-07-18: Completed Milestone 0 on `codex/sites-rebuild`. Recorded the exact official starter versions, reviewed replacement manifest, active React and Worker structure, exact visual token implementation, open public layouts, Worker typing decision, focused verification, production build, and live desktop/mobile browser journey. Updated the repository-state and next-milestone descriptions to match the runnable Sites application.

Revision note, 2026-07-18: Removed the living mosaic from the product baseline at Michael's direction. Deleted every generated mosaic and social-card file, removed their code and provenance, and revised the governing product, visual, implementation, and verification contracts around open left-aligned headers with no temporary imagery.

Revision note, 2026-07-19: Completed Milestone 1. Added the seven-table D1 identity and runtime schema, inspected migration and local rehearsal, canonical fictional role fixtures, central access decisions, bound R2 helpers and range delivery, official optional and protected identity routes, redacted runtime envelopes, health, an explicit test-only laboratory, production simulation-off checks, client-boundary scans, and a repeatable D1/R2 restart journey with full cleanup.

Revision note, 2026-07-19: Recorded the completed public navigation, footer-directory, and account-shell integration together with its exact focused checks, lint result, production build, and running local review URL so the next contributor can resume from the verified interface state.

Revision note, 2026-07-19: Added a production-disabled fictional customer identity for the standard local development command so the Account interface can be reviewed before hosting while preserving dispatch-owned Sign in with ChatGPT and server-owned D1 authorization.

Revision note, 2026-07-19: Recorded the completed Music Library hierarchy, five real-data customer views, bottom-anchored customer lists, automatic musical filters, durable track meter, tempo, key, and duration fields, and neutral empty-installation behavior without fictional content.

Revision note, 2026-07-19: Tightened the Music Library visual contract around icon-free navigation, compact square-edged filters, silent empty customer sections, and single-line desktop track rows with artwork space and adjacent duration.

Revision note, 2026-07-19: Added the UI-only five-track preview, single musical-metadata header, hover and focus Play reveal, root-persistent zero-duration player preview, and neutral individual Track detail surface with the complete requested action set.

Revision note, 2026-07-19: Restored all five requested actions to every preview row and replaced visible Play text with triangular play controls while retaining accessible labels.

Revision note, 2026-07-19: Replaced the Music sidebar at tablet and phone widths with the compact responsive navigation and tool surface, then condensed phone track actions into the visible Buy Track plus overflow pattern.

Revision note, 2026-07-19: Kept every Track on one responsive row and connected the heart, playlist chooser, playlist creation form, and mobile action sheet to the existing customer-library authorization and D1 mutation contracts.

Revision note, 2026-07-19: Standardized favorite controls on the approved slender, rounded heart outline with an accent-orange filled active state.

Revision note, 2026-07-19: Replaced the desktop Track download button with the approved compact arrow beside the heart while retaining explicit Download copy in the phone action sheet.

Revision note, 2026-07-19: Added clickable UI-only Album and Collection cards and shared Track-list detail previews, aligned Sort with the result count, introduced a restrained Track hover surface, and converted the persistent player to labeled thin-line icon controls with a real close action.

Revision note, 2026-07-19: Reduced Download to the requested down-arrow glyph and made Track metadata responsive to its actual container so Tempo, Meter, and Key remain aligned or leave the layout as one unit.

Revision note, 2026-07-19: Added the UI-only Courses library with two ten-Post Course paths, generic Category filtering, clickable filmstrip navigation, current Post position, and public or membership access previews while retaining the existing real Course authority, progress, and protected-delivery system.

Revision note, 2026-07-19: Added the UI-only Videos viewing room with one blank player, four selectable blank playlist items, and local play or pause state while retaining the existing real hosted-video delivery and consent-gated external-player contracts.

Revision note, 2026-07-19: Added the UI-only public Licensing hierarchy with one-time, subscription, education, custom-inquiry, and FAQ surfaces; published artist records replace matching previews, and the inquiry remains disabled until an exact Contact consent version exists.

Revision note, 2026-07-19: Added the dedicated public Membership route, neutral image-free membership preview, published-offer replacement, and direct links to Courses, Music, Download credits, Playlists, Favorites, account membership management, and Licensing.

Revision note, 2026-07-19: Added the range-aware owner Dashboard, real D1 administration summary, consent-aware telemetry composition, persistent current-route rail, direct operator labels, and responsive route verification while excluding Mailing list, Content Creator, and History.

Revision note, 2026-07-20: Renamed the owner/editor Account action to `Admin Dashboard`, preserved its role-scoped `/admin` route and top-right placement, and granted the current local Michael preview record owner authority for direct review.

Revision note, 2026-07-20: Simplified the visible administration rail to Metrics, Inquiries, Courses, What's New, Videos, and Entitlements; made Metrics the direct administration home; and removed implementation, setup, configuration, commerce, legal, catalog-editor, customer-editor, and shell utility controls from the everyday dashboard surface while preserving their underlying contracts.
