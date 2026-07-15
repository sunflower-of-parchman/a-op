# Authentication and OAuth runbook

## Boundary

Supabase Auth establishes identity. Database roles, grants, and RLS establish authority. Email sign-in works in the local stack. Adding an OAuth provider requires an artist-owned provider application, redirect configuration, and credentials, so it is an external approval checkpoint.

Codex may verify local email sign-up, sign-in, sign-out, session refresh, password recovery behavior, and the owner/editor/customer policy tests. It may prepare exact redirect URLs and field names. A connected Supabase or provider tool may apply approved settings. Creating an OAuth app, accepting provider terms, adding credentials, or changing hosted redirects requires explicit approval.

## Hosted OAuth procedure

1. Confirm the provider requested in the approved setup proposal and the hosted site origin.
2. Present the provider account, any verification or cost requirement, and the exact callback URL before changing anything.
3. After approval, create or select the artist-owned provider application and configure the callback URL shown by Supabase.
4. Store the client secret only in the provider/Supabase secret surface. Never copy it into Git, project state, a proposal, or diagnostic output.
5. Add the production and approved preview origins to Supabase URL configuration. Keep local redirects for development.
6. Test success, cancellation, an unrecognized account, sign-out, and an expired session. Confirm a new OAuth account receives only the customer role.

Verification must include `npm run test:policies`, the account browser journey, and `npm run setup:check`. Recovery is to disable the provider connection while retaining email access, correct redirect or consent settings, rotate any exposed secret, and repeat the account-isolation tests.
