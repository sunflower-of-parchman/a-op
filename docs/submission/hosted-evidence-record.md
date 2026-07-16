# Hosted judging evidence record

This record stores the completed isolated hosted technical proof and safe evidence only. Provider secrets, full project references, passwords, raw webhook payloads, customer-like identifiers, private URLs, and access tokens belong in approved private provider or judging records. Repository sharing, judge credentials, video publication, and Devpost submission remain separate competition-closeout actions.

## Candidate

| Field                        | Status | Safe evidence                                                                                              |
| ---------------------------- | ------ | ---------------------------------------------------------------------------------------------------------- |
| Final public name            | Ready  | Artist-Owned Platform                                                                                      |
| License                      | Ready  | `AGPL-3.0-or-later`                                                                                        |
| Prior verified baseline      | Ready  | `fe2062aacaa9c808d6b05103d9fbcff144248ea0`                                                                 |
| Current technical candidate  | Ready  | `c56a9bd170237288bae8eb1852fe1b281063952d`                                                                 |
| Current exact commit         | Ready  | Local immutable tag `build-week-hosted-candidate-20260715-221715` resolves exactly to `c56a9bd`            |
| Evidence branch relationship | Ready  | Private `main` is the Git-connected deployment branch; this later evidence-only commit remains local       |
| Detached worktree rehearsal  | Pass   | Clean tracked worktree resolved the current tag to exact commit `f93af02`; migration `sha256:b74ee9c016ca` |
| Prior local full aggregate   | Pass   | Complete Node 24 aggregate passed at immutable candidate `build-week-hosted-candidate-20260715-121920`     |
| Current full aggregate       | Pass   | Exact commit `c56a9bd` passed all 16 Linux CI jobs, including the complete desktop/mobile browser gate     |
| Current focused verification | Pass   | Lint, typecheck, formatting, 28 unit tests, local setup, migrations, seed, and generated types passed      |
| Current Vercel deployment    | Pass   | Exact `c56a9bd` Git deployment reached Ready with web, media-worker, and document-worker services          |
| Dependency audit             | Pass   | Zero vulnerabilities at the unchanged candidate lockfile                                                   |
| Local schema lint            | Pass   | No error-level findings in `public` or `private` at the prior full baseline                                |
| Linux CI all jobs            | Pass   | Run `29469961758` completed 16/16 at exact runtime `c56a9bd`; no failed or skipped job                     |

## Authorization ledger

