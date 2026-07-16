# Hosted judging evidence record

This record stays pending until an approved operator executes the corresponding stage in [`hosted-operator-runbook.md`](hosted-operator-runbook.md). It stores safe evidence only. Provider secrets, full project references, passwords, raw webhook payloads, customer-like identifiers, private URLs, and access tokens belong in approved private provider or judging records.

## Candidate

| Field                           | Status  | Safe evidence                                                                                              |
| ------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------- |
| Final public name               | Ready   | Artist-Owned Platform                                                                                      |
| License                         | Ready   | `AGPL-3.0-or-later`                                                                                        |
| Prior verified baseline         | Ready   | `fe2062aacaa9c808d6b05103d9fbcff144248ea0`                                                                 |
| Current immutable candidate tag | Ready   | `build-week-hosted-candidate-20260715-175142`                                                              |
| Current exact commit            | Ready   | `f93af023daf41a59c86251b471219b9a6eed4afc`                                                                 |
| Evidence branch relationship    | Ready   | The deployment candidate is a detached exact-commit worktree; later evidence commits remain outside it     |
| Detached worktree rehearsal     | Pass    | Clean tracked worktree resolved the current tag to exact commit `f93af02`; migration `sha256:b74ee9c016ca` |
| Prior local full aggregate      | Pass    | Complete Node 24 aggregate passed at immutable candidate `build-week-hosted-candidate-20260715-121920`     |
| Current full aggregate          | Pass    | Exact commit `f93af02` passed every local module, recovery, browser, package, and secret gate              |
| Current focused verification    | Pass    | Local advisors returned zero warnings/errors; all affected authority suites passed                         |
| Current Vercel preview build    | Pending | Prior candidate built all three services; exact current candidate requires a fresh Preview build           |
| Dependency audit                | Pass    | Zero vulnerabilities at the unchanged candidate lockfile                                                   |
| Local schema lint               | Pass    | No error-level findings in `public` or `private` at the prior full baseline                                |
| Linux CI all jobs               | Pending |                                                                                                            |

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
| Enable leaked-password protection          | Pending   |                                              | Only if already entitled; no plan upgrade or billing change                                           |
| Deploy immutable Services preview          | Blocked   | Stage 6 approved in this task, 2026-07-15    | Preview build passed; application deployments remain zero                                             |
| Temporary first-deployment bootstrap       | Contained | Separately approved in this task, 2026-07-15 | Vercel assigned two automatic aliases despite `--skip-domain`; removed exactly / 2026-07-15T23:02:46Z |
| Execute hosted reset                       | Pending   |                                              |                                                                                                       |
| Assign production alias or domain          | Pending   |                                              |                                                                                                       |
| Share judge URL and credentials            | Pending   |                                              |                                                                                                       |
| Publish repository                         | Pending   |                                              |                                                                                                       |
| Publish video                              | Pending   |                                              |                                                                                                       |
| Submit Devpost entry                       | Pending   |                                              |                                                                                                       |

## Resource boundaries

| Resource         | Status | Safe reference hash/suffix    | Isolation check                                                                                |
| ---------------- | ------ | ----------------------------- | ---------------------------------------------------------------------------------------------- |
| Supabase project | Ready  | `sha256:9890053715f8`         | New Free organization; one Nano project; `us-west-2`; checkout linked only to approved project |
| Stripe context   | Ready  | `sha256:24efed888794`         | Blank named sandbox; dedicated CLI profile; live mode untouched                                |
| Vercel project   | Ready  | `sha256:f108c4d15ee5`         | Exact-name Services project; Git unlinked; `hasDeployments: false`; `live: false`              |
| Media worker     | Built  | `sha256:83df3068df4e…a6fd45`  | Private image built in the dedicated project registry; no deployed runtime remains             |
| Document worker  | Built  | `sha256:b30b286c24e9…18d6d0b` | Private image built in the dedicated project registry; no deployed runtime remains             |

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
| Security Advisor                             | Action | 1 warning: leaked-password protection disabled; enable only if already entitled, otherwise record the plan limitation     |
| Performance Advisor                          | Pass   | 2026-07-16T00:07:37Z; all 30 prior database-policy warnings resolved in the isolated hosted project                       |
| Local advisor verification                   | Pass   | 2026-07-15T23:24:12Z; `sha256:bb8be34b228d`; 0 errors, 0 warnings, 127 information items after a fresh reset              |
| Hosted post-migration advisors               | Pass   | 2026-07-16T00:07:37Z; `sha256:eb42bced1055`; 125 results, 0 errors, 1 Auth warning, 124 information                       |
| Hosted fixture integrity after migration     | Pass   | 2026-07-16T00:08Z; exact project and fixture hashes, 4 accounts, 4 mappings, 6 objects, no session rotation               |
| Hosted identity domain differs from `.local` | Pass   | 2026-07-15T21:01:49Z; four unique hosted identities use non-local domains                                                 |

