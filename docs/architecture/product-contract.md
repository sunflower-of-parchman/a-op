# Product contract

## Purpose

Artist-Owned Platform gives one musician or artist-led organization a permanent digital home they can operate with Codex. The artist can publish and organize work, listen with their audience, sell downloads, issue music licenses, offer memberships, teach, share video and writing, understand first-party activity, and move the installation when their needs change.

The website is owned and branded by the artist. It may coexist with streaming, social, marketplace, and distribution platforms. Those services can remain useful channels; this installation is the artist's lasting home and direct relationship.

## Supported deployment model

One installation represents one artist, ensemble, composer, accompanist, or artist-led organization. It supports multiple owner and editor accounts and many visitor or customer accounts. It is not a shared marketplace containing unrelated artists.

The initial supported stack is Nuxt 4 and TypeScript, Supabase for PostgreSQL, authentication, authorization, and storage, Stripe for transactions and subscriptions, and Vercel Services as the first documented web host. The Nuxt application is the only public service; separate request-driven media and document containers perform FFmpeg and PDF work through private bindings while Supabase remains their durable queue. Both images remain portable to other HTTP-capable container hosts.

## People and authority

The artist owns and decides:

- Identity, design direction, writing, navigation, and publication.
- Music, artwork, video, teaching material, credits, and rights.
- Prices, membership structure, licensing templates, usage terms, refunds, and customer policies.
- Service accounts, budgets, domain, collaborators, privacy choices, and external publication.

Codex performs:

- Repository setup, configuration proposals, deterministic application, and validation.
- Generalization, implementation, migrations, tests, debugging, documentation, and maintenance.
- Media inspection and organization using artist-approved files and artist-confirmed rights.
- Preparation of external-service changes followed by an explicit human approval gate.

The public visitor experience does not require a model call or OpenAI API key.

## Roles

An `owner` controls installation-wide settings, administrator access, commerce connections, privacy policy, and publication. An `editor` maintains approved content and media without changing server-owned payment facts or owner-only settings. A `customer` controls their own profile, playlists, favorites, orders, subscriptions, licenses, entitlements, downloads, and progress. An anonymous visitor can access only intentionally published public material.

Authorization never relies on user-editable profile metadata. Roles use server-controlled application metadata and database records, with sensitive actions validated against current server state.

## Complete product modules

The complete Build Week product includes:

1. Artist identity, semantic design tokens, navigation, structured pages, preview, and publication.
2. Albums, tracks, collections, credits, taxonomies, artwork, source audio, generated previews and waveforms, listening, queues, playlists, favorites, and history.
3. Products, prices, cart or checkout intent, one-time purchases, downloads, memberships, subscriptions, customer portal access, refunds, cancellations, and auditable entitlements.
4. Artist-configured license templates, supported usage selection, explained price, checkout, immutable issued terms, protected license documents, inquiries for unsupported uses, and artist and customer history.
5. Learning areas, paths, courses, lessons, structured mixed media, progress, public and entitled access, video, and editorial publishing.
6. First-party telemetry, consent behavior, aggregate artist metrics, operational status, redacted diagnostics, and recovery tools.
7. Codex-guided setup and maintenance, deterministic proposals, local and deployed media processing, clean-clone verification, export, restore checks, and judge access.

Every module is part of the Build Week completion standard.

## Authority and protected access

Supabase authentication establishes identity. Explicit database privileges and Row Level Security determine which records an identity may access. Signed Stripe webhooks establish payment facts. Transactional fulfillment creates orders and entitlements. The central access decision evaluates public status, ownership, purchases, licenses, memberships, administrator role, expiry, and revocation whenever protected content is requested.

No browser return page, client-side state, editable metadata, or URL alone can create access. Private media and documents are delivered through short-lived signed URLs after a server-side access decision.

## Artist ownership

The artist owns the repository, domain, connected service accounts, content, customer relationship, configuration, and export. The platform must produce a versioned portable snapshot, hashed media inventory, database and customer-data procedures, redacted service manifest, and restore check. Large media may remain separately stored when the export includes a verified retrieval path.

Open-source software does not make every connected service free. Setup and documentation must identify possible domain, hosting, storage, email, and payment-processing costs before an external action is approved.

## External-action boundary

The project may prepare deployments, service connections, DNS records, live Stripe configuration, email, repository publication, judging access, video upload, and Devpost submission. It performs none of those external actions without Michael's explicit approval for the specific action.

## Completion evidence

A feature is complete when its production-shaped behavior exists, uses the shared authority model, passes automated tests, survives the defined manual or judge journey, is documented, and is recorded in `docs/submission/capability-evidence.md`. Similar behavior in the private Sound for Movement reference is provenance, not proof of Build Week implementation.
