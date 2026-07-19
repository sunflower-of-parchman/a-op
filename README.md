# a-op

**a-op: artist-owned platform** is an open-source web application for musicians.

It gives artists their own music publishing, streaming, distribution, customer access, memberships and subscriptions, licensing, Courses, video, contact, telemetry, and administration in one application.

Music comes first. An artist publishes releases and tracks, listeners stream through the artist's Site, customers sign in and build a library, and memberships, subscriptions, licenses, credits, and artist-issued grants create durable access.

The complete product description is in [PRODUCT.md](PRODUCT.md). The end-to-end implementation path is in [plans/migrateAopToSites.md](plans/migrateAopToSites.md).

## Complete from the first launch

Every installation starts from the visual framework Michael Wall developed for Sound for Movement, rebuilt in React for Sites with plain `a-op` labels and placeholders. It includes Lato, exact dark and light themes, open layouts, established interface primitives, and responsive behavior. The neutral installation contains no temporary imagery; each artist adds only material approved for their Site.

Artists add their own music, writing, images, video, collaborators, Courses, access plans, and terms. ChatGPT Work and Codex can then reshape the visual system, page structure, navigation, names, active capabilities, and source code through natural-language collaboration.

The exact starting system is recorded in [docs/architecture/visual-direction.md](docs/architecture/visual-direction.md).

## Choose the capabilities

Music publishing, catalog, streaming, identity, access, and administration form the core. An artist can begin with streaming alone and add capabilities as their work grows:

- Downloads, customer libraries, protected delivery, and access history.
- Licensing options, license credits, issued licenses, documents, and history.
- Memberships and subscriptions with recurring access, renewal dates, cancellations, and included benefits.
- Courses, mixed-media lessons, access rules, progress, and resume.
- Video pages, transcripts, artist context, and privacy-aware playback.
- What's New updates with unread state.
- Contact forms and inquiry management.
- First-party telemetry, consent, retention, privacy, and terms.

Navigation, administration, setup, jobs, and telemetry follow the capabilities active in that installation.

## Own the fork and the work

An artist operates a fork of `a-op` as their own site. They control their deployment, content, catalog, data, customer relationship, and artist-specific changes. The shared source is licensed under `AGPL-3.0-or-later`.

Artists retain ownership of their music, images, writing, video, course material, artist-authored code and source changes, and business data. OpenAI's [Terms of Use](https://openai.com/policies/terms-of-use/) state that users retain ownership rights in their input and own their output as between themselves and OpenAI.

## Build Week commerce demonstration

The complete platform contains one commerce domain connecting checkout, orders, memberships, subscriptions, licensing, credits, entitlements, customer accounts, and protected delivery.

The Build Week Sites installation runs that domain in Stripe Test Mode only. It accepts no real payment and moves no money. Stripe-hosted Test Checkout receives Stripe-provided test payment methods; `a-op` never collects or stores card fields. Signed test webhooks complete simulated orders and create the same durable access records used throughout the application. Live credentials and live-mode events fail before any state change, and the Sites installation has no administration control that can enable live commerce.

Sites calls every deployed Site URL a production URL. That describes the hosted Site, not its Stripe environment. Every Build Week URL remains permanently locked to Stripe Test Mode. The complete boundary and judge journey are defined in [the commerce environment contract](docs/architecture/commerce-environment.md).

A future deployment environment may support production commerce only after the artist verifies that environment's current rules and technical support, deliberately enables the capability, passes live-mode validation, and approves activation.

## ChatGPT Work and Sites

Artists use ChatGPT Work and Codex to create, configure, personalize, maintain, diagnose, and verify their installation.

Sites hosts the React application. Sites-provided D1 stores structured product state. Sites-provided R2 stores music, images, video, documents, and exports. Sign in with ChatGPT establishes identity. Server-owned roles and the central access contract protect administration, streams, downloads, course material, licenses, and customer records.

