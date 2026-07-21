# a-op

**a-op: artist-owned platform** is an open-source web application for musicians.

An artist can publish music, stream it through their own site, manage customer access, deliver downloads, issue licenses, offer memberships and subscriptions, publish Courses and video, receive inquiries, and run the work from one administration area.

Music is the center of the application. The catalog, player, customer accounts, access records, licensing, memberships, Courses, and administration all use the same artist, account, media, and authorization system.

## OpenAI Build Week

This repository was built during OpenAI Build Week. All repository work was completed with GPT-5.6 Sol in Codex.

| Date             | Codex session                          | Setting              | Recorded result                                                                                                                                                                 |
| ---------------- | -------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| July 18, 2026    | `019f7557-f594-7de1-9176-c4a261de2ea6` | GPT-5.6 Sol · Max    | Completed the product audit and Sites migration plan. The plan was saved in `4c96148`.                                                                                          |
| July 18–19, 2026 | `019f7758-53d0-7d11-a874-f5a302d0e92d` | GPT-5.6 Sol · Ultra  | Rebuilt the application in React for Sites. The session started from `4c96148`. The complete implementation landed in `9b2f8bd` after 14 hours and 28 minutes.                  |
| July 20–21, 2026 | `019f82a8-85d5-7550-a437-bb6a8945a18a` | GPT-5.6 Sol · Medium | Completed Stripe Test acceptance, removed local test state, audited the release, and restored the complete neutral framework. The neutral framework was committed in `2079971`. |

Session metadata records these reasoning settings: `low`, `medium`, `high`, `xhigh`, `max`, and `ultra`. Codex also ran in Standard and Fast speed modes.

The Git history includes the first Nuxt implementation and the React/Sites rebuild. Important decisions are recorded in [plans/migrateAopToSites.md](plans/migrateAopToSites.md). Implementation sources and commit evidence are recorded in [docs/provenance.md](docs/provenance.md).

## Website sections

### Home

The home page introduces the artist's current work. It can show approved imagery, the latest release, current Courses, a featured video, an About introduction, and direct paths to Membership and Licensing. The complete page structure remains visible in a neutral installation. Empty states identify the material the artist has not published yet.

### Music

Music contains the artist's releases, albums, tracks, and collections.

Listeners can browse, filter, sort, and open individual catalog entries. Public tracks stream through the persistent player, which keeps its queue while the listener moves through the site. Tracks can also carry artwork, credits, duration, meter, tempo, key, availability, download access, and licensing options.

Signed-in customers can save favorites, create playlists, keep listening history, resume playback, and open music available through a purchase, membership, subscription, license, credit, or artist-issued grant.

### Membership

Membership presents the artist's current membership or subscription offer and its included music, Courses, benefits, download credits, or license credits.

Customers can see their active relationship, renewal or cancellation state, benefits, credits, and history in their account. The artist can define plans and manage memberships and subscriptions from administration.

### Licensing

Licensing presents the ways the artist makes music available for licensed use. An offer can identify the track, intended use, current terms, price, approval requirement, or license-credit path.

Customers can submit a licensing request, use an available license credit, receive an issued license, download its document, and keep the license in their account history. The artist can review requests, approve or reject them, issue licenses, generate documents, and revoke or expire access.

### Courses

Courses contain ordered lessons made from text, audio, video, images, and downloads. A Course can be public, account-based, granted directly, licensed, or included with a membership or subscription.

Signed-in customers can record progress and resume where they stopped. Protected lesson media passes through the same server-side access decision as protected music and license files.

### Videos

Videos has an index and individual viewing pages. Each video can include a title, summary, poster, artist context, credits, and transcript.

Hosted video is delivered through the Site. External video remains unloaded until the visitor chooses to load it.

### Journal and What's New

Journal carries longer published posts. What's New carries shorter updates linked to current music, Courses, videos, memberships, licensing, and other activity.

Signed-in customers can see unread What's New items and mark them as read. Customer-specific order links remain visible only to the customer who owns the order.

