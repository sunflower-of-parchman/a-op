# a-op

**a-op: artist-owned platform** is an open-source web application for musicians.

An artist can publish music, stream it through their own site, manage customer access, deliver downloads, issue licenses, offer memberships and subscriptions, publish Courses and video, receive inquiries, and run the work from one administration area.

Music is the center of the application. The catalog, player, customer accounts, access records, licensing, memberships, Courses, and administration all use the same artist, account, media, and authorization system.

## Website sections

### Home

The home page introduces the artist's current work. It can show approved imagery, the latest release, current Courses, a featured video, an About introduction, and direct paths to Membership and Licensing. Empty sections stay out of the page until the artist publishes material for them.

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

### Privacy, Terms, and FAQ

Privacy and Terms begin with editable starter documents. They remain identified as starters until the artist reviews, approves, and publishes a version. Published versions keep their history.

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

## Starting an installation

Every installation starts with the Sound for Movement-derived visual foundation rebuilt in React for Sites: Lato, open layouts, dark and light themes, responsive behavior, and shared controls. The neutral installation uses plain labels and contains no artist media.

Setup begins by choosing the capabilities the artist wants to use. ChatGPT Work and Codex then build a bounded checklist for those choices, inspect only artist-approved local folders, and prepare one exact proposal. Preview performs zero product writes. Apply requires approval tied to the exact proposal hash and current source state.

Approved content enters the existing application:

- structured records go to Sites-provided D1;
- approved music, images, video, documents, and derivatives go to Sites-provided R2; and
- the public pages, player, account, access controls, and administration read those records through their normal interfaces.

Local paths remain in ignored local configuration. Imported content does not replace the visual foundation or create a separate content-specific website.

The setup contract and commands are documented in [SETUP.md](SETUP.md).

## Stripe Test Mode

The Sites build contains a test-only commerce simulation for checkout, orders, memberships, subscriptions, credits, licensing, entitlements, and protected delivery.

It accepts Stripe test credentials only. Stripe-hosted Test Checkout handles test payment entry. The application verifies webhook signatures, rejects live credentials and live-mode events before product writes, and stores no card fields. No real payment is accepted and no money moves.

The application contract is covered by local tests. A real Stripe-hosted Test Checkout and provider-delivered test webhook have not yet completed the final external acceptance rehearsal. Live commerce is unavailable in the Sites deployment.

See [docs/architecture/commerce-environment.md](docs/architecture/commerce-environment.md) for the exact boundary.

## Storage, identity, and model use

Sites hosts the React, TypeScript, vinext, Vite, and Cloudflare Worker application. Sites-provided D1 stores structured state. Sites-provided R2 stores approved files. Sign in with ChatGPT supplies identity, while server-owned roles and the central access contract decide what each person can read, change, stream, or download.

Ordinary use of the website makes no model request. Material enters ChatGPT Work only when the artist deliberately shares it in a task. [docs/architecture/data-and-ai-boundary.md](docs/architecture/data-and-ai-boundary.md) records the full boundary.

## Current release state

The Sites application compiles and produces its Worker deployment output. The repository contains the complete product domains and their local verification suites.

Before submission, the current working branch still needs its changed interface and setup tests brought back into agreement, the one-shot installer exercised from a clean state, the Stripe Test provider rehearsal resolved or explicitly left out, and the exact approved Sites version saved and deployed.

The controlling implementation record is [plans/migrateAopToSites.md](plans/migrateAopToSites.md). The product contract is [PRODUCT.md](PRODUCT.md).

## Ownership and license

An artist operates a fork of `a-op` as their own site. They control their deployment, content, catalog, data, customer relationship, and artist-specific source changes. Artists retain ownership of their music, images, writing, video, course material, artist-authored code and source changes, and business data.

`a-op` is licensed under the GNU Affero General Public License v3.0 or later. See [LICENSE](LICENSE).
