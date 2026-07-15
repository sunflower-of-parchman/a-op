# Backup and restore runbook

## What must be protected

Artist ownership covers runtime configuration, public and private content, database records, storage objects, customer and fulfillment history, and a redacted description of connected services. Secrets, permanent signed URLs, raw payment payloads, and private task metadata do not belong in a portable export.

Codex may create and verify local disposable backups and the repository's versioned artist export. Reading from or writing to hosted data, downloading customer data, creating provider backups, or restoring an external project requires approval and may create cost.

## Backup procedure

1. Run the portability commands documented in Milestone 10: `npm run export:artist` and `npm run export:verify`.
2. For a hosted installation, present the database dump method, storage inventory/retrieval method, encrypted destination, retention, expected size/cost, and customer-data handling before action.
3. Record migration and application versions, structured-content hashes, media bucket/path/hash/size, and redacted service connection state.
4. Export Stripe/customer-provider data through the provider's supported process only after approval; keep it separate from the public artist snapshot.
5. Verify the backup can be read and that its hashes match. A backup without a restore check is incomplete.

## Restore procedure

Restore first into a disposable local installation with `npm run restore:check`. Compare public identity, pages, catalog, product definitions, licensing, learning, video, editorial structure, media inventory, and access rules. External accounts are reconnected through their own runbooks and never restored from embedded secrets.

Before a hosted restore, name the target, prove it is disposable or backed up, show the overwrite scope, and obtain explicit destructive-action approval. Apply tracked migrations, import through supported schemas/APIs, reconcile storage hashes, run the complete verification suite, and keep the prior environment until acceptance.

Recovery: stop on the first integrity mismatch, preserve both copies, report the exact safe artifact and hash, and retry into a new disposable target. Never use a local reset command as a hosted restore method.