| External action                            | Status    | Michael approval reference                   | Executed by / at                                                                                      |
| ------------------------------------------ | --------- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Create or select Supabase judge project    | Executed  | Stage 1 approved in this task, 2026-07-15    | Primary task / 2026-07-15T18:44:42Z                                                                   |
| Create or select Stripe test resources     | Executed  | Stage 1 approved in this task, 2026-07-15    | Primary task / 2026-07-15T19:43:37Z                                                                   |
| Create or select Vercel judge project      | Executed  | Stage 1 approved in this task, 2026-07-15    | Primary task / 2026-07-15T19:01:29Z                                                                   |
| Link and dry-run Supabase migrations       | Executed  | Stage 2A approved in this task, 2026-07-15   | Primary task / 2026-07-15T20:44:15Z                                                                   |
| Apply Supabase migrations                  | Executed  | Stage 2B approved in this task, 2026-07-15   | Primary task / 2026-07-15T20:50:39Z                                                                   |
| Seed hosted fixtures                       | Executed  | Stage 3 approved in this task, 2026-07-15    | Primary task / 2026-07-15T21:01:49Z                                                                   |
| Create Stripe sandbox catalog and mappings | Executed  | Stage 4A approved in this task, 2026-07-15   | Primary task / 2026-07-15T21:24:04Z                                                                   |
| Complete Stripe sandbox license catalog    | Executed  | Stage 4A-2 approved in this task, 2026-07-15 | Primary task / 2026-07-15T21:37:07Z                                                                   |
| Run read-only Supabase advisors            | Executed  | Proceed instruction in this task, 2026-07-15 | Primary task / 2026-07-15T23:15:03Z; no provider mutation                                             |
| Dry-run advisor policy migration           | Executed  | Read-only preflight in this task, 2026-07-15 | Primary task / 2026-07-15T23:58:39Z; exactly one migration proposed; zero applied                     |
| Apply advisor policy migration             | Executed  | Michael approved both isolated actions       | Primary task / 2026-07-16T00:05Z; exact reviewed migration only                                       |
| Enable leaked-password protection          | Disposed  | Bounded approval checked, 2026-07-15         | Build Week organization is on Free; Pro-or-higher feature unavailable; no provider change             |
| Deploy immutable Services application      | Executed  | Michael directed Git deployment, 2026-07-15  | Private Git-connected Production deployment; platform aliases only; no custom domain or public share  |
| Temporary first-deployment bootstrap       | Contained | Separately approved in this task, 2026-07-15 | Vercel assigned two automatic aliases despite `--skip-domain`; removed exactly / 2026-07-15T23:02:46Z |
| Create private GitHub repository           | Executed  | Michael directed Git connection, 2026-07-15  | `sunflower-of-parchman/artist-owned-platform-build-week`; private; clean `main` pushed                |
| Connect exact Git repository to Vercel     | Executed  | Michael directed Git connection, 2026-07-15  | Vercel success confirmation / 2026-07-16T01:38Z; zero deployments immediately afterward               |
| Execute hosted reset                       | Executed  | Michael approved technical closeout          | Guarded reset passed twice; final check restored exact fixture and provider mappings                  |
| Assign custom domain                       | Not done  | Not authorized                               | Platform-managed project aliases only; no custom domain or DNS change                                 |
| Share judge URL and credentials            | Pending   |                                              |                                                                                                       |
| Publish repository                         | Pending   |                                              |                                                                                                       |
| Publish video                              | Pending   |                                              |                                                                                                       |
| Submit Devpost entry                       | Pending   |                                              |                                                                                                       |

## Resource boundaries

The repository now has a private GitHub remote at `sunflower-of-parchman/artist-owned-platform-build-week`, with `main` as its default branch. Vercel is connected to that exact repository. This is private hosting for deployment automation; it does not grant public or judge access. Immediately after connection, the Vercel Deployments page still reported no results. Michael's subsequent commit-and-push instruction authorizes the Git push that will trigger the first connected build. The prior temporary bootstrap proposal is retired and must not be retried.

| Resource         | Status | Safe reference hash/suffix | Isolation check                                                                                 |
| ---------------- | ------ | -------------------------- | ----------------------------------------------------------------------------------------------- |
| Supabase project | Ready  | `sha256:9890053715f8`      | New Free organization; one Nano project; `us-west-2`; checkout linked only to approved project  |
| Stripe context   | Ready  | `sha256:24efed888794`      | Blank named sandbox; dedicated CLI profile; live mode untouched                                 |
| Vercel project   | Ready  | `sha256:f108c4d15ee5`      | Exact-name Services project; private Git-connected Production deployment; platform aliases only |
| Media worker     | Pass   | job suffix `9a4f941e`      | Private bound service processed, retried, and recovered the fictional source                    |
| Document worker  | Pass   | license suffix `b893176f`  | Private bound service completed the protected two-page license PDF                              |

## Supabase evidence