The successful push ended with a non-fatal local pg-delta catalog-cache warning about a missing temporary certificate path. Direct migration-history, type-generation, and linked-lint verification all passed afterward. No migration repair, reset, or retry was performed.

The approved forward migration `20260715231631_optimize_rls_advisor_policies.sql` was the only file proposed by the final dry run and the only migration applied. The CLI repeated its known non-fatal pg-delta certificate-cache warning after application; authoritative follow-up proved exact 12/12 migration history and no linked `public` or `private` schema errors. The hosted advisor rerun reduced the result from 31 warnings to one: all 17 auth initialization-plan and 13 overlapping-policy warnings are gone, leaving only `auth_leaked_password_protection`. A guarded hosted check preserved the exact project and fixture fingerprints, four fictional accounts, four provider mappings, and six storage objects without rotating sessions. [Supabase documents leaked-password protection as available on Pro plans and above](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection); Michael's approval does not authorize a plan upgrade, paid resource, or billing change. If the isolated project is not already entitled, the operator leaves the setting unchanged and records that limitation as the warning's disposition. The raw reports stay in private temporary files and are represented here only by safe hashes and counts.

The guarded Stage 3 initializer and a separate hosted check both passed at reset contract version `2026-07-15.1`. They verified fixture `sha256:ba0da2991582`, four fictional Auth accounts, six storage objects, and an initial Stripe provider-mapping count of zero. Stage 4A then verified three provider mappings. After Stage 4A-2, another independent check preserved the same fixture, account, and storage results while verifying four provider mappings. The private account and environment inputs remain ignored with file mode `0600`; this record contains no emails, passwords, API keys, or full project reference. No Sound for Movement codebase or provider resource was read or changed during initialization or mapping.

## Stripe evidence

| Journey                                 | Status  | Safe event suffix/hash / result                                                                                                                                                                                                                                                                                        |
| --------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Test or sandbox mode confirmed          | Pass    | 2026-07-15T21:37:07Z; all four products and prices returned `livemode: false`                                                                                                                                                                                                                                          |
| Sandbox catalog and owner mappings      | Pass    | 2026-07-15T21:37:07Z; 4 products, 4 prices, and 4 mappings: download `sha256:17ba0837a9ec` / `sha256:ad6d6f333fb0`; dance-film license `sha256:3cfdd1b9bdac` / `sha256:2b580f5891ab`; live-performance license `sha256:6a4caf5aba0d` / `sha256:6fb5baecea00`; membership `sha256:25eb8bdf879c` / `sha256:89a75f244374` |
| One-time Checkout                       | Pending |                                                                                                                                                                                                                                                                                                                        |
| Signed webhook                          | Pending |                                                                                                                                                                                                                                                                                                                        |
| Same-event replay                       | Pending |                                                                                                                                                                                                                                                                                                                        |
| One order and one entitlement           | Pending |                                                                                                                                                                                                                                                                                                                        |
| Cross-account protected-delivery denial | Pending |                                                                                                                                                                                                                                                                                                                        |
| Membership activation                   | Pending |                                                                                                                                                                                                                                                                                                                        |
| Customer portal cancellation            | Pending |                                                                                                                                                                                                                                                                                                                        |
| Membership access removal               | Pending |                                                                                                                                                                                                                                                                                                                        |
| Partial and full refund                 | Pending |                                                                                                                                                                                                                                                                                                                        |
| License Checkout and frozen terms       | Pending |                                                                                                                                                                                                                                                                                                                        |
| Purchaser-only PDF delivery             | Pending |                                                                                                                                                                                                                                                                                                                        |
| Redacted webhook recovery               | Pending |                                                                                                                                                                                                                                                                                                                        |

Stage 4A created the first three approved sandbox offerings: the USD 12 one-time album download, USD 75 dance-film license, and USD 8 monthly membership. Under the separate Stage 4A-2 approval, the primary task created and owner-mapped the published USD 125 live-performance license. All four published Stripe offerings now have one complete test-only product and price mapping. No Checkout session, webhook endpoint, signing secret, customer-portal configuration, deployment, live-mode object, or real payment was created.

