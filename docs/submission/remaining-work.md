# Remaining work after technical closeout

Michael resumed the Build Week goal on July 15, 2026 and authorized the isolated hosted technical proof. Chrome/Chromium and Safari/WebKit are the supported browser matrix. Firefox is outside the project contract and must not be added to local or CI verification.

## Completed technical work

- [x] Private GitHub `main` is connected to the isolated Vercel Services project and deploys the Nuxt application, private media worker, and private document worker.
- [x] Production and Preview use the complete encrypted Supabase, Stripe sandbox, worker, webhook, and canonical-site configuration. No custom domain, DNS, live Stripe mode, email, or paid resource was added.
- [x] The hosted media worker processed one generated fictional WAV through `pending -> processing -> ready`, produced a 120-point waveform and one playable derivative, and passed retry plus expired-lease recovery.
- [x] Stripe sandbox proved one-time purchase, signed fulfillment, same-event replay idempotency, membership activation, customer-portal scheduled cancellation, terminal access removal, partial-refund access preservation, full-refund revocation, license checkout, protected PDF delivery, and cross-account denial.
- [x] The document worker produced a two-page protected license PDF. Text extraction found the frozen fictional artist, licensee, project, track, price, supported use, and terms; both rendered pages were visually inspected without clipping or overlap.
- [x] Refund handling accepts Stripe's required `refund.created` event as well as later `refund.updated` changes. Scheduled portal cancellations reconcile either `cancel_at_period_end` or Stripe's dated `cancel_at` representation.
- [x] The guarded hosted reset excludes transactional license documents from artist catalog drift, continues to refuse real catalog changes, passed its disposable local contract, then reset the isolated hosted project twice with the same fixture fingerprint.
- [x] The final hosted check restored four rotated fictional accounts, four Stripe mappings, and six fixture storage objects at reset contract `2026-07-15.1`. Sound for Movement remained untouched.
- [x] Clean-runner verification now installs FFmpeg where required, builds before browser-secret scanning, uses a local production preview for Chromium/WebKit, and generates tracked Supabase types in one dedicated CI job instead of parallel registry pulls.

## Deferred competition closeout

The following items are intentionally deferred until iteration and submission closeout:

1. Confirm the final `/feedback` Session ID and reconcile final Sol/Pro metadata language.
2. Record and inspect the under-three-minute video, then add real capability-evidence timecodes.
3. Obtain separate approvals for repository or judge access, YouTube publication, Devpost preview, and Devpost submission.
4. Preserve final submission confirmation before July 21, 2026 at 6:00 PM Mountain.

## Boundaries

- No Firefox verification remains.
- No custom domain, DNS change, live Stripe object, email, paid plan, social post, public video, judge credential share, or Devpost submission was performed.
- The private repository and Vercel deployment are technical infrastructure, not publication approval.
- Sound for Movement code, tables, resources, branding, customer data, and media remain untouched.
