# a-op

**a-op: artist-owned platform** is an open-source web application for musicians.

It gives artists their own music publishing, streaming, distribution, customer access, memberships and subscriptions, licensing, Courses, video, contact, telemetry, and administration in one application.

Music comes first. An artist publishes releases and tracks, listeners stream through the artist's Site, customers sign in and build a library, and memberships, subscriptions, licenses, credits, and artist-issued grants create durable access.

The complete product description is in [PRODUCT.md](PRODUCT.md). The end-to-end implementation path is in [plans/migrateAopToSites.md](plans/migrateAopToSites.md).

## Complete from the first launch

Every installation starts from the complete visual framework Michael Wall developed for Sound for Movement, rebuilt in React for Sites with plain `a-op` labels and placeholders. It includes Lato, exact dark and light themes, open layouts, established interface primitives, responsive behavior, and the living image mosaic.

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

Artists retain ownership of their music, images, writing, video, course material, code, and business data. OpenAI's [Terms of Use](https://openai.com/policies/terms-of-use/) state that users retain ownership rights in their input and own their output as between themselves and OpenAI.

## ChatGPT Work and Sites

Artists use ChatGPT Work and Codex to create, configure, personalize, maintain, diagnose, and verify their installation.

Sites hosts the React application. Sites-provided D1 stores structured product state. Sites-provided R2 stores music, images, video, documents, and exports. Sign in with ChatGPT establishes identity. Server-owned roles and the central access contract protect administration, streams, downloads, course material, licenses, and customer records.

Artists add music to their Site from an approved local path or through administration. Local tools prepare the approved files, R2 stores the bytes, and D1 stores metadata and access rules. Ordinary Site operation makes no model request. Material enters ChatGPT Work only when the artist deliberately shares it there. [The data and AI boundary](docs/architecture/data-and-ai-boundary.md) records the complete contract.

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

## Current transition

The private GitHub repository is [sunflower-of-parchman/a-op](https://github.com/sunflower-of-parchman/a-op).

The next implementation milestone replaces the current Nuxt application tree with the current official Sites starter, ports the complete visual foundation, and builds the functional sequence above. Git history carries the earlier implementation.

## Sound for Movement reference

Michael explicitly authorized the Sound for Movement visual framework as the starting framework for `a-op`. The live company repository remains private and read-only. Its visual system and generalized functional lessons inform fresh React code. Each `a-op` installation supplies its own name, music, media, writing, Courses, customer records, access plans, terms, accounts, and production state.

## Authority

Michael directs writing, media rights, access plans, licensing terms, legal language, connected accounts, and publication.

Public deployment, domains, DNS, repository visibility, email delivery, and public media uploads each use action-specific approval. Local development, fictional data, and deterministic simulation support the complete build before those activation points.

## License

`a-op` is licensed under the GNU Affero General Public License v3.0 or later. See [LICENSE](LICENSE).
