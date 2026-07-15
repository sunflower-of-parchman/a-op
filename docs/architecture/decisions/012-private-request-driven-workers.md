# ADR 012: Private request-driven hosted workers

- Status: Accepted
- Date: 2026-07-15

## Decision

Keep Supabase as the durable media and license-document queue, and deploy the existing worker implementations as private, request-driven container services beside the Nuxt application in one Vercel Services project. The Nuxt service receives deployment-aware internal URLs through service bindings. Each authenticated service request claims and processes at most one job. Local Codex operation continues to use the same worker runtimes through the existing one-pass and watch commands.

## Why

The workers require FFmpeg or Python and must run outside the Nuxt process. Current Vercel container functions support those system dependencies, scale to zero between requests, and can remain unreachable from public routing. A service binding grants the Nuxt server private reachability, while a shared server-only bearer secret provides application-level authorization. Durable database jobs, leases, retries, and idempotent derivatives remain independent of the request or container lifetime.

## Consequences

`vercel.json` defines one public Nuxt service and two private container services. A completed source upload, a license issue, or an explicit retry asks the corresponding service to process one queued job. On Vercel, the Nuxt function registers that bound call with `waitUntil` so the upload response or Stripe webhook acknowledgement can return promptly while the private worker request finishes inside the function lifecycle. Other hosts await the request directly. A missing or failed service call leaves the durable job available for a later retry and never rolls back an already accepted upload, payment, entitlement, or issued license. The first supported hosted path is one Vercel Services deployment, while both containers remain ordinary OCI images that can move to another HTTP-capable container host. Public promotion, deployment, provider settings, and cost remain explicit approval gates.