| Check                                        | Status | Timestamp / safe result                                                                                                   |
| -------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------- |
| Link matches approved project                | Pass   | 2026-07-15T20:44:15Z; exact name and `sha256:9890053715f8` matched                                                        |
| Migration dry run reviewed                   | Pass   | 2026-07-15T20:44:15Z; 11 tracked migrations proposed in order; 0 remote before and after                                  |
| Forward migrations applied                   | Pass   | 2026-07-16T00:05Z; exactly 12 reviewed files total; no seed, roles, reset, repair, account, storage, or Stripe change     |
| Remote migration history exact               | Pass   | 2026-07-16T00:06Z; 12 local and 12 remote versions match exactly                                                          |
| Advisor migration dry run                    | Pass   | 2026-07-15T23:58:39Z; exact project hash matched; only `20260715231631_optimize_rls_advisor_policies.sql` proposed        |
| Public generated types match                 | Pass   | 2026-07-15T20:50:39Z; byte-exact after removing environment-specific PostgREST `14.5` metadata                            |
| Public/private schema lint                   | Pass   | 2026-07-15T20:50:39Z; no schema errors found                                                                              |
| Anonymous publication                        | Pass   | 2026-07-15T21:01:49Z; Daymark Assembly public configuration and published content verified; fixture `sha256:ba0da2991582` |
| Owner/editor/customer/service isolation      | Pass   | 2026-07-15T21:01:49Z; exact four-account set verified as owner, editor, customer, and customer                            |
| Seven storage boundaries                     | Pass   | 2026-07-15T21:01:49Z; all seven dedicated buckets verified with 6 fictional fixture objects                               |
| Hosted advisor baseline                      | Pass   | 2026-07-15T23:15:03Z; read-only report `sha256:795729cdf9bd`; 155 results, 0 errors, 31 warnings, 124 information         |
| Security Advisor                             | Pass   | 1 accepted warning: leaked-password protection requires Pro or higher; Build Week organization is on Free                 |
| Performance Advisor                          | Pass   | 2026-07-16T00:07:37Z; all 30 prior database-policy warnings resolved in the isolated hosted project                       |
| Local advisor verification                   | Pass   | 2026-07-15T23:24:12Z; `sha256:bb8be34b228d`; 0 errors, 0 warnings, 127 information items after a fresh reset              |
| Hosted post-migration advisors               | Pass   | 2026-07-16T00:07:37Z; `sha256:eb42bced1055`; 125 results, 0 errors, 1 Auth warning, 124 information                       |
| Final hosted advisors after Auth disposition | Pass   | 2026-07-16T00:35:35Z; `sha256:eb42bced1055`; 125 results, 0 errors, 1 plan-limited Auth warning, 124 information          |
| Hosted fixture integrity after migration     | Pass   | 2026-07-16T00:08Z; exact project and fixture hashes, 4 accounts, 4 mappings, 6 objects, no session rotation               |
| Hosted identity domain differs from `.local` | Pass   | 2026-07-15T21:01:49Z; four unique hosted identities use non-local domains                                                 |

The successful push ended with a non-fatal local pg-delta catalog-cache warning about a missing temporary certificate path. Direct migration-history, type-generation, and linked-lint verification all passed afterward. No migration repair, reset, or retry was performed.

The approved forward migration `20260715231631_optimize_rls_advisor_policies.sql` was the only file proposed by the final dry run and the only migration applied. The CLI repeated its known non-fatal pg-delta certificate-cache warning after application; authoritative follow-up proved exact 12/12 migration history and no linked `public` or `private` schema errors. The hosted advisor rerun reduced the result from 31 warnings to one: all 17 auth initialization-plan and 13 overlapping-policy warnings are gone, leaving only `auth_leaked_password_protection`. A guarded hosted check preserved the exact project and fixture fingerprints, four fictional accounts, four provider mappings, and six storage objects without rotating sessions. [Supabase documents leaked-password protection as available on Pro plans and above](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). Read-only dashboard inspection confirmed the isolated Build Week organization is on Free, so Michael's bounded approval could not enable the feature. The setting, plan, and billing remained unchanged. The final advisor rerun at `2026-07-16T00:35:35Z` returned the same `sha256:eb42bced1055` report, 0 errors, 1 accepted plan-limited Auth warning, and 124 information items. The raw reports stay in private temporary files and are represented here only by safe hashes and counts.

The guarded Stage 3 initializer and a separate hosted check both passed at reset contract version `2026-07-15.1`. They verified fixture `sha256:ba0da2991582`, four fictional Auth accounts, six storage objects, and an initial Stripe provider-mapping count of zero. Stage 4A then verified three provider mappings. After Stage 4A-2, another independent check preserved the same fixture, account, and storage results while verifying four provider mappings. The private account and environment inputs remain ignored with file mode `0600`; this record contains no emails, passwords, API keys, or full project reference. No Sound for Movement codebase or provider resource was read or changed during initialization or mapping.

## Stripe evidence

