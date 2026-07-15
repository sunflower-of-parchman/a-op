# Authentication and OAuth runbook

## Boundary

Supabase Auth establishes identity. Database roles, grants, and RLS establish authority. Email sign-in works in the local stack. Adding an OAuth provider requires an artist-owned provider application, redirect configuration, and credentials, so it is an external approval checkpoint.

The application supports Google, Apple, GitHub, and Spotify through a server-side PKCE flow. Providers remain hidden and the initiation endpoint fails closed until their exact lowercase names appear in the comma-separated `NUXT_PUBLIC_OAUTH_PROVIDERS` allowlist. The one-use verifier and return path live in short-lived HTTP-only cookies; `/api/auth/oauth/callback` exchanges the authorization code and writes the same secure session cookies used by email authentication. Provider tokens are neither requested nor stored.

Codex may verify local email sign-up, sign-in, sign-out, session refresh, password recovery behavior, and the owner/editor/customer policy tests. It may prepare exact redirect URLs and field names. A connected Supabase or provider tool may apply approved settings. Creating an OAuth app, accepting provider terms, adding credentials, or changing hosted redirects requires explicit approval.

## Hosted OAuth procedure

1. Confirm the provider requested in the approved setup proposal and the hosted site origin.
2. Present the provider account, any verification or cost requirement, and the exact callback URL before changing anything.
3. After approval, create or select the artist-owned provider application and configure the callback URL shown by Supabase.
4. Store the client secret only in the provider/Supabase secret surface. Never copy it into Git, project state, a proposal, or diagnostic output.
5. Add `https://<approved-site>/api/auth/oauth/callback` to Supabase's exact redirect allowlist. Add the approved production and preview origins to Supabase URL configuration. Keep local redirects only for development.
6. Set `NUXT_PUBLIC_OAUTH_PROVIDERS` in the approved deployment to the configured provider names, such as `google,github`. This value enables buttons and initiation only; it contains no credential.
7. Run `npm run test:oauth`, then test success, cancellation, an unrecognized account, sign-out, and an expired session against the hosted provider. Confirm a new OAuth account receives only the customer role.

Verification must include `npm run test:policies`, the account browser journey, and `npm run setup:check`. Recovery is to disable the provider connection while retaining email access, correct redirect or consent settings, rotate any exposed secret, and repeat the account-isolation tests.
