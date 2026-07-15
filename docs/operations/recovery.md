# Recovery operations

This runbook joins the database, storage, payment, media, and application recovery paths into one artist-owned operating contract. Local drills use only the disposable Supabase installation and fictional assets. Any hosted read, replay, restore, provider mutation, deployment, or secret change stops at the external-action boundary and requires Michael's action-specific approval.

## Recovery authority

| Incident                       | Durable authority                                                                                                       | Local proof                                                                                                                                                                            | Hosted checkpoint                                                                                                                            |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Database and storage loss      | Forward migrations, verified artist export, content hashes, media inventory                                             | `npm run test:portability` restores every portable table and bundled object into a clean local schema, compares counts and public behavior, rejects tampering, then recreates the demo | Name the target, backup, encrypted destination, retention, overwrite scope, cost, and rollback before reading or writing hosted data         |
| Stripe reconciliation failure  | Signed provider event, application product and price mapping, unique provider-event identity, transactional fulfillment | `npm run test:commerce` proves exact replay, changed-fact denial, subscription state, partial and full refunds, entitlement effects, and redacted failure records                      | Confirm the Stripe account and test-mode event before retrieving or replaying through `/admin/commerce`; never create an entitlement by hand |
| Media retry or abandoned lease | Immutable source hash, durable media job, derivative profile version                                                    | `npm run test:media` proves claim ownership, expired-lease recovery, safe failure, idempotent retry, one derivative, and immutable source behavior                                     | Confirm worker host, queue, storage scope, secret placement, compute cost, and source rights before a hosted retry                           |
| License document failure       | Frozen issued terms, document job, private object, entitlement decision                                                 | `npm run verify:licensing` proves deterministic retry and protected delivery without changing the issued terms                                                                         | Confirm the failed safe identifier and approved worker before a hosted retry; preserve the prior error record                                |
| Application upgrade            | Pinned lockfile, forward-only migrations, versioned configuration/export schemas, verified build                        | Follow `docs/agent/upgrades.md`; run foundation, database policies, production build, browser journeys, and this recovery gate                                                         | Present backup, compatibility, downtime, deployment target, and forward-recovery plan before applying externally                             |

## Complete local drill

Run:

```text
npm run test:recovery
```

The command bootstraps the local installation twice, proving the rerun remains local; exercises payment reconciliation and media retry; performs the full export and clean restore; resets the fictional demonstration; and ends with a redacted setup check. Both local reset commands verify that the active Supabase API uses an HTTP loopback address before `db reset --local` can run. After a reset, the command polls the local Auth health endpoint and restarts only this project's local Kong container if the gateway retained a stale Auth upstream.

The expected result is one `Recovery drills: PASS` line. A mismatch stops immediately. Preserve the safe artifact, hash, command, and exit status, then retry into a new disposable target. Never weaken a hash check or edit an applied migration to make a restore pass.

## External-action boundary

Preparation and local proof may proceed autonomously. Hosted database dumps, storage downloads, Stripe event retrieval or replay, deployed worker jobs, Vercel deployment or promotion, DNS changes, secret rotation, and production restore are separate external actions. Each requires a preview of the exact account, target, mutation, risk, cost, and rollback followed by explicit approval for that action.