| Journey                                 | Status | Safe event suffix/hash / result                                                                                                                                                                                                                                                                                        |
| --------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Test or sandbox mode confirmed          | Pass   | 2026-07-15T21:37:07Z; all four products and prices returned `livemode: false`                                                                                                                                                                                                                                          |
| Sandbox catalog and owner mappings      | Pass   | 2026-07-15T21:37:07Z; 4 products, 4 prices, and 4 mappings: download `sha256:17ba0837a9ec` / `sha256:ad6d6f333fb0`; dance-film license `sha256:3cfdd1b9bdac` / `sha256:2b580f5891ab`; live-performance license `sha256:6a4caf5aba0d` / `sha256:6fb5baecea00`; membership `sha256:25eb8bdf879c` / `sha256:89a75f244374` |
| One-time Checkout                       | Pass   | Stripe sandbox completed USD 12 checkout; order suffix `6158c2af`                                                                                                                                                                                                                                                      |
| Signed webhook                          | Pass   | Exact eight-event endpoint enabled; all provider objects reported `livemode: false`                                                                                                                                                                                                                                    |
| Same-event replay                       | Pass   | Event suffix replay preserved one durable payment-event row                                                                                                                                                                                                                                                            |
| One order and one entitlement           | Pass   | Verified purchase granted one protected download before refund                                                                                                                                                                                                                                                         |
| Cross-account protected-delivery denial | Pass   | Second hosted customer received 403 for purchase media and issued license                                                                                                                                                                                                                                              |
| Membership activation                   | Pass   | Monthly membership activated from authoritative `invoice.paid`                                                                                                                                                                                                                                                         |
| Customer portal cancellation            | Pass   | Portal scheduled the service end; dated `cancel_at` representation reconciled as scheduled cancellation                                                                                                                                                                                                                |
| Membership access removal               | Pass   | Terminal sandbox cancellation produced `canceled`; all membership grants became non-active                                                                                                                                                                                                                             |
| Partial and full refund                 | Pass   | Partial refund preserved access; cumulative USD 12 refund set order `refunded` and protected delivery returned 403                                                                                                                                                                                                     |
| License Checkout and frozen terms       | Pass   | USD 75 dance-film license issued with immutable artist, licensee, project, use, price, and terms                                                                                                                                                                                                                       |
| Purchaser-only PDF delivery             | Pass   | Two-page, 4.3 KB PDF passed protected fetch, text extraction, both-page rendering review, owner access, and second-account 403                                                                                                                                                                                         |
| Redacted webhook recovery               | Pass   | Zero unresolved webhook failures after replay, portal, refunds, and terminal cancellation                                                                                                                                                                                                                              |

Stage 4A created the first three approved sandbox offerings: the USD 12 one-time album download, USD 75 dance-film license, and USD 8 monthly membership. Under the separate Stage 4A-2 approval, the primary task created and owner-mapped the published USD 125 live-performance license. The completed technical proof used only Stripe sandbox mode. The webhook endpoint accepts the exact eight required event types, the customer portal is test-only, and no live-mode object or real payment was created.

## Worker evidence

| Check                                     | Status | Safe digest/job suffix / result                                                                     |
| ----------------------------------------- | ------ | --------------------------------------------------------------------------------------------------- |
| Prior local media image build             | Pass   | `sha256:07b378557cfd…b5ec7de`                                                                       |
| Prior local document image build          | Pass   | `sha256:5ab269c9b80c…d61ed9a1`                                                                      |
| Current shared local image build          | Pass   | `sha256:f1ae8fc036db…ce87f`; both qualified service routes responded correctly                      |
| Private HTTP auth and redaction contract  | Pass   | Media and document health returned 200; unauthenticated work returned 401; base route returned 404  |
| Container-to-local durable queue claim    | Pass   | Both services: `processed: 0, failed: 0`                                                            |
| Vercel media image build                  | Pass   | `sha256:83df3068df4e…a6fd45`; Linux AMD64 image in the dedicated private registry                   |
| Media image matches final commit          | Pass   | Worker source and pinned lock are unchanged through final runtime `c56a9bd`; exact deployment Ready |
| Approved source upload                    | Pass   | Generated 120,078-byte fictional WAV; source `sha256:1effbec0eb88`                                  |
| `pending -> processing -> ready`          | Pass   | Hosted job suffix `9a4f941e`; all states observed                                                   |
| Immutable source hash                     | Pass   | Source hash remained `sha256:1effbec0eb88`                                                          |
| Preview and waveform                      | Pass   | One derivative, 120 waveform points, and ranged preview fetch                                       |
| Hosted public playback                    | Pass   | Published fictional release exposed a working preview control                                       |
| Media retry and expired-lease recovery    | Pass   | Retry plus expired processing lease recovered to `ready`; final attempts 3                          |
| Vercel document image build               | Pass   | `sha256:b30b286c24e9…18d6d0b`; Linux AMD64 image in the dedicated private registry                  |
| Document runtime matches pinned lock      | Pass   | Worker source and pinned lock are unchanged through final runtime `c56a9bd`; exact deployment Ready |
| License document reaches `ready`          | Pass   | License suffix `b893176f`; document job complete on attempt 1                                       |
| PDF text and purchaser-only delivery      | Pass   | Required terms extracted; both pages rendered cleanly; owner 200 and second account 403             |
| Document retry and expired-lease recovery | N/A    | Hosted acceptance required successful durable PDF delivery; retry remains a tested owner control    |

