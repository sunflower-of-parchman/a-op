# Configuration authority

This contract assigns one authoritative location to each kind of configuration. It prevents an artist's administration changes, repository defaults, setup state, and service secrets from drifting into conflicting copies.

## Contract and bootstrap defaults

`shared/schemas/artistConfig.ts` defines the validated public configuration contract. All setup proposals, database records, exports, and administrative requests must conform to this schema or a narrower schema derived from it.

`artist.config.ts` contains bootstrap defaults and the redistribution-safe fictional demonstration identity. It initializes a new database and allows static tooling to understand available features. After initialization, it is not authoritative for artist-editable runtime values.

## Runtime artist settings

Supabase database tables are authoritative for artist-editable runtime identity, design tokens, navigation, pages, feature settings, contact details, product presentation, licensing presentation, learning presentation, and telemetry preferences. The authenticated administration workspace writes these values through validated server routes. Published pages read the active database version so approved changes appear without a source-code edit or rebuild.

Draft and published states must be explicit. Preview reads the selected draft. Public pages read only the published version. Export commands serialize the current working database state through the shared schema.

## Secrets and private service configuration

Environment variables and connected service secret stores are authoritative for Supabase server credentials, Stripe secret and webhook values, OAuth client secrets, mail-provider credentials, worker credentials, and other private deployment settings. Secrets never enter `artist.config.ts`, database content tables, setup proposals, `setup/project-state.json`, logs, diagnostics, screenshots, or Git.

`.env.example` documents required names and expected non-secret formats. A server-only `ServiceConfig` schema validates presence and shape while redacting values from all output.

## Installation state

`setup/project-state.json` records non-secret setup facts: schema version, enabled modules, completed checks, selected deployment modes, and remaining approval-gated actions. It is a status ledger, not an authority for public content or secrets. `npm run setup:check` must be able to regenerate or reconcile it from safe checks.

## Portable snapshot

`npm run export:artist` produces a versioned portable snapshot of runtime artist settings and content. `npm run export:verify` validates the snapshot against the shared schemas. The snapshot excludes secrets and replaces external service identifiers with redacted connection descriptors or artist-approved portable mappings.

## Write lifecycle

The Codex-guided setup lifecycle is:

    interview
    -> structured proposal
    -> validated preview and diff
    -> explicit human approval
    -> deterministic application
    -> verification
    -> project-state update

`npm run setup:interview` emits the interview contract. Codex asks the questions conversationally and writes `setup/proposals/<proposal-id>.json`. `npm run setup:preview -- <proposal>` validates the file and shows intended changes without mutating state. After explicit approval is recorded, `npm run setup:apply -- <proposal> --confirm-approved-proposal` applies deterministic changes only to the local installation. It runs `npm run setup:check` before recording personalization and remaining external checkpoints in `setup/project-state.json`. Applying the same approved proposal again is idempotent.

Application code must never choose between two conflicting sources at runtime. If a field becomes artist-editable, migrate its authority into the database and leave only a bootstrap default in `artist.config.ts`. If a field becomes secret, migrate it to environment configuration and remove it from public schemas and exports.
