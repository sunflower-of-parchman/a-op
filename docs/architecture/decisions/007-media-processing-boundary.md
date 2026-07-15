# ADR 007: Shared local and deployed media worker

- Status: Accepted
- Date: 2026-07-15

## Decision

Upload original audio directly to private Supabase Storage, create durable media jobs, and process them outside ordinary Nuxt requests. Use one worker implementation locally and as a deployed Open Container Initiative image.

## Why

Audio can be large and ffmpeg work can be long-running. A durable worker protects request reliability and makes hosted administration a real supported workflow.

## Consequences

Originals are immutable. Jobs are leased and idempotent. Derivatives are versioned by source hash, processing profile, and kind. Milestone 4 is incomplete until both local and approved hosted worker journeys pass. The complete contract lives in `docs/architecture/media-processing-contract.md`.