## Vercel and browser evidence

| Check                                    | Status   | Safe URL hash / result                                                                                                                                                                                                   |
| ---------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Pinned Vercel CLI                        | Pass     | `54.21.1` detected and built `web`, `media_worker`, and `document_worker`                                                                                                                                                |
| Services configuration schema            | Pass     | Current official schema accepts `services`, bindings, container runtime, and `nuxtjs`                                                                                                                                    |
| Immutable preview build                  | Pass     | `vercel build --target preview` completed from tag `build-week-hosted-candidate-20260715-161907`                                                                                                                         |
| First-deployment root cause              | Pass     | Vercel automatically promotes the first deployment of every new project to Production                                                                                                                                    |
| `--skip-domain` semantics                | Pass     | Official CLI docs limit the flag to custom Production domains; pinned CLI `54.21.1` sends `autoAssignCustomDomains: false`, not a platform-URL suppression request                                                       |
| Initial deployment classification        | Disposed | The first-deployment Production behavior is accepted under Michael's later Git-deployment direction; the earlier bootstrap attempts remain contained                                                                     |
| Prior containment                        | Pass     | The three pre-Git attempts were removed exactly before the user-directed Git deployment path                                                                                                                             |
| Current deployment inventory             | Pass     | Private Git-connected Production deployment contains `web`, `media_worker`, and `document_worker`                                                                                                                        |
| Git automation                           | Pass     | Exact private repository and `main` are connected to the isolated project                                                                                                                                                |
| Environment scope boundary               | Pass     | Six encrypted application values cover Production and Preview; canonical site origin is Production-only; webhook signing secret is sensitive and test-only                                                               |
| Project target boundary                  | Pass     | Standard Production, Preview, and Development targets exist; Preview covers all unassigned Git branches                                                                                                                  |
| Domain boundary                          | Pass     | One automatic `.vercel.app` project domain; zero custom, branch, custom-environment, or redirect domains                                                                                                                 |
| Guarded bootstrap preparation            | Pass     | Disposable no-application, no-secret Build Output package now adds `no-store`, CSP, framing, referrer, sniffing, permissions, and crawler-denial headers and mode-`0600` files                                           |
| Temporary bootstrap execution            | Blocked  | Approved artifact reached Ready, but Vercel assigned two automatic Production aliases despite `--skip-domain`; URL `sha256:23309cb9b1c19ea5fd35ca44c585f83ff8526497033dd8440c8fcd070e7e5461`; deployment removed exactly |
| Revised bootstrap contract               | Retired  | User-directed Git deployment superseded the temporary bootstrap path                                                                                                                                                     |
| Git deployment ready                     | Pass     | Platform-managed Production deployment reached Ready with all three Services                                                                                                                                             |
| Deployment identifies final commit       | Pass     | Vercel inspect reported the exact `c56a9bd` three-service deployment Ready and owning the stable aliases                                                                                                                 |
| Free unauthenticated public reachability | Pass     | Platform-managed site served the fictional public application without a live card                                                                                                                                        |
| Public health check                      | Pass     | Deployed application and private service bindings completed hosted media and document work                                                                                                                               |
| Chromium hosted route                    | Pass     | Stable Production alias passed every public judge route after the final reset                                                                                                                                            |
| WebKit hosted route                      | Pass     | Stable Production alias passed every public judge route after the final reset                                                                                                                                            |
| Browser-secret scan                      | Pass     | Built public bundle scan passed locally and in Linux CI prerequisites                                                                                                                                                    |
| Production response boundaries           | Pass     | Strict headers and explicit local-preview CSP exception verified                                                                                                                                                         |
| Accessibility and viewport checks        | Pass     | Production-shaped local Chromium/WebKit and module-specific axe/viewport checks passed                                                                                                                                   |
| Performance budgets                      | Pass     | Four-route production budgets passed locally                                                                                                                                                                             |
| Error-log review                         | Pass     | Exact deployment returned no error-level or HTTP 500 entries in the final 30-minute review                                                                                                                               |

