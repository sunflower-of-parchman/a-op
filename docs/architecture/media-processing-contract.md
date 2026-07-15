# Media processing contract

Hosted administration includes real audio upload and processing. Original audio must not pass through ordinary Nuxt request bodies, and long-running ffmpeg work must not occupy ordinary page or API requests.

## Upload and job lifecycle

An authenticated owner or editor requests an authorized resumable upload target from the Nuxt server. The browser uploads the original directly to a private Supabase Storage location. The server records the media object and creates a durable `media_jobs` row in the same logical workflow.

The source object is immutable. The job moves through `pending`, `processing`, `ready`, or `failed`. A worker claims pending jobs atomically, reads the source from private storage, inspects it with ffprobe, processes it with ffmpeg, and writes new derivative objects for the public preview, waveform data, and normalized metadata. It then marks the job `ready` and records derivative hashes, paths, versions, and processing evidence. Failed jobs retain a safe error category and may be retried without replacing the source.

The administration workspace shows upload and processing state, explains failures without exposing secrets, and provides a retry action. Published playback uses only a `ready` derivative or an artist-supplied approved preview.

## One worker, two supported operating modes

The repository provides one worker entrypoint at `workers/media/index.ts` and one processing library under `workers/media/`. Both operating modes use the same code and database claim function.

Local Codex-operated mode runs:

    npm run media:work

This command may process pending jobs until the queue is empty and exit. `npm run media:watch` remains active for local administration sessions. Codex can operate either command during setup and maintenance.

Hosted mode packages the shared worker runtime as an Open Container Initiative image through the root-context `Dockerfile`. The image routes `/media/health` and `/media/jobs/process-one` to the media queue and the corresponding `/documents/*` paths to the document queue. Vercel runs the same immutable runtime behind two separately bound private services. The supported first deployment uses request-driven Vercel container services. The Nuxt service receives each deployment-aware internal URL through a service binding and sends an authenticated request only after the durable job exists. One request claims at most one job. Neither service receives a public rewrite.

The binding is private reachability, and `NUXT_MEDIA_WORKER_SECRET` adds application-level authorization. The Nuxt service registers hosted dispatch with Vercel `waitUntil`, allowing the upload-complete response to return while the private service request finishes. If a bound service is absent, busy, or unavailable, the accepted upload and queue row remain intact. A later owner retry or worker invocation can claim the pending or explicitly retried job. The database lease and derivative key remain authoritative across container shutdown, retry, and concurrent instances.

Before Milestone 4 is accepted, the Build Week demonstration environment must run this container on one selected and documented container-capable service after Michael explicitly approves the deployment. The hosted end-to-end test must upload approved demonstration audio, observe the job reach `ready`, load the generated waveform, and play the generated preview. A merely documented future worker does not satisfy the hosted administration claim.

The container remains portable to another HTTP-capable host. A long-running host can also continue to run `npm run media:watch`; Vercel is the documented first path, not a requirement for future installations.

## Idempotency and concurrency

Each source is identified by a content hash and stable media identifier. Each derivative is identified by source hash, processing-profile version, and derivative kind. Reprocessing the same source with the same profile produces a no-op or replaces the same temporary derivative before an atomic finalization; it never creates uncontrolled duplicates.

The database claim operation prevents two workers from processing one active job. A timed-out claim becomes retryable after a documented lease period. Workers update progress with compare-and-set semantics so a stale worker cannot overwrite the result of a later successful attempt.

## Security and limits

Upload authorization checks owner or editor role, allowed media type, maximum size, and destination before issuing the resumable target. The worker receives server-only Supabase credentials from its environment and never returns them to the application or diagnostics. Temporary files use a bounded workspace and are deleted after success or failure. Logs contain job and media identifiers, not signed URLs, secrets, customer data, or full local paths.

Artist-configured limits cover maximum source size, supported input formats, preview duration and bitrate, and worker concurrency. The demo uses conservative limits that fit the verified worker host. The original remains private unless the artist explicitly creates a downloadable product entitlement for it.

## Required verification

Automated tests must prove job claiming, lease recovery, idempotent retry, derivative naming, failure state, and redacted logs. Local integration tests run ffmpeg on a small redistribution-safe fixture. Hosted verification proves direct upload, durable job creation, deployed worker processing, ready-state publication, waveform retrieval, and preview playback.
