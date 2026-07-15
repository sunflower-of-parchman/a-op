# Vercel and domain runbook

## Boundary

Local and production builds are supported without deployment. Linking a Vercel project, creating a deployment, promoting production, attaching a custom domain, or editing DNS changes external state and may create cost. Each action requires specific approval.

Codex may run the production build locally, inspect a read-only connected project, prepare environment-variable names, and draft a deployment or DNS change plan. The Vercel plugin, CLI, or dashboard may perform an approved deployment. The registrar or DNS provider remains authoritative for DNS.

## Prepared deployment

1. Run `npm ci`, `npm run typecheck`, `npm run build`, the aggregate verification gate, and the browser secret scan.
2. Present the target Vercel account/project, Git source, Services framework setting, region/runtime assumptions, environment names, expected cost, and whether the result is preview or production.
3. Obtain approval before linking, uploading, deploying, or setting provider values.
4. Confirm the project framework is **Services** and the tracked `vercel.json` defines exactly one public `web` service plus private `media_worker` and `document_worker` container services. Only `web` receives a public rewrite.
5. Add only the names in `.env.example` to the deployment secret store. Public variables may contain the approved hosted origins; server variables stay private. `NUXT_MEDIA_WORKER_SECRET` is the shared application-level authorization value for the Nuxt server and both workers; generated binding URLs are supplied by Vercel and are not configured manually.
6. Deploy all three services together to one approved immutable preview. Verify web health, private binding dispatch, auth callbacks, media delivery, checkout return URLs, webhook endpoint, and redacted diagnostics.
7. Obtain separate approval before production promotion.

Current Vercel guidance defines Services as independently built units in one project, makes services private until a rewrite or binding grants reachability, and requires caller-side bindings for private service-to-service requests. The worker containers listen for HTTP traffic, process one durable Supabase job per authenticated call, and scale independently of the Nuxt service. Their database leases preserve recovery if a request or container ends.

For a custom domain, show the exact DNS records, TTL, current records affected, certificate behavior, and rollback before editing. Verify DNS propagation and HTTPS, then update approved site/auth/payment origins. A DNS change never happens as an incidental deployment step.

Recovery: retain the last verified deployment, roll back through Vercel after approval if needed, restore previous DNS records from the captured plan, and rotate a secret if any diagnostic or build output exposed it.
