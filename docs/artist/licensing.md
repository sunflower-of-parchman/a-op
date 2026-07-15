# Publish artist-controlled music licenses

The licensing system lets an artist publish a small set of clearly supported, non-exclusive uses for individual tracks. A buyer sees the complete use, audience, distribution, term, territory, attribution, and price before checkout. Unusual, broadcast, commercial, or exclusive requests go to the artist's inquiry page instead of an automated checkout.

This repository demonstrates a business workflow and an auditable record. Its sample language is not legal advice. Before using licenses in a live business, the artist should have the terms reviewed for the music, jurisdiction, and uses they intend to support.

## Install the document renderer

The application issues license authority in PostgreSQL. A separate worker renders the resulting immutable snapshot as a private PDF. Install Python 3.12 or newer and create the repository's ignored, isolated renderer environment:

    npm run setup:documents

The setup command uses `python3` by default. Set `DOCUMENT_BOOTSTRAP_PYTHON` when the Python used to create the environment has another name. The worker automatically uses `.venv-documents`; a hosted worker or existing managed environment can still select another executable:

    export LICENSE_DOCUMENT_PYTHON=/absolute/path/to/python3

Run one pass over pending jobs with:

    npm run documents:work

For a long-running local or hosted worker, use:

    npm run documents:watch

The worker reads the server-only Supabase URL and secret already used by the application. It does not require Stripe credentials and never receives card information.

## Publish supported uses

1. Sign in as the installation owner and open `/admin/licensing`.
2. Select a published track and describe the license as a whole.
3. Add one or more complete supported-use options. Every option must name its media, audience, distribution, term, territory, attribution rule, and price.
4. Publish the template. For a later change, choose **Create revised version**.
5. If Stripe test mode is connected, open `/admin/commerce` and map the newly created license product and price to the corresponding Stripe test product and price.

Published versions and options are immutable. A revision archives the prior offers and creates a new version with new products and prices. Existing selections and issued licenses continue to point to the exact version the buyer saw.

The public `/licensing` page owns license checkout. License products are deliberately excluded from the generic `/support` store because a license requires the buyer's licensee identity and exact project description before payment.

## Local and Stripe test checkout

In local demonstration mode, checkout is visibly labeled as a simulation and never contacts Stripe. It still enters the same transactional fulfillment authority used by verified Stripe events.

Before checkout, the server creates an immutable selection snapshot containing:

- the artist, track, template, version, and selected option;
- the licensee name, project title, and exact project description;
- the complete supported-use terms and general terms;
- the price and currency shown to the buyer.

A verified payment atomically creates the order, issued license, private document job, and entitlement. Provider-event and fulfillment uniqueness make webhook replay safe. A full refund revokes the issued license and its entitlement.

Use Stripe test mode only through the approval-gated procedure in [`commerce.md`](commerce.md). Live mode remains a separate business decision.

## Private document delivery

The `license-documents` storage bucket is private. The worker claims a durable job with a lease, renders the frozen selection, uploads the PDF, and marks the document ready. The account API uses the central entitlement decision before returning a short-lived signed URL.

Customers can see only their own issued licenses. A second authenticated customer receives a denial for both the license record and document. Raw document storage paths are never exposed through public catalog data.

If document generation fails, the owner sees the redacted failure state in `/admin/licensing` and can retry it. A retry creates another claim for the same issued license; it does not create a second license or change the frozen terms.

## Hosted worker contract

The tracked [`workers/documents/Dockerfile`](../../workers/documents/Dockerfile) is the supported deployed path. Supply these runtime variables through the worker host's secret manager:

- `NUXT_PUBLIC_SUPABASE_URL`
- `NUXT_SUPABASE_SECRET_KEY`
- optional `LICENSE_DOCUMENT_WORKER_ID`
- optional `LICENSE_DOCUMENT_PYTHON` when the executable is not `python3`

The worker needs outbound HTTPS access to the installation's Supabase API and Storage service. It needs no inbound public port. Run one replica first; database leases also make concurrent replicas safe. Deployment is approval-gated and is verified separately from the local worker path.

## Verify and recover

With local Supabase running, use:

    npm run verify:licensing
    npm run test:e2e -- tests/e2e/licensing.spec.ts

The authority test proves immutable terms, exact price snapshotting, replay-safe issue, private PDF rendering and extraction, cross-account isolation, and refund revocation. The browser journey proves visible terms, labeled local checkout, account history, protected delivery, inquiry routing, owner versioning controls, accessibility, and responsive layout.

If a PDF remains pending, run `npm run documents:work`. If it fails, inspect the redacted owner status, correct the worker environment, and use the retry control. Do not edit an issued license or its source version to repair a document; the immutable database snapshot is the authority.
