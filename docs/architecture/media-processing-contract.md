# Media processing contract

## Artist-controlled intake

The artist identifies a local media path and confirms the rights, destination, and intended public or protected use. Codex invokes the repository's local media command against that approved path. The command inspects source facts, prepares versioned derivatives, displays a manifest for approval, and publishes only the approved outputs to the artist's Site.

The command performs byte-level inspection and conversion locally. Sites-provided R2 receives original and derivative bytes. Sites-provided D1 receives metadata, hashes, ownership, approval, processing version, publication state, and access rules. See `docs/architecture/data-and-ai-boundary.md`.

The administration upload flow streams artist-approved bytes to the same R2 destination and records the same D1 contract. Implementation selects the current Sites-supported upload shape and verifies file-size and request limits before accepting large audio or video.

## Original and derivative lifecycle

Each approved original receives an immutable object key derived from a stable media identifier and source version. A replacement creates a new source version.

Each derivative records:

- source identifier and source hash;
- processing profile and version;
- derivative kind, format, bitrate, duration, channels, and sample rate where applicable;
- R2 object key, byte size, and content hash;
- approval and publication state; and
- safe processing evidence.

Streaming, download, waveform, poster, thumbnail, transcript, and document outputs use separate derivative identifiers. Published playback uses an approved ready derivative.

## Local processing

The shared local processor uses ffprobe and ffmpeg for audio and video inspection and conversion. Repository commands provide one-shot preparation, queue processing, retry, and manifest verification. ChatGPT Work and Codex can operate those commands while the artist reviews the proposed output.

A durable D1 job moves through `pending`, `processing`, `ready`, or `failed`. A claim lease prevents two workers from processing the same active job. Retry preserves the source object and processing history. A stale worker cannot replace the result of a later successful attempt.

The first complete implementation supports local processing and upload. A future hosted worker uses the same job and derivative contract through an approved worker adapter.

## Delivery

Public and protected media routes resolve D1 metadata before reading R2. Audio and video routes support validated byte ranges. Protected resources call `decideAccess` for every request. Responses expose the intended media bytes and safe headers while preserving private R2 object identifiers.

## Security and limits

- Owner or editor authority controls media writes.
- Allowed formats, maximum source size, derivative profiles, and concurrency are explicit configuration.
- Temporary files use a bounded local workspace and leave the workspace after success or failure.
- Logs contain stable media and job identifiers while redacting full local paths, credentials, signed URLs, customer data, and private object keys.
- Image provenance and permissions enter D1 before publication.
- A person's photograph stays outside generative image tools.

## Required verification

- Process one redistribution-safe audio fixture locally and verify hashes, metadata, waveform, streaming derivative, and download derivative.
- Publish the approved outputs to R2 and verify the matching D1 records.
- Seek through the generated audio with valid `200`, `206`, `403`, `404`, and `416` behavior.
- Retry one failed job and prove idempotent derivative identifiers and preserved history.
- Verify that logs, proposals, browser output, and exports preserve the redaction contract.
