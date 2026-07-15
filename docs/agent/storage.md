# Storage runbook

## Boundary

The platform defines seven storage boundaries and validates their policies during `npm run setup:check`. Source audio and protected customer material stay private. Public derivatives become readable only after their database record is ready. The Storage API is the write path; application code does not mutate Supabase's internal storage tables.

Codex may inspect local buckets, apply local migrations, upload approved fictional material, run workers, and verify policies. Uploading artist material to a hosted project, changing bucket limits, or creating billable storage usage requires approval. A connected Supabase tool or the supported API may perform the approved operation.

## Verification

For every bucket, confirm intended public/private status, MIME and size boundary, owner/editor write authority, customer isolation, signed-URL expiry, and database-to-object consistency. Run `npm run test:policies`, `npm run verify:catalog`, `npm run verify:licensing`, and `npm run verify:learning` as applicable.

Original source objects are immutable. Derivative names include their content or processor version. Never publish permanent signed URLs or place them in an export. The portability manifest records bucket/path, hash, size, and retrieval instructions instead.

Recovery: quarantine an unexpected object, preserve its hash and safe metadata, regenerate derivatives from the approved source, and update the database only through supported scripts or application routes. A missing hosted object is restored from the artist's verified backup after approval; a mismatched hash is never treated as the same asset.
