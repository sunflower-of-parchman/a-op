# Set up a-op through ChatGPT Work

This guide gives ChatGPT Work and Codex one resumable setup contract for an artist's `a-op` Site. The complete visual foundation is already present. Setup gathers the artist's words, catalog, rights, access plans, relationships, legal drafts, and publication intent, then turns those decisions into one exact proposal.

Setup is a sequence:

    preflight
    -> conversation
    -> source-state fingerprint
    -> proposal
    -> preview
    -> exact-hash approval
    -> deterministic Site apply
    -> public and administrative verification

Local inspection and proposal commands are read-only. They perform no D1, R2, media, Git, hosting, domain, email, repository-visibility, or public-upload write.

## Begin the conversation

Read `AGENTS.md`, `PRODUCT.md`, `PLANS.md`, `plans/migrateAopToSites.md`, the current contracts in `docs/architecture/`, and `docs/provenance.md`. Use the current installed `sites:sites-building` guidance before changing the Sites application. Keep `sites:sites-hosting` unopened until the documented hosting stage and Michael's approval for that exact action.

Start with capability selection. Ask which parts of a-op the artist wants active, then produce a bounded asset and information checklist for those capabilities. After the artist identifies an approved local folder, inspect it without changing the Site and report what is ready, optional, or missing.

Content enters the product through the setup proposal, D1 repositories, and approved R2 media flow. It populates the existing public and administrative interfaces. A local import or rehearsal must not replace the visual foundation, navigation, persistent player, access decisions, or module components with a content-specific page renderer.

Preserve the artist's wording and cover every applicable topic. Inactive capabilities remain recorded as deliberate choices and require no assets:

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

The proposal can include artist-requested visual, structural, naming, navigation, or module source changes. Source changes remain explicit operations reviewed in Git. Setup creates Privacy Policy and Terms and Conditions drafts; the artist approves and publishes exact legal versions separately in administration.

## Preflight

Run from the repository root. The environment-file option lets Node load the ignored local environment without printing its values:

    node --env-file-if-exists=.env scripts/aop-setup.mjs preflight

Preflight confirms the governing files, logical `DB` and `MEDIA` Sites bindings, local media-tool availability, ignored path aliases, the owner bootstrap identity, and the Stripe Test Mode boundary.

A fresh non-runtime-lab production installation requires `AOP_OWNER_BOOTSTRAP_EMAIL` in its server-managed environment. Set it to the email address of the ChatGPT account Michael approved for the one-time artist-owner bootstrap. Missing and malformed values block production preflight without printing the configured value. The test-only runtime laboratory keeps its fixed fictional owner path and does not require this setting.

The Sites commerce adapter is permanently `stripe-test-simulation`. Present malformed credentials and every recognized live credential produce a hard, redacted failure. The read-only setup interview can report an unconfigured inactive commerce journey, while activation requires complete `pk_test_`, `sk_test_`, and `whsec_` values. The Build Week Sites packaging gate is strict: `npm run verify:sites-package` fails clearly when any test credential is absent and runs the complete integrated gate only after the test configuration passes. The proposal, command output, D1, R2, logs, telemetry, audit records, and browser receive no credential or payment-card value.

## Keep machine paths local

Store artist-approved source paths only in ignored `setup/local-paths.json`:

```json
{
  "schemaVersion": "aop.local-path-aliases.v1",
  "aliases": {
    "artist-audio": "/absolute/artist-approved/path"
  }
}
```

Do not paste this file into a ChatGPT Work task. Proposals carry `sourceAlias: "artist-audio"`; local media commands resolve the alias on the artist's machine. Preflight reports only presence and alias count. Full paths never enter proposals, logs, browser output, Site state, or exports.

## Create one exact proposal

Store working proposal JSON under ignored `setup/proposals/`. The exact schema is exported from `lib/setup/index.ts` as `SetupProposal` and versioned as `aop.setup-proposal.v2`.

The top level contains:

- one stable proposal identifier and UTC creation time;
- the current server-owned source-state fingerprint;
- the fixed Stripe Test Mode commerce contract;
- all fifteen required topic objects, including editorial posts, What's New, About, and approved public page heroes;
- media actions expressed through aliases and stable media keys;
- artist-requested source changes; and
- external actions that remain approval-gated.

Validation rejects unknown fields at every level, machine paths, credentials, card-shaped values, payment-entry fields, Stripe and provider payloads, provider object identifiers, unsafe URLs, unsupported modules, broken references, duplicate stable keys, live or unknown commerce modes, and media publication without confirmed rights.

Arrays that represent sets are normalized before hashing. Ordered catalog, navigation, release, Course, and media structures retain their explicit order fields. Object keys are sorted recursively. The proposal hash is SHA-256 over canonical JSON and appears as `sha256:<64 lowercase hexadecimal characters>`.

The proposal contains no approval field. Approval is a separate JSON artifact bound to the exact proposal hash and source-state fingerprint.

## Preview with zero writes

Run:

    node --env-file-if-exists=.env scripts/aop-setup.mjs preview --proposal setup/proposals/<proposal>.json

Preview validates and hashes the proposal, runs preflight, and compiles the complete operation plan. Its output contains fixed action names, stable targets, deterministic operation IDs, idempotency keys, required approval scopes, and blockers. It contains `writesPerformed: 0`.

The same proposal and source fingerprint always produce the same operation IDs. Reordering JSON object keys does not change the proposal hash. Changing any artist word, module, access rule, media action, source change, or external action produces a different hash and requires a new approval.

## Approve the exact hash