### About and artist pages

About introduces the artist through published writing and approved media. The artist can also publish structured pages made from reusable content sections. Drafts, revisions, and publication remain separate so unfinished writing does not become public.

### Contact

Contact can carry public contact details, booking information, an invitation, inquiry categories, and the artist's consent language.

Submissions are stored for the artist with the exact consent version the visitor accepted. Administration provides inquiry status and private notes. The application does not send email unless the artist deliberately adds and approves an email delivery service.

### Privacy Policy, Terms and Conditions, and FAQ

Privacy Policy and Terms and Conditions begin with editable starter documents. They remain identified as starters until the artist reviews, approves, and publishes a version. Published versions keep their history.

FAQ is a normal published page the artist can edit for their own listeners and customers.

## Customer account

Sign in with ChatGPT establishes the visitor's identity. The application creates its own customer record and keeps authorization in server-side D1 data.

The account area can show:

- profile information;
- current access and the reason each resource is available;
- music library, favorites, playlists, listening history, and resume state;
- memberships, subscriptions, renewal dates, and cancellation history;
- download and license credit balances and ledger history;
- orders created by the Stripe Test Mode simulation;
- issued licenses and license documents;
- Course progress; and
- unread What's New items.

## Administration

The visible dashboard is a compact working surface for Metrics, Inquiries, Courses, What's New, Videos, and Entitlements. Owners and authorized editors reach it through **Admin Dashboard**.

The application also contains protected administration routes for:

- artist identity, active capabilities, navigation, pages, and reusable sections;
- tracks, releases, collections, media records, previews, and publication;
- customers, access plans, grants, entitlements, and delivery history;
- memberships, subscriptions, credits, licensing, and test orders;
- contact forms, inquiries, telemetry, legal documents, and operations;
- trusted editors and their assigned permissions; and
- setup, export, verification, and recovery.

These underlying tools remain available for setup and maintenance while the everyday dashboard stays small.

## Five-minute judge path

Requirements: Node.js 22.13 or later and npm.

```sh
npm ci
npm run db:migrate:local
npm run dev
```

Open the local address printed by the development server.

The neutral installation contains the public navigation, responsive layouts, dark and light themes, music workspace, Membership, Licensing, Courses, Videos, What's New, Contact, Privacy Policy, Terms and Conditions, FAQ, and login page. Empty states show where the artist's approved material will appear.

Sign in with ChatGPT requires Sites-provided identity. Protected account and administration routes use that identity. Stripe checkout requires Test credentials.

Run the complete source verification:

```sh
npm run verify:all
```

Build the production Worker artifact:

```sh
npm run build
```

## Starting an installation

Every installation starts with the Sound for Movement-derived visual foundation rebuilt in React for Sites: Lato, open layouts, dark and light themes, responsive behavior, and shared controls. The neutral installation uses plain labels and contains no artist media.

Setup begins by choosing the capabilities the artist wants to use. ChatGPT Work and Codex then build a bounded checklist for those choices, inspect only artist-approved local folders, and prepare one exact proposal. Preview performs zero product writes. Apply requires approval tied to the exact proposal hash and current source state.

Approved content enters the existing application:

- structured records go to Sites-provided D1;
- approved music, images, video, documents, and derivatives go to Sites-provided R2; and
- the public pages, player, account, access controls, and administration read those records through their normal interfaces.

Local paths remain in ignored local configuration. Imported content does not replace the visual foundation or create a separate content-specific website.

The setup contract and commands are documented in [SETUP.md](SETUP.md).

## Try it with ChatGPT Work

Open Work in the ChatGPT desktop app. Add any context document and asset folders you want it to use. Then paste this prompt:

```text
Use @Sites and this repository as the source for my musician website:
https://github.com/sunflower-of-parchman/a-op

Open the repository through my connected GitHub account. Create a fork in my account if you have permission. If Work cannot open or fork it, stop and tell me the exact access I need to provide. Do not recreate the application from scratch.

Read AGENTS.md, PRODUCT.md, README.md, SETUP.md, plans/migrateAopToSites.md, and the relevant contracts in docs/architecture/ before changing the application.

First ask which supported capabilities I want to use. Then ask me to choose one starting path:

1. Use my attached context document and inspect only the asset folders I approve.
2. Start blank and help me add material album by album, track by track, and page by page.

Keep the complete neutral visual framework, routes, navigation, player, access controls, and administration. Empty content is okay. Do not invent artist material, prices, license terms, legal decisions, or publication choices.

Before changing product content or code, show me the exact information checklist and setup proposal. Wait for my approval.

After approval, use the existing setup flow and product repositories. Structured state belongs in D1. Approved files belong in R2. Keep identity and protected access on the server. Use Stripe Test mode only if I activate commerce.

Run the result as a private preview. Report what works, what still needs my input, and what failed. Do not publish the Site, connect a domain, use live Stripe credentials, or change repository visibility without my specific approval.
```

This first run tests the full handoff from the repository and optional artist context into the existing application. The neutral installation remains usable when no content is supplied.

## Stripe Test Mode

The Sites build contains a test-only commerce simulation for checkout, orders, memberships, subscriptions, credits, licensing, entitlements, and protected delivery.

It accepts Stripe test credentials only. Stripe-hosted Test Checkout handles test payment entry. The application verifies webhook signatures, rejects live credentials and live-mode events before product writes, and stores no card fields. No real payment is accepted and no money moves.

Stripe is an installation requirement only when the artist activates commerce. Setup records frozen membership, subscription, and license products as pending bindings. An owner connects each one to its matching Stripe Test `price_…` identifier in Commerce administration; the application activates the exact linked plan or license terms, application product, price, and license offer together.

The external acceptance rehearsal completed in Stripe Test mode on July 20, 2026. One hosted subscription checkout produced a provider-signed invoice, fulfilled order, active subscription and membership, two Course entitlements, and 15 download credits. One hosted license checkout fulfilled an approved request, issued the license, granted its track and document entitlements, and queued document generation. The rehearsal also confirmed provider-event ordering and Stripe's current hosted-page and invoice payload shapes. Its local D1, R2, credential, and media state was removed afterward; task-created Test subscriptions were canceled, Test customers were deleted, and Test products and prices were archived. Stripe retains its normal sandbox event and completed-session history. Live commerce is unavailable in the Sites deployment.

See [docs/architecture/commerce-environment.md](docs/architecture/commerce-environment.md) for the exact boundary.

## Storage, identity, and model use

Sites hosts the React, TypeScript, vinext, Vite, and Cloudflare Worker application. Sites-provided D1 stores structured state. Sites-provided R2 stores approved files. Sign in with ChatGPT supplies identity, while server-owned roles and the central access contract decide what each person can read, change, stream, or download.

Ordinary use of the website makes no model request. Material enters ChatGPT Work only when the artist deliberately shares it in a task. [docs/architecture/data-and-ai-boundary.md](docs/architecture/data-and-ai-boundary.md) records the full boundary.

## Current release state

The Sites application compiles and produces its Worker deployment output. The repository contains the complete product domains and their local verification suites. The working tree contains no Sound for Movement media, demo proposal, local D1 or R2 state, hosted test account file, or Stripe credential file.

Before submission, the one-shot installer still needs a clean-state exercise against artist-approved source material. The exact approved Sites version must then be saved and deployed with Michael's approval.

The controlling implementation record is [plans/migrateAopToSites.md](plans/migrateAopToSites.md). The product contract is [PRODUCT.md](PRODUCT.md).

## Ownership and license

An artist operates a fork of `a-op` as their own site. They control their deployment, content, catalog, data, customer relationship, and artist-specific source changes. Artists retain ownership of their music, images, writing, video, course material, artist-authored code and source changes, and business data.

`a-op` is licensed under the GNU Affero General Public License v3.0 or later. See [LICENSE](LICENSE).
