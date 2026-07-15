# Codex operations index

These runbooks let a new Codex task operate the repository without relying on a particular plugin. A connected provider plugin or CLI may shorten a step, but it does not change the authority or approval boundary.

Start with `SETUP.md`, then use the runbook named by `setup/project-state.json` or `npm run setup:check`:

- `supabase.md`: local setup and a later hosted database connection.
- `authentication-oauth.md`: email authentication, OAuth providers, and redirect URLs.
- `storage.md`: bucket boundaries, uploads, and hosted storage verification.
- `stripe.md`: local simulation, Stripe test mode, and the later live-mode checkpoint.
- `vercel-domain.md`: prepared Vercel deployment, custom domains, and DNS.
- `email.md`: local contact capture and a future delivery provider.
- `media.md`: approved media inspection, application, processing, and retry.
- `backup-restore.md`: database, storage, customer-data, and recovery procedures.
- `upgrades.md`: dependency, schema, and application-version changes.
- `troubleshooting.md`: safe diagnostics and common recovery paths.

Every external account, cost, upload, deployment, DNS change, live payment change, email send, or publication requires approval for that specific action. Keep secrets in ignored `.env` or a connected service secret store. Never put them in proposals, project state, logs, screenshots, Git, or chat output.
