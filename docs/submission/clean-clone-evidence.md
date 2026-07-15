# Clean-clone evidence

- Date: July 15, 2026
- Package commit: `0ab2c9e`
- Application package commit: `aead7ab`
- Host: macOS arm64 with Docker Desktop
- Runtime: Node 24.14.0, npm 11.12.1

## Two-command novice rehearsal

An untouched local clone with no untracked configuration ran only the documented commands:

```text
npm ci
npm run demo:local
```

`npm ci` installed the exact lockfile graph and completed Nuxt preparation. `demo:local` then created the pinned document environment, passed preflight, started and seeded local Supabase, generated database types, verified all roles and storage boundaries, and started Nuxt on an isolated test port. An independent HTTP request to `/` returned `200`. After the server stopped, `git status --short --branch` reported only `## main...origin/main`; no tracked file changed.

## Complete clean-room rehearsal

A separate untouched clone passed:

```text
node --version
npm --version
npm ci
npm run setup:documents
npm run setup:preflight
npm run setup:local
npm run setup:check
npm run demo:reset
npm run verify:foundation
npm run test:cross-browser
npm run verify:setup
npm run demo:local
```

Observed results:

- Node `v24.14.0` and npm `11.12.1` matched the supported contract.
- The document renderer installed its pinned packages into the ignored project environment.
- Preflight passed Node, npm, Docker `28.5.1`, pinned Supabase CLI `2.109.1`, and workspace checks.
- Local setup applied migrations and deterministic authorization fixtures, generated types, and passed the installation check.
- `demo:reset` returned the exact fictional state.
- Foundation formatting, lint, type checking, 19 unit tests, one integration test, all documentation links/assets, and the Nuxt production build passed.
- The public judge route passed in Chromium and WebKit on macOS. Firefox remains mandatory in Linux CI because the downloaded Playwright Firefox 151 runtime reproduces Mozilla's macOS headless framebuffer startup failure before a page is created.
- The setup lifecycle changed the fictional identity, imported and processed two generated tracks, enforced preview and approval boundaries, reapplied idempotently, and restored Daymark Assembly.
- The browser-secret scan passed.
- The one-command server returned HTTP `200` from its isolated port.
- The clone retained no tracked changes.

## External boundary

This evidence proves the local novice and judge paths. It does not claim a public deployment, hosted Supabase advisors, Stripe sandbox transaction, deployed worker, Linux CI result, public repository, video, or Devpost submission. Those remain listed approval gates in [`submission-checklist.md`](submission-checklist.md).
