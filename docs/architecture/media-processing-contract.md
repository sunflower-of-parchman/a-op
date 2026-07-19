# Media processing contract

## Artist-controlled intake

The artist identifies a local media path and confirms the rights, destination, and intended public or protected use. Codex invokes the repository's local media command against that approved path. The command inspects source facts, prepares versioned derivatives, displays a manifest for approval, and publishes only the approved outputs to the artist's Site.

The command performs byte-level inspection and conversion locally. The proposal carries a stable alias from ignored `setup/local-paths.json`; the proposal, Site, D1, export, logs, and ChatGPT Work task receive no full machine path. The source entry records its expected SHA-256 value, kind, content type, rights confirmation, intended use, byte length, and safe inspection facts. Every derivative records the exact source hash and fixed processing profile.

Sites-provided R2 receives approved original and derivative bytes. Sites-provided D1 receives metadata, hashes, ownership, approval, processing version, publication state, and access rules. See `docs/architecture/data-and-ai-boundary.md`.

## Approval and publication

The owner-authenticated publication route accepts only an exact prepared body and bounded allowlisted metadata. Before any R2 write, it requires active owner authority and the matching `applied` setup application with the exact proposal and approval hashes. Final D1 publication repeats both predicates so a changed owner or setup state cannot publish a ready pointer.

The route reads the request body through a hard server-managed byte cap. `MEDIA_PUBLICATION_MAX_BYTES` defaults to 32 MiB and accepts a configured value from 1 KiB through 64 MiB. A missing body, inconsistent content length, oversized body, invalid cap, unapproved content type, mismatched profile, missing rights confirmation, or changed hash fails closed. Larger media needs a separately implemented and validated Sites-supported upload path; the bounded route never silently relaxes its limit.

## Original and derivative lifecycle

Each approved source uses a private content-addressed R2 key:

    originals/sha256/<media-sha256>/<approval-sha256>/<media-id>

Each approved derivative uses the corresponding private namespace:

    derivatives/sha256/<media-sha256>/<approval-sha256>/<media-id>

R2 custom metadata binds the object to its byte hash, proposal hash, approval hash, manifest hash, setup application, and media identifier. After an initial write, the application reads the object back and verifies its full bytes, byte length, content type, SHA-256 value, and required metadata. D1 receives a ready, approved source or derivative pointer only after that read-back succeeds.

An exact retry verifies and reuses the existing immutable object. A D1 failure after the R2 write may leave the content-addressed object without a ready pointer; retry safely reuses that same verified object and completes D1. A replacement uses a new approved hash or media version.

Each derivative records:

- source identifier and source hash;
- processing profile and version;
- derivative kind, format, bitrate, duration, channels, and sample rate where applicable;
- R2 object key, byte size, and content hash;
- approval and publication state; and
- safe processing evidence.

Streaming, download, waveform, poster, thumbnail, transcript, and document outputs use separate derivative identifiers. Published playback uses an approved ready derivative.

## Local processing

The shared local processor uses `ffprobe` and `ffmpeg` for audio, video, image, poster, and embedded-caption inspection or conversion. It invokes fixed executables with argument arrays and `shell: false`. Versioned profiles provide bit-exact 192 kbps MP3 at 48 kHz and two channels for audio streaming, bit-exact FLAC at compression level 8 for audio download, bounded H.264/AAC MP4 video for streaming and download, a bounded lossless WebP poster from an approved video, WebVTT extraction from the approved video's first embedded subtitle stream, and a bounded lossless WebP Course image. Approved PDF Course documents use a fixed byte-copy profile; manifest verification requires the derivative hash to equal the approved source hash. Repository commands provide one-shot preparation, retry, and manifest verification. ChatGPT Work and Codex can operate those commands while the artist reviews the proposed output.

Every profile fixes its accepted source kind and content types, approved intended uses, processing tool, output content type and format, derivative kind, and arguments. A profile cannot run when the exact source content type or artist-approved intended use does not match. Captions remain artist-authored material carried in the approved video source; this processor extracts them and makes no transcription or model request.

The manifest uses canonical SHA-256 hashes for the exact setup proposal, separate owner approval, source bytes, derivatives, and complete manifest. Verification rereads every approved local alias and checks its byte length and hash before publication.

A durable D1 job moves through `pending`, `processing`, `ready`, or `failed`. A claim lease prevents two workers from processing the same active job. Retry preserves the source object and processing history. A stale worker cannot replace the result of a later successful attempt.

The first complete implementation supports local processing and upload. A future hosted worker uses the same job and derivative contract through an approved worker adapter.

## Delivery

Public and protected media routes resolve D1 metadata before reading R2. Audio and video routes support validated byte ranges. Protected resources call `decideAccess` for every request. Responses expose the intended media bytes and safe headers while preserving private R2 object identifiers.

## Security and limits

- The hosted publication route requires active owner authority and the exact applied setup approval before R2, then repeats both checks before D1 finalization.
- Allowed content types, source kinds, intended uses, request size, derivative profiles, and processing versions are fixed validated inputs.
- The neutral installation, documentation, and verification flow create no sample, placeholder, generated, or temporary media assets. A real approved local conversion cleans its bounded process workspace after success or failure, and prepared artist outputs remain only at artist-approved aliases.
- Logs contain stable media and job identifiers while redacting full local paths, credentials, signed URLs, customer data, and private object keys.
- Image provenance and permissions enter D1 before publication.
- A person's photograph stays outside generative image tools.

## Portability boundary

Artist exports contain logical source and derivative records with stable identifiers, content types, byte counts, hashes, approval state, processing facts, visibility, and intended use. They contain no media bytes, local aliases or paths, private R2 object keys, signed URLs, or provider payloads. Restore therefore recreates artist definitions and media manifests; the artist republishes bytes separately from approved sources.

## Required verification

- Before artist-approved audio is available, verify the local manifest, exact setup and approval hashes, fixed derivative profiles, safe process invocation, cleanup-on-failure contract, request byte cap, owner and approval guards, content-addressed R2 reuse, read-back verification, and replay-safe D1 finalization with in-memory dependencies and binding doubles. Create no media asset.
- When artist-approved audio is supplied for the installation, prepare the fixed streaming and download derivatives locally, verify their hashes and inspection facts, and publish only the artist-approved outputs. Record this real-media check as pending while no approved audio is available.
- Verify the R2 read-back and matching D1 source or derivative row before exposing the media through catalog or delivery routes.
- Before approved audio is available, verify `200`, `206`, `403`, `404`, and `416` delivery behavior with in-memory bytes and non-persistent binding doubles. When approved audio is supplied, verify browser seeking through the resulting stream.
- Retry one failed job and prove idempotent derivative identifiers and preserved history.
- Verify that logs, proposals, browser output, and exports preserve the redaction contract.