Vercel's [CLI deployment guide](https://vercel.com/docs/projects/deploy-from-cli), [environment reference](https://vercel.com/docs/deployments/environments), and [default production domain record](https://vercel.com/blog/default-production-domain) explained the initial first-deployment classification. The temporary bootstrap attempts remain recorded as contained history. Michael later directed the private Git connection and deployment path. The resulting platform-managed Production deployment hosts the complete three-service application with no custom domain or DNS change.

The final environment contract uses encrypted Supabase and Stripe sandbox values in Production, the canonical platform URL as the production site origin, and a sensitive webhook signing secret. Stripe live mode, email, custom domains, and paid resources remain absent. Repository and judge sharing remain separate from the technical deployment.

## Reset and judge evidence

| Check                                 | Status  | Timestamp / safe hash / result                                          |
| ------------------------------------- | ------- | ----------------------------------------------------------------------- |
| Hosted reset entrypoint reviewed      | Ready   | `c3dcf2d`; version `2026-07-15.1`; local contract passed                |
| Unknown-project refusal               | Pass    | Local target/link/marker guards passed                                  |
| Fingerprint mismatch refusal          | Pass    | Canonical content drift was refused locally                             |
| First approved reset                  | Pass    | 2026-07-16; reset version `2026-07-15.1`                                |
| Representative state created          | Pass    | Media, commerce, membership, refund, license, and document proof state  |
| Second approved reset                 | Pass    | 2026-07-16; same fixture fingerprint                                    |
| Reset hashes and counts match         | Pass    | Both returned fixture `sha256:ba0da2991582`                             |
| Fixture sessions rotated              | Pass    | Each guarded reset rotated the exact four fictional identities          |
| Provider configuration preserved      | Pass    | Final check: 4 mappings, 6 fixture storage objects                      |
| Complete post-reset judge route       | Pass    | Stable Production alias passed Chromium and WebKit, 2/2 in 28.6 seconds |
| No private reference data             | Pass    | Daymark fixtures only; Sound for Movement untouched                     |
| Availability through judging deadline | Pending |                                                                         |

## Submission reconciliation

| Item                                | Status  | Safe evidence                                           |
| ----------------------------------- | ------- | ------------------------------------------------------- |
| Primary task ID                     | Ready   | `019f6291-c1c9-7cf3-9da7-be2a19b7154c`                  |
| GPT-5.6 Sol/Pro contribution record | Ready   | Exported Sol runtime metadata; supplied Pro plan review |
| `/feedback` Session ID              | Pending |                                                         |
| Final video timecodes               | Pending |                                                         |
| Frame-by-frame privacy review       | Pending |                                                         |
| Approved public repository URL      | Pending |                                                         |
| Approved hosted URL                 | Pending |                                                         |
| Approved public video URL           | Pending |                                                         |
| Devpost preview review              | Pending |                                                         |
| Devpost submission confirmation     | Pending |                                                         |

## Final result

Status: **Technical proof complete; competition closeout pending**

The isolated three-service application, media worker, document worker, Supabase fixtures, Stripe sandbox journeys, protected delivery, guarded resets, provider-preservation checks, exact-commit Linux CI, post-reset Chromium/WebKit judge route, and final runtime-log review are complete at immutable runtime `c56a9bd`. Repository sharing, credentials, video, and Devpost remain competition-closeout actions requiring their own approval.
