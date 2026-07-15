# Security best-practices report

Date: 2026-07-15  
Scope: complete Artist-Owned Platform repository and disposable local Supabase installation  
Result: no unresolved critical or high-severity finding

## Trust-boundary review

| Boundary                          | Implemented controls                                                                                                                                                                                                                                             | Verification                                                                        |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Browser to Nuxt server            | Strict Zod request schemas, 2 MB request limit, route-scoped rate limits, same-origin mutation checks, cross-site Fetch Metadata denial, HttpOnly SameSite cookies, no cross-origin API contract, private `no-store` responses                                   | `tests/e2e/hardening.spec.ts`; authentication and commerce journeys                 |
| Nuxt server to Supabase           | Publishable key is public; secret key remains server-only; verified user lookup precedes server role lookup; explicit grants, forced RLS, service-only tables/functions, central access decisions                                                                | `npm run test:policies`; `npm run test:browser-secrets`; local Supabase schema lint |
| Stripe webhook and checkout       | Raw-body signature verification, test-mode guard, server-created sessions, fixed provider redirect hosts, application-owned mappings, unique event identity, transactional idempotency, changed-fact denial, redacted replay records                             | `npm run test:stripe-signature`; `npm run test:commerce`; `npm run test:licensing`  |
| Upload and media processing       | Owner/editor role, short-lived signed upload intent, path construction on the server, MIME and byte allowlists, file-size ceilings, stored-size comparison, magic-byte inspection, immutable source hash, durable lease and idempotent derivative                | `npm run test:media`; `npm run test:media-import`; upload schemas and handlers      |
| Public content rendering          | No `v-html`, `innerHTML`, script evaluation, or raw HTML renderer; typed structured sections; deliberately limited text renderer; internal-path and HTTPS schemas; transcript and alternative-text requirements; CSP blocks inline script attributes and objects | Unit schema tests; learning unsafe-content tests; axe journeys                      |
| Artist administration to database | Verified session, explicit owner/editor role, non-public draft tables, database publication functions, audit records, local-only setup apply, preview and approval boundary                                                                                      | Administration, catalog, learning, licensing, setup, and policy suites              |

## Resolved findings

1. Potential external redirect through the sign-in `redirect` query and generic client assignments. All browser destinations now pass same-origin, exact Stripe Checkout, exact Stripe Portal, or HTTPS/loopback delivery policies before navigation.
2. Cookie-authenticated mutations relied only on SameSite behavior. A server middleware now rejects mismatched `Origin` and `Sec-Fetch-Site: cross-site` requests; only the signed Stripe webhook route is exempt.
3. Artist-authored page and identity URLs admitted HTTP or protocol-relative forms in some schemas. External author links and resources now require HTTPS, internal paths reject protocol-relative/backslash/control-character forms, and poster URLs use the same boundary.
4. The default CORS middleware emitted a wildcard header when no request origin was present. CORS is disabled because the product has a same-origin browser/API contract.
5. Global request limiting did not distinguish sensitive endpoints. Authentication, sign-up, contact, checkout, licensing, telemetry, and webhook routes now have narrower budgets in addition to the global burst limit.
6. Secure-cookie detection only considered `X-Forwarded-Proto`. It now also uses the H3 request protocol while preserving loopback development.
7. Local bootstrap reset the local database without first inspecting its resolved API origin. Bootstrap and reset now share an HTTP-loopback guard before invoking `db reset --local`.

## Defensive configuration

The production response uses a nonce-based strict Content Security Policy with `default-src 'none'`, `object-src 'none'`, `script-src-attr 'none'`, fixed video frame providers, HTTPS media, and production insecure-request upgrading. Frame embedding is denied, content sniffing is disabled, referrers are reduced, HSTS is emitted, and sensitive API responses are private and non-cacheable. Inline styles remain allowed because Vue applies validated artist design tokens as style attributes; no raw CSS or HTML is accepted from public input.

The application-level limiter uses an in-process LRU driver. Hosted installations should also apply platform-level abuse controls when traffic warrants distributed enforcement. That operational layer does not replace the application schemas, authentication, RLS, or same-origin checks.

## Current evidence

- Complete `npm audit`: 0 known vulnerabilities across 1,229 production, development, optional, and peer dependencies.
- Production-only `npm audit --omit=dev`: 0 known vulnerabilities across 860 production dependencies.
- Supabase `db lint --local --schema public,private --level warning`: no schema errors.
- `npm run test:hardening`: desktop and mobile security, request-limit, redirect, keyboard, focus, reduced-motion, offline, viewport, landmark, axe, and production-performance checks passed.
- `npm run test:e2e`: all 11 isolated specifications passed across desktop and mobile projects after deterministic resets.
- `npm run build`, unit tests, lint, and typecheck passed after hardening.

Hosted Supabase advisors, deployed headers, Stripe sandbox behavior, and the deployed media worker remain approval-gated external verification. They are not represented as completed local evidence.
