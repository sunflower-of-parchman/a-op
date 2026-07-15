# Judge quickstart

This path runs the complete fictional Artist-Owned Platform locally. It does not require an OpenAI API key, hosted Supabase project, Stripe account, domain, email provider, or paid resource.

## Requirements

- Node 24.14 and npm 11.
- Docker Desktop or a compatible running Docker daemon.
- Python 3.12 or newer. The setup command creates an ignored environment with pinned PDF dependencies.
- About 10 GB of free space for dependencies, browser binaries, Supabase containers, and generated media.

## Start in two commands

From a fresh clone:

```text
npm ci
npm run demo:local
```

`demo:local` prepares the pinned document renderer, checks Node, npm, Docker, and the Supabase CLI, resets the local Supabase schema to tracked migrations, installs the coherent Daymark Assembly demonstration, verifies the installation, and starts Nuxt at `http://127.0.0.1:3000`.

Press Control-C to stop Nuxt. The local Supabase containers remain available for another run. Restore the exact fictional state at any time with:

```text
npm run demo:reset
```

## Local-only accounts

| Role       | Email                        | Password                 | What it proves                                               |
| ---------- | ---------------------------- | ------------------------ | ------------------------------------------------------------ |
| Owner      | `owner@daymark.local`        | `Daymark-Owner-2026!`    | Complete protected artist administration                     |
| Editor     | `editor@daymark.local`       | `Daymark-Editor-2026!`   | Editorial access without owner-only commerce or system state |
| Listener 1 | `listener-one@daymark.local` | `Daymark-Listener-2026!` | Private library, purchase, membership, and learning state    |
| Listener 2 | `listener-two@daymark.local` | `Daymark-Listener-2026!` | Cross-account isolation and protected-delivery denial        |

These accounts exist only in disposable local Supabase. Never reuse them in a hosted installation.

## Ten-minute product journey

1. Open `/`. The announcement identifies the artist as fictional. Review the open editorial composition and choose whether to allow optional first-party analytics.
2. Open `/music`, enter the release, and play the generated preview. The single player persists while navigating releases, tracks, and collections.
3. Sign in as Listener 1. Favorite a track, create a playlist, and inspect private history in `/account`. Listener 2 cannot see those records.
4. Open `/support`. The clearly labeled local checkout simulation exercises a purchase, free access, or membership through the same durable order and entitlement path used by verified Stripe events.
5. Open `/licensing`. Review the artist-authored use boundaries, enter a fictional project, complete the local simulation, and retrieve the private generated PDF from `/account`.
6. Open `/learn`, enter the three-lesson path, and inspect public, account, purchase, and membership access explanations. Protected progress resumes only for the entitled listener.
7. Open `/video` and confirm that the poster, credits, and transcript appear before consent. The external iframe is created only after explicit approval.
8. Sign in as the Owner and open `/admin`. Visit identity, pages, music, commerce, licensing, learning, video, editorial, analytics, and system status. Drafts remain private until explicit publication.
9. Run `npm run diagnose` in a second terminal. The result is designed to be shareable with Codex and excludes secrets, local URLs, raw sessions, and account identities.
10. Run `npm run demo:reset` and refresh. The exact Daymark Assembly state returns.

## Fast technical proof

```text
npm run setup:check
npm run test:docs
npm run test:cross-browser
npm run verify:spine
npm run verify:hardening
npm run verify:recovery
```

On macOS, the cross-browser command verifies Chromium and WebKit while Firefox remains mandatory in Linux CI. `PLAYWRIGHT_FORCE_FIREFOX=1 npm run test:cross-browser` retries the Firefox runtime locally.

The full local gate is `npm run verify`. It verifies every product module, Integration Gate A, security and accessibility, performance budgets, recovery, final deterministic setup, and 12 isolated desktop/mobile browser specifications.

## What remains external

The repository contains real Stripe adapters and one local/container media worker. Hosted Stripe test-mode proof, deployed-worker proof, Supabase advisor evidence, public deployment, DNS, repository publication, video upload, and Devpost submission change external state. They remain pending Michael's explicit approval and are never silently replaced with decorative success states.

## Evidence map

- Product and authority contract: [`docs/architecture/product-contract.md`](../architecture/product-contract.md)
- Capability matrix: [`docs/submission/capability-evidence.md`](capability-evidence.md)
- Model record: [`docs/submission/model-and-agent-use.md`](model-and-agent-use.md)
- Asset provenance: [`docs/demo-assets.md`](../demo-assets.md)
- Security review: [`security_best_practices_report.md`](../../security_best_practices_report.md)
- Recovery authority: [`docs/operations/recovery.md`](../operations/recovery.md)
- Production budgets: [`docs/submission/performance-evidence.md`](performance-evidence.md)