Artists add music to their Site from an approved local path or through administration. Local tools prepare the approved files, R2 stores the bytes, and D1 stores metadata and access rules. Ordinary Site operation makes no model request. Material enters ChatGPT Work only when the artist deliberately shares it there. [The data and AI boundary](docs/architecture/data-and-ai-boundary.md) records the complete contract.

## Setup, approved media, and portability

[SETUP.md](SETUP.md) gives ChatGPT Work and Codex one fourteen-topic setup contract. The artist's decisions become a strict, canonical proposal tied to the current source-state fingerprint. Preview compiles the complete operation plan with `writesPerformed: 0`. Approval is a separate artifact bound to the exact proposal hash, source fingerprint, artist-owner, and approved scopes. The owner-only apply boundary recomputes current state, runs fixed internal operations, and records aggregate and domain receipts so an exact replay returns the existing result. Hosting, domains, DNS, email delivery, repository visibility, and public media uploads keep their own action-specific approvals and remain outside Site apply.

Media proposals contain stable local aliases, rights confirmation, intended use, hashes, and fixed derivative profiles. Full machine paths stay in ignored local configuration. Publication requires the exact applied setup proposal and owner approval before R2 receives bytes. The server enforces its configured request-byte cap, writes the approved object to a content-addressed private R2 key, reads it back, and verifies its byte length, content type, SHA-256 value, and approval metadata before D1 can publish the ready pointer. Exact retries reuse the verified immutable object. The neutral installation, documentation, and verification flow create no temporary media assets. [The media processing contract](docs/architecture/media-processing-contract.md) records the full lifecycle.

The owner-only portability flow exports customer-independent artist definitions across identity, modules, navigation, pages, catalog, access plans, membership and subscription definitions, commerce definitions, licensing, Courses, video, updates, contact, telemetry, legal versions, and media manifests. The versioned archive carries fixed document paths, per-document checksums, and one semantic fingerprint. It contains no customer activity, provider payload, credentials, local paths, private R2 key, or media bytes. Commerce prices and external-video bindings return as `pending` for deliberate reconnection. Verification checks every manifest entry before a disposable local restore; a second restore pass must reuse every definition, create zero duplicates, and reproduce the same semantic fingerprint.

## Build order

1. Official Sites foundation, exact visual foundation, and runtime proof.
2. Module registry, artist state, roles, authorization, and shared application shells.
3. Music catalog, publishing, streaming, and player.
4. Customer accounts, saved music, libraries, and delivery.
5. Memberships, subscriptions, credits, licensing, access grants, and entitlements.
6. Courses, video, pages, What's New, and contact.
7. Telemetry, consent, privacy, terms, and operations.
8. ChatGPT Work setup, local media preparation, personalization, export, diagnosis, and recovery.
9. Complete integration and approved Sites hosting.

Every milestone ends in integrated behavior that can be exercised in the running application. Focused automated checks protect authorization, media access, migrations, and durable data.

## Current implementation

The private GitHub repository is [sunflower-of-parchman/a-op](https://github.com/sunflower-of-parchman/a-op).

The active application uses the official Sites React, TypeScript, vinext, Vite, and Cloudflare Worker structure with Sites-provided D1 and R2 bindings. The controlling plan records the behavior and verification completed at each milestone. Git history carries the earlier Nuxt implementation.

## Sound for Movement reference

Michael explicitly authorized the Sound for Movement visual framework as the starting framework for `a-op`. The live company repository remains private and read-only. Its visual system and generalized functional lessons inform fresh React code. Each `a-op` installation supplies its own name, music, media, writing, Courses, customer records, access plans, terms, accounts, and production state.

## Authority

Michael directs writing, media rights, access plans, licensing terms, legal language, connected accounts, and publication.

Public deployment, domains, DNS, repository visibility, email delivery, and public media uploads each use action-specific approval. Local development, fictional data, and deterministic simulation support the complete build before those activation points.

## License

`a-op` is licensed under the GNU Affero General Public License v3.0 or later. See [LICENSE](LICENSE).
