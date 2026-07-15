# Privacy-conscious analytics and operational status

The platform keeps optional audience analytics and required operational health in separate tables, APIs, interfaces, and retention models. Declining analytics never prevents authentication, checkout, protected delivery, learning progress, contact storage, or system-health checks from working.

## Optional audience analytics

The public site records only the event names declared in `shared/schemas/telemetry.ts`. An event can contain a random browser-session identifier, an internal path, an allowlisted artist-resource type and slug, a bounded numeric value, the consent state, and a timestamp. It cannot contain an account identifier, email, IP address, user-agent string, referrer, search phrase, arbitrary metadata, or external URL.

The default policy is explicit opt in with a 90-day retention window. The artist owner can disable collection, choose explicit or implied consent, change retention between 7 and 730 days, and choose the meaningful-listen threshold. The server rechecks the policy for every event. It also rejects collection when the request carries Global Privacy Control (`Sec-GPC: 1`) or Do Not Track (`DNT: 1`), even if the browser previously granted consent.

Visitors can change their stored choice on `/privacy`. The choice is local to that browser. The random analytics identifier lives only in session storage and is replaced when the browser session ends. Catalog search records a result count, never the query text.

Expired events are pruned during collection and by the explicit `prune_analytics_events` database function. The owner view at `/admin/telemetry` returns 30-day aggregates only. Raw analytics tables have forced row-level security, no anonymous or authenticated grants, and no raw-event administration endpoint.

## Operational health

Operational records describe the installation rather than its audience. The setup checker writes one redacted current-state record and an append-only operational event. `/admin/system` derives redacted checks for:

- expected database migration;
- seven storage boundaries;
- failed or unfinished audio-processing jobs;
- failed or unfinished license-document jobs;
- unresolved payment webhooks;
- presence of both server-only Stripe test settings;
- local or deployed contact delivery state;
- the latest setup verification.

The interface returns counts and supported actions. It never returns credentials, URLs, account identities, storage object paths, checkout identifiers, webhook identifiers, or raw error payloads.

Run the shareable local diagnostic with:

    npm run diagnose

Machine-readable output is available with `node scripts/diagnose.mjs --json`. It follows the same redaction boundary and includes audience aggregates rather than raw events or session identifiers.

## Verification

With local Supabase running:

    npm run setup:check
    npm run verify:telemetry
    npm run test:e2e -- tests/e2e/telemetry.spec.ts

The authority test proves raw-table denial, explicit-consent collection, event idempotency, implied-consent rejection in opt-in mode, the global disable switch, retention pruning, operational separation, and diagnostic redaction. The browser journey proves visitor choice, named product events, owner aggregates, Global Privacy Control behavior, owner-only status access, responsive layout, and critical/serious accessibility checks.
