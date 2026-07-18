# Product contract

## Purpose

`a-op: artist-owned platform` is an open-source web application for musicians. It gives artists a complete site for publishing, streaming, licensing, and delivering music, together with the customer access and administration needed to run the work directly.

Artists can activate memberships, subscriptions, Courses, video, downloads, licensing, What's New, contact, telemetry, and legal-document tools as they need them. The same artist, catalog, account, access, and administration contracts connect every active capability.

## Deployment and ownership

One deployment is an artist's public site and working administration area. It supports owner and editor accounts, customer accounts, and public visitors.

An artist takes a fork of `a-op`, controls its deployment, and retains ownership of their music, images, writing, video, course material, code, business data, catalog, configuration, customer relationship, and artist-specific changes. OpenAI's [Terms of Use](https://openai.com/policies/terms-of-use/) state that users retain ownership rights in their input and own their output as between themselves and OpenAI. The shared source remains available under `AGPL-3.0-or-later`, including its obligations when a modified version is offered over a network.

ChatGPT Work and Codex help the artist build and operate their fork through natural language. The deployed public, customer, and administration experiences run as complete web software.

## Starting visual framework

Every installation begins with the complete visual foundation in `docs/architecture/visual-direction.md`: Lato, exact light and dark themes, open composition, established primitives, functional layouts, and the living image mosaic. Plain `a-op` labels, placeholders, and general names leave clear places for the artist's own material.

The artist can later change any part of the visual system, structure, navigation, nomenclature, or module composition in their fork with ChatGPT Work and Codex.

## People and authority

The artist directs:

- identity, writing, navigation, imagery, and publication;
- music, artwork, video, course material, credits, provenance, and rights;
- membership and subscription structures, licensing templates, usage terms, access rules, and customer policies;
- domain, collaborators, privacy choices, and external publication; and
- which product capabilities are active.

Codex performs repository setup, reviewed source changes, configuration proposals, migrations, verification, media preparation against artist-approved paths, diagnostics, documentation, exports, and recovery. External publication changes pause for the artist's approval.

## Roles

An `owner` controls installation-wide settings, trusted operators, legal documents, exports, and publication. An `editor` maintains assigned content and media. A `customer` controls their own profile, playlists, favorites, memberships, subscriptions, licenses, entitlements, downloads, and course progress. An anonymous visitor receives intentionally published public material.

Official Sites identity helpers establish identity. Server-owned D1 role records and the central access contract authorize actions.

## Complete capability set

The complete codebase includes:

1. Artist identity, navigation, structured pages, drafts, previews, publication, and revision history.
2. Releases, tracks, collections, credits, taxonomies, artwork, original audio, derivatives, waveforms, streaming, queue, playlists, favorites, and history.
3. Downloads, memberships, subscriptions, renewal dates, cancellations, customer libraries, access grants, credits, and auditable entitlements.
4. Artist-defined licensing options, supported uses, versioned terms, inquiries, approvals, credit redemption, issued licenses, protected documents, and history.
5. Courses, lessons, structured mixed media, progress, public and entitled access, video, transcripts, and editorial publishing.
6. What's New, unread state, contact forms, consent records, inquiry administration, first-party telemetry, aggregate artist metrics, privacy, and terms.
7. ChatGPT Work setup and maintenance, local media preparation, diagnostics, export, verification, and recovery.

Music publishing, catalog, streaming, identity, access, and administration form the core installation. The module registry activates the capabilities the artist chooses and preserves their durable state as the installation grows.

## Data and protected access

Sites-provided D1 owns structured product state. Sites-provided R2 owns media and document bytes. Git owns source and non-secret defaults. Server-managed runtime values own secrets. `docs/architecture/data-and-ai-boundary.md` defines how these systems relate to ChatGPT Work.

Artist-controlled grants, active memberships and subscriptions, issued licenses, and credit redemption create auditable access state. Every protected stream, download, course asset, document, and private customer record passes through `decideAccess`.

## Current Sites runtime scope

The current Sites implementation is a non-financial web experience carrying catalog, delivery, membership, subscription, credit, licensing, entitlement, and customer-history state. Current official [Sites guidance](https://learn.chatgpt.com/docs/sites#understand-limits-and-unsupported-uses) defines this runtime scope. Any future transaction work begins with a fresh official-policy check and an approved architecture decision.

## Portability

The platform produces a versioned artist export containing configuration, catalog and content records, access definitions, membership and subscription definitions, licensing definitions, media manifests, checksums, and recovery instructions. Customer-data and hosted backup exports receive their own privacy review and artist-approved destination.

## Completion

A capability is complete when its public or administrative workflow runs end to end, stores the intended durable state, enforces authority on the server, works in both themes and responsive layouts, survives the production build, and passes a focused human-observable journey.
