# Judging guide

Artist-Owned Platform is a complete, single-artist web platform that a musician can set up and operate with Codex. The personalized site is the visible proof. The transferable repository, deterministic setup, authorization spine, workers, runbooks, and verification system are the developer tool.

## Fastest working path

With Node 24.14, npm 11, Python 3.12 or newer, and Docker running:

```text
npm ci
npm run demo:local
```

Open `http://127.0.0.1:3000`. Local-only roles are listed in [`content/demo/accounts.json`](../../content/demo/accounts.json). Restore the exact fictional state at any time with `npm run demo:reset`.

The same committed package was rehearsed from a clean temporary clone using Node 24.14 and npm 11.12.1. The locked install, document runtime, preflight, local setup, deterministic reset, foundation/build, setup personalization lifecycle, browser-secret scan, Chromium/WebKit journey, and one-command server all passed. The resulting home page returned HTTP 200 and the clone retained no tracked changes.

## Ten-minute product route

1. Start at `/`. Daymark Assembly is fictional and contains no Sound for Movement media or customer data.
2. Open `/music`, choose _Lines We Carry_, and play a generated preview. Open a track and the authored collection.
3. Sign in as Listener One. Favorite the track, create a playlist, and confirm listening history. Listener Two cannot retrieve Listener One's protected records.
4. Open `/support`. Complete the clearly labeled local purchase or membership simulation. It creates a real local checkout intent, verified fulfillment event, order, subscription where applicable, and centralized entitlement without charging a card.
5. Open `/licensing`. Choose a supported use, review the exact immutable terms and price, complete the local checkout, run `npm run documents:work`, and retrieve the private PDF from `/account`. Unsupported uses become inquiries.
6. Open `/learn`. Read the public lesson, sign in for account access, and use the entitled customer for protected progress and resume.
7. Open `/video`. Credits, poster, and transcript appear before consent; the external player is created only after approval.
8. Sign in as the Owner and open `/admin`. Inspect identity, pages, music, commerce, licensing, learning, video, editorial, analytics, media jobs, and system status. Drafts remain private until explicit publication.
9. Run `npm run diagnose`. The report is intentionally shareable and excludes secrets, account identities, sessions, and local service URLs.
10. Run `npm run demo:reset` and refresh. The same Daymark Assembly state returns.

## Codex-native personalization

Ask Codex:

> Help me set up my artist-owned site.

Codex follows [`SETUP.md`](../../SETUP.md) and the repository contracts. It discusses identity, audience, visual direction, pages, music, commerce, licensing, memberships, teaching, video, privacy, and deployment. It then creates a structured proposal.

The state-changing lifecycle is always:

```text
interview
-> structured proposal
-> validated preview and diff
-> explicit human approval
-> deterministic application
-> verification
-> project-state update
```

`npm run verify:setup` proves the full lifecycle with a changed fictional identity and two generated audio tracks, repeats the approved application to prove idempotency, and restores Daymark Assembly.

## Fast technical proof

```text
npm run setup:check
npm run verify:spine
npm run verify:package
npm run verify:hardening
npm run verify:recovery
```

`verify:spine` replays one payment event four times and proves that only one event, order, and entitlement exist. `verify:hardening` covers security boundaries, RLS, keyboard behavior, reduced motion, responsive viewports, axe, and production performance budgets. `verify:recovery` exercises payment reconciliation, expired media leases, export/restore, and repeated setup.

The complete evidence map is [`capability-evidence.md`](capability-evidence.md). Model and task use are recorded in [`model-and-agent-use.md`](model-and-agent-use.md).

## Hosted route

The local demonstration and isolated hosted technical proof are complete. Vercel, Supabase, Stripe sandbox, both private workers, protected delivery, account isolation, and two guarded resets are recorded in [`hosted-evidence-record.md`](hosted-evidence-record.md). Sharing the hosted URL or credentials remains a separate competition-closeout approval.

No public URL or hosted proof should be claimed until those steps have actually passed and Michael has approved sharing access.
