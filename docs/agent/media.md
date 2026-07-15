# Media import and processing runbook

## Authority

The artist decides which source files may be used and confirms rights, metadata, and publication. Codex may inspect only the path the artist identifies, prepare metadata, and run the local worker. A hosted upload or deployed worker creates external state and requires approval.

## Local import

1. Run `npm run media:inspect -- <approved-directory> --out <manifest.json>`.
2. Review every source path, release/track title, ordering, credit, hash, and duration with the artist.
3. Record `rightsConfirmed`, `metadataApproved`, `publicationApproved`, and `approvedBy` in the manifest. Do not infer these approvals.
4. Preview the containing setup proposal with `npm run setup:preview -- <proposal.json>`.
5. After explicit approval, use the setup apply lifecycle or `npm run media:apply -- <manifest.json> --confirm-apply` for a standalone local import.
6. Run `npm run media:work` and `npm run verify:catalog`.

The source remains immutable. Stable IDs and hashes make reapplication idempotent. The worker leases durable jobs and writes versioned preview, waveform, and other approved derivatives before marking them ready.

For a hosted worker, use `docs/architecture/media-processing-contract.md`. Present the worker host, storage access, secret placement, expected compute/storage cost, queue behavior, and failure recovery before deployment. After approval, verify a real approved source upload, lease recovery, derivative hashes, public preview, and private original.

Recovery: inspect the owner media queue, retry the failed job through the supported worker, and preserve the original and prior error record. Reinspect when a source hash changes. Never overwrite an original or let a stale worker attempt replace a newer successful derivative.
