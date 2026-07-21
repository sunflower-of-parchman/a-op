# Authentication, authorization, and access

## Identity and roles

Sites supplies identity through its current official Sign in with ChatGPT helpers and forwarded authenticated-user headers. `getChatGPTUser()` supports optional identity-aware pages. `requireChatGPTUser(returnTo)` protects server-rendered account and administration pages. Dispatch owns the sign-in, sign-out, and callback paths.

The standard local development command enables a fictional customer preview so the account interface can be reviewed before Sites hosting. The fallback is active only outside production and only when `AOP_ENABLE_LOCAL_ACCOUNT_PREVIEW=1`; `npm run dev:anonymous` preserves the signed-out local journey. The preview creates no sign-in, sign-out, callback, cookie, or app-owned authentication route. Hosted builds continue to accept identity only from Sites-forwarded headers.

D1 records the application's durable identity and role facts:

- `owner` manages installation-wide settings, trusted operators, access plans, legal documents, exports, and publication.
- `editor` manages assigned catalog, media, Courses, video, pages, and updates.
- `customer` manages their own profile, library, playlists, favorites, memberships, subscriptions, licenses, downloads, and course progress.

The owner bootstrap is an explicit setup action. Role assignments are server-owned D1 records. Every server write resolves the current identity and role again.

## Server boundary

D1 and R2 bindings remain inside server code. Browser components receive validated public data and purpose-built action results. API routes and server actions apply ownership predicates, role checks, state-transition rules, and input validation before every read or write involving private state.

Authentication identifies a person. The application's role and access contracts authorize the requested action.

## Protected delivery

Every protected stream, download, course asset, license document, customer record, and administrative resource calls the central `decideAccess` contract.

The decision can derive access from:

- intentional public availability;
- owner or editor authority;
- resource ownership;
- an active membership or subscription;
- an issued license;
- a credit reservation or redemption;
- a course grant; or
- an explicit access grant.

The delivery route returns only the authorized byte range or document response. Stable D1 records preserve the decision source, expiry, revocation, remaining uses, and delivery history.

## Access-state contract

Artist actions create and update memberships, subscription state, entitlements, credits, licenses, and explicit grants through validated server operations. Each operation writes the resulting access state and audit event together. Repeating an operation with the same idempotency key returns the existing result.

Renewals, cancellations, expirations, credit reservations, credit releases, reversals, and revocations remain auditable state transitions. A browser navigation or client-side state change never grants access.

Current official [Sites guidance](https://help.openai.com/en/articles/20001339) prohibits payment-card processing and financial transactions. The installation's Stripe Test Mode simulation follows `docs/architecture/commerce-environment.md`. Only a verified signed test webhook can turn a simulated checkout into application-owned access state. Browser redirects and client state grant nothing. Server-owned D1 state remains the authority for every protected action.

## Required verification

- Anonymous, customer, editor, and owner journeys receive their intended data and actions.
- Cross-customer reads and writes are denied at the server boundary.
- Protected R2 delivery always follows `decideAccess`.
- Replayed access operations create one durable result.
- Browser output contains no D1 binding, R2 credential, secret, or private object key.