## Worker evidence

| Check                                     | Status  | Safe digest/job suffix / result                                                                    |
| ----------------------------------------- | ------- | -------------------------------------------------------------------------------------------------- |
| Prior local media image build             | Pass    | `sha256:07b378557cfd…b5ec7de`                                                                      |
| Prior local document image build          | Pass    | `sha256:5ab269c9b80c…d61ed9a1`                                                                     |
| Current shared local image build          | Pass    | `sha256:f1ae8fc036db…ce87f`; both qualified service routes responded correctly                     |
| Private HTTP auth and redaction contract  | Pass    | Media and document health returned 200; unauthenticated work returned 401; base route returned 404 |
| Container-to-local durable queue claim    | Pass    | Both services: `processed: 0, failed: 0`                                                           |
| Vercel media image build                  | Pass    | `sha256:83df3068df4e…a6fd45`; Linux AMD64 image in the dedicated private registry                  |
| Media image matches final commit          | Pass    | Exact candidate `048fe05`; source and lockfile recorded above                                      |
| Approved source upload                    | Pending |                                                                                                    |
| `queued -> processing -> ready`           | Pending |                                                                                                    |
| Immutable source hash                     | Pending |                                                                                                    |
| Preview and waveform                      | Pending |                                                                                                    |
| Hosted public playback                    | Pending |                                                                                                    |
| Media retry and expired-lease recovery    | Pending |                                                                                                    |
| Vercel document image build               | Pass    | `sha256:b30b286c24e9…18d6d0b`; Linux AMD64 image in the dedicated private registry                 |
| Document runtime matches pinned lock      | Pass    | Exact candidate `048fe05`; source and lockfile recorded above                                      |
| License document reaches `ready`          | Pending |                                                                                                    |
| PDF text and purchaser-only delivery      | Pending |                                                                                                    |
| Document retry and expired-lease recovery | Pending |                                                                                                    |

## Vercel and browser evidence

| Check                                    | Status  | Safe URL hash / result                                                                                                                                                                                                   |
| ---------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Pinned Vercel CLI                        | Pass    | `54.21.1` detected and built `web`, `media_worker`, and `document_worker`                                                                                                                                                |
| Services configuration schema            | Pass    | Current official schema accepts `services`, bindings, container runtime, and `nuxtjs`                                                                                                                                    |
| Immutable preview build                  | Pass    | `vercel build --target preview` completed from tag `build-week-hosted-candidate-20260715-161907`                                                                                                                         |
| First-deployment root cause              | Pass    | Vercel automatically promotes the first deployment of every new project to Production                                                                                                                                    |
| `--skip-domain` semantics                | Pass    | Official CLI docs limit the flag to custom Production domains; pinned CLI `54.21.1` sends `autoAssignCustomDomains: false`, not a platform-URL suppression request                                                       |
| Preview deployment classification        | Blocked | Both application attempts and the approved static bootstrap became Production-classified first deployments                                                                                                               |
| Containment                              | Pass    | All three Production-classified deployments were removed; the application never reached a hosted runtime                                                                                                                 |
| Current deployment inventory             | Pass    | Exact-project API read at 2026-07-15T23:02:46Z returned zero deployments, `live: false`, and zero aliases                                                                                                                |
| Git automation excluded                  | Pass    | Project is not Git-linked; `main` production-branch automation did not cause either classification                                                                                                                       |
| Environment scope boundary               | Pass    | Exactly seven encrypted variables exist; every one is Preview-only; Production and Development have zero                                                                                                                 |
| Project target boundary                  | Pass    | Standard Production, Preview, and Development targets exist; Preview covers all unassigned Git branches                                                                                                                  |
| Domain boundary                          | Pass    | One automatic `.vercel.app` project domain; zero custom, branch, custom-environment, or redirect domains                                                                                                                 |
| Guarded bootstrap preparation            | Pass    | Disposable no-application, no-secret Build Output package now adds `no-store`, CSP, framing, referrer, sniffing, permissions, and crawler-denial headers and mode-`0600` files                                           |
| Temporary bootstrap execution            | Blocked | Approved artifact reached Ready, but Vercel assigned two automatic Production aliases despite `--skip-domain`; URL `sha256:23309cb9b1c19ea5fd35ca44c585f83ff8526497033dd8440c8fcd070e7e5461`; deployment removed exactly |
| Revised bootstrap contract               | Ready   | Prepared locally around only the immutable deployment URL and two observed Vercel-managed `.vercel.app` aliases; custom domains remain prohibited; new approval pending                                                  |
| Immutable preview ready                  | Pending | Requires explicit approval of the revised platform-managed URL contract                                                                                                                                                  |
| Deployment identifies final commit       | Pending |                                                                                                                                                                                                                          |
| Free unauthenticated public reachability | Pending |                                                                                                                                                                                                                          |
| Public health check                      | Pending |                                                                                                                                                                                                                          |
| Chromium hosted route                    | Pending |                                                                                                                                                                                                                          |
| Firefox hosted route                     | Pending |                                                                                                                                                                                                                          |
| WebKit hosted route                      | Pending |                                                                                                                                                                                                                          |
| Browser-secret scan                      | Pending |                                                                                                                                                                                                                          |
| Production response boundaries           | Pending |                                                                                                                                                                                                                          |
| Accessibility and viewport checks        | Pending |                                                                                                                                                                                                                          |
| Performance budgets                      | Pending |                                                                                                                                                                                                                          |
| Error-log review                         | Pending |                                                                                                                                                                                                                          |

