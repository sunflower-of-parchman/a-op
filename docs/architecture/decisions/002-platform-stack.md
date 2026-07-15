# ADR 002: Nuxt, Supabase, Stripe, and portable hosting

- Status: Accepted
- Date: 2026-07-15

## Decision

Use Nuxt 4, Vue, and TypeScript for the web application. Use Supabase for PostgreSQL, authentication, authorization, and storage. Use Stripe for checkout, subscriptions, and customer billing tools. Document Vercel as the first web-hosting path while keeping the Nuxt server deployable to ordinary Node-compatible infrastructure. Run audio processing as a separate container worker.

## Why

The stack supports public publishing, authenticated application behavior, protected media, commerce, and direct artist ownership. It is informed by a production-proven system and can be operated through Codex without introducing an AI runtime dependency.

## Consequences

External service configuration remains the artist's responsibility and may create costs. Local and test-mode operation must work before any hosted connection. Vercel does not become a requirement for the media worker or for future hosting choices.
