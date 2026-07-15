# Email runbook

## Current behavior

Contact submissions are stored in the artist-owned database with consent and abuse controls. The local demonstration sends no email. Provider delivery is intentionally reported as an approval-required setup step until an adapter, sender identity, and artist-owned provider account are approved.

Codex may verify local contact capture, validation, rate limits, consent text, owner access, and private-data isolation. It may prepare an adapter and provider-neutral test plan. Creating an email account, verifying a domain, adding DNS, uploading contacts, or sending any message requires explicit approval.

## Provider checkpoint

Before connection, identify the provider, plan/cost, sender domain and address, data residency/retention, required DNS, recipient behavior, bounce handling, and rollback. Obtain separate approval for the account/DNS connection and for any real send.

Credentials live only in the deployment secret store. The adapter must be server-only, make delivery idempotent, store only a safe provider reference and redacted result, and keep database capture authoritative if delivery fails. Never log message bodies or recipient addresses in operational output.

Verification uses provider sandbox or an artist-approved test recipient, proves one send per contact event, and proves retry without duplication. Recovery leaves the captured message intact, records a redacted failure, and retries through the supported adapter after configuration is corrected.