Vercel's current [CLI deployment guide](https://vercel.com/docs/projects/deploy-from-cli) and [environment reference](https://vercel.com/docs/deployments/environments) describe ordinary CLI deployments without `--prod` as Preview. The separate [default production domain record](https://vercel.com/blog/default-production-domain) states the exception that explains this project: the first deployment in every newly created project is automatically promoted to Production. Removing each attempt restored the exact project to `hasDeployments: false`, so the first-deployment rule applied again, including to the explicit `--target preview` attempt. The project is not Git-linked, and its Services configuration and Preview-only environment scopes remain correct.

Commit `b8cb378` prepared the narrow mitigation: a disposable Build Output package containing one `noindex` page and no application, secret, database reference, media, or customer data. Michael separately approved its remote execution. CLI `54.21.1` deployed it with `--prebuilt --prod --skip-domain`; the static artifact reached Ready, while Vercel still assigned two automatic `.vercel.app` Production aliases. That contradicted the approved no-domain contract, so the primary task removed the exact deployment before creating the application Preview and verified zero deployments, `live: false`, zero project aliases, seven Preview-only environment values, and no custom, branch, custom-environment, or redirect domains. The bootstrap URL was neither visited nor shared and exists in tracked evidence only as the hash above. No webhook endpoint or judge share exists, and no hosted application runtime or browser claim was recorded.

The follow-up read-only review checked the official deploy and alias documentation plus the pinned CLI implementation. `--skip-domain` disables custom Production-domain auto-assignment; it does not suppress Vercel-managed platform URLs. The prepared revision retains `--skip-domain`, hardens every bootstrap response, records that platform-managed URLs are expected while custom domains are forbidden, and requires immediate removal on any broader state. This preparation created no provider state and does not authorize another deployment.

## Reset and judge evidence

| Check                                 | Status  | Timestamp / safe hash / result                           |
| ------------------------------------- | ------- | -------------------------------------------------------- |
| Hosted reset entrypoint reviewed      | Ready   | `c3dcf2d`; version `2026-07-15.1`; local contract passed |
| Unknown-project refusal               | Pass    | Local target/link/marker guards passed                   |
| Fingerprint mismatch refusal          | Pass    | Canonical content drift was refused locally              |
| First approved reset                  | Pending |                                                          |
| Representative state created          | Pending |                                                          |
| Second approved reset                 | Pending |                                                          |
| Reset hashes and counts match         | Pending |                                                          |
| Fixture sessions rotated              | Pending |                                                          |
| Provider configuration preserved      | Pending |                                                          |
| Complete post-reset judge route       | Pending |                                                          |
| No private reference data             | Pending |                                                          |
| Availability through judging deadline | Pending |                                                          |

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

Status: **Pending**

The immutable three-service build and hardened revised bootstrap artifact remain ready. Hosted verification is waiting for action-specific approval of the platform-managed URL contract; the original no-domain contract was contained and fully rolled back. The hosted judging environment is complete only when every required row above is `Pass` or carries a written, approved, non-capability-reducing disposition. A failure or contradiction reopens the corresponding implementation requirement.