The artist-owner approval uses schema `aop.setup-approval.v1` and contains:

- a stable approval identifier;
- the exact proposal identifier, proposal hash, and source-state fingerprint;
- the UTC approval time;
- an ignored account alias for the authenticated artist-owner;
- the exact approved scopes; and
- the statement `I approve this exact proposal hash.`

Supported scopes are `configuration`, `internal-publication`, `media-preparation`, `media-publication`, `source-changes`, `account-authority`, and `legal-drafts`. The compiler derives the scopes required by the proposal. Approval of configuration never authorizes an external action.

Each proposed Sites hosting, custom-domain, DNS, email-delivery, public-media-upload, or repository-visibility action needs its own `aop.external-action-approval.v1` artifact. It binds the exact proposal hash, source fingerprint, action identifier, and canonical action hash to Michael's statement `I approve this exact external action hash.` No local or Site apply route executes an external action.

Check a proposal and approval after the owner-authenticated Site returns the current fingerprint:

    node --env-file-if-exists=.env scripts/aop-setup.mjs check \
      --proposal setup/proposals/<proposal>.json \
      --approval setup/proposals/<proposal>.approval.json \
      --current-source-fingerprint sha256:<current-fingerprint>

Add one `--external-approval` argument for each separately approved external action. A missing or mismatched approval remains blocked. A changed source fingerprint requires a fresh proposal and approval.

## Deterministic Site apply

The owner-authenticated Site apply boundary receives the validated proposal and separate approval artifacts. It recomputes current source state before changing anything. An exact fingerprint match allows fixed operations to run through server-owned repositories.

Every operation carries a stable idempotency key. D1 records one aggregate setup application for the exact proposal and approval. Each domain repository uses the compiled operation identifier for its compare-and-set marker and audit receipt. An exact replay returns the aggregate application and existing domain receipts. Reusing an identifier with changed facts fails. Media preparation and publication reuse the matching approved media object and job identities.

The local media publication command always names the approved logical `mediaKey`. A protected publication accepts no external-action fields. A public publication also requires `--external-approval-alias`, resolved through ignored `setup/local-paths.json`, for the exact `aop.external-action-approval.v1` artifact. The command validates the artifact and proposal hash locally, then sends only its safe action identifier and canonical action hash. Before any R2 write, and again inside the final guarded D1 statements, the Site requires the applied setup result to contain the matching `public-media-upload` receipt for that same media key and Michael's action-specific approval.

Apply can write only the internal boundaries named by its plan:

- D1 artist, module, navigation, catalog, access, membership, subscription, credit, licensing, content, telemetry, legal-draft, account, and publication state;
- R2 and matching D1 metadata for an explicitly approved media-publication operation;
- the artist's Git worktree for an explicitly approved source-change operation performed by Codex; and
- a bounded local media workspace for an explicitly approved local preparation command.

External operations remain outside apply. Legal draft creation never substitutes for the artist's exact legal-version approval. Stripe-hosted Test Checkout remains the only test payment-entry surface, and `No real payment will be accepted.` remains visible throughout the simulated journey.

## Hosted application interfaces

Milestone 9's Site integration implements these owner-only server interfaces with same-origin mutation protection:

- `GET /api/admin/setup` returns the setup workspace plus the current canonical source fingerprint, D1 schema version, setup revision, and resource count. The server builds the strict `SourceStateSnapshot` internally from safe revisions and content hashes; customer activity, provider objects, credentials, local paths, and private object keys remain outside it.
- `POST /api/admin/setup/preview` accepts a proposal, calls `createProposalArtifact` and `compileSetupOperationPlan`, and returns `writesPerformed: 0`. It opens no D1 transaction and performs no R2 operation.
- `POST /api/admin/setup/apply` accepts the proposal, exact setup approval, and any exact external approvals. It recomputes the source fingerprint, rejects a mismatch, applies only fixed internal operations, records receipts atomically, and returns existing receipts on replay. It never performs an external action.
- The setup workspace returned by `GET /api/admin/setup` includes recent aggregate application and export status for the owner.

The D1 repository surface owns:

- a singleton `setup_state` row with status, proposal schema version, last applied proposal hash, aggregate application reference, source fingerprint, revision, operation marker, actor, and timestamps;
- one aggregate `setup_applications` row per exact application key with proposal and approval hashes, source fingerprint, actor, status, operation and media counts, redacted result, result fingerprint, failure code, operation marker, and timestamps; and
- transactions that compare current revisions again at every write, use compiled operation identifiers in the affected domain rows, record domain audit receipts with the aggregate application, and preserve the aggregate application and domain receipts on replay.

The server calls these public setup-library functions:

- `validateSetupProposal`
- `createProposalArtifact`
- `createSourceStateFingerprint`
- `validateSetupApproval`
- `validateExternalActionApproval`
- `compileSetupOperationPlan`
- `runSetupPreflight`

## Diagnose and resume

Run:

    node --env-file-if-exists=.env scripts/aop-setup.mjs diagnose --proposal setup/proposals/<proposal>.json

Diagnosis reports safe contract, binding, tool, alias-count, test-environment, proposal-hash, and source-fingerprint facts. It prints no artist text, path, credential, customer value, provider payload, or private object key. Resolve the named blocker, obtain a fresh source fingerprint when durable state changed, preview again, and approve the new exact hash.

Export, verification, and disposable-local restore use their separate Milestone 9 portability contract. Customer-data export and hosted backup require their own privacy review and approval. Public Sites hosting begins only after complete local integration and Michael's action-specific approval.
