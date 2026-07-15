# Vercel and domain runbook

## Boundary

Local and production builds are supported without deployment. Linking a Vercel project, creating a deployment, promoting production, attaching a custom domain, or editing DNS changes external state and may create cost. Each action requires specific approval.

Codex may run the production build locally, inspect a read-only connected project, prepare environment-variable names, and draft a deployment or DNS change plan. The Vercel plugin, CLI, or dashboard may perform an approved deployment. The registrar or DNS provider remains authoritative for DNS.

## Prepared deployment

1. Run `npm ci`, `npm run typecheck`, `npm run build`, the aggregate verification gate, and the browser secret scan.
2. Present the target Vercel account/project, Git source, framework settings, region/runtime assumptions, environment names, expected cost, and whether the result is preview or production.
3. Obtain approval before linking, uploading, deploying, or setting provider values.
4. Add only the names in `.env.example` to the deployment secret store. Public variables may contain the approved hosted origins; server variables stay private.
5. Deploy to an approved preview first. Verify health, auth callbacks, media delivery, checkout return URLs, webhook endpoint, and redacted diagnostics.
6. Obtain separate approval before production promotion.

For a custom domain, show the exact DNS records, TTL, current records affected, certificate behavior, and rollback before editing. Verify DNS propagation and HTTPS, then update approved site/auth/payment origins. A DNS change never happens as an incidental deployment step.

Recovery: retain the last verified deployment, roll back through Vercel after approval if needed, restore previous DNS records from the captured plan, and rotate a secret if any diagnostic or build output exposed it.
