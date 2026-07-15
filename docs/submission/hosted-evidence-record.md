# Hosted judging evidence record

This record stays pending until an approved operator executes the corresponding stage in [`hosted-operator-runbook.md`](hosted-operator-runbook.md). It stores safe evidence only. Provider secrets, full project references, passwords, raw webhook payloads, customer-like identifiers, private URLs, and access tokens belong in approved private provider or judging records.

## Candidate

| Field                           | Status  | Safe evidence                                                    |
| ------------------------------- | ------- | ---------------------------------------------------------------- |
| Final public name               | Ready   | Artist-Owned Platform                                            |
| License                         | Ready   | `AGPL-3.0-or-later`                                              |
| Prior verified baseline         | Ready   | `fe2062aacaa9c808d6b05103d9fbcff144248ea0`                       |
| Current immutable candidate tag | Ready   | `build-week-hosted-candidate-20260715-121920`                    |
| Current exact commit            | Ready   | `04f23fa4b8632b04609cd2689b3b575ec2b193b0`                       |
| Evidence branch relationship    | Ready   | Later documentation commits stay outside the candidate worktree  |
| Detached worktree rehearsal     | Pass    | Clean worktree resolved the tag to exact commit `04f23fa`        |
| Local worker-service contract   | Pass    | Unit, FFmpeg, PDF, two image builds, auth, and queue checks pass |
| Current local full aggregate    | Pass    | Complete Node 24 aggregate passed at the tagged commit           |
| Dependency audit                | Pass    | Zero vulnerabilities at the candidate lockfile                   |
| Local schema lint               | Pass    | No error-level findings in `public` or `private`                 |
| Linux CI all jobs               | Pending |                                                                  |

## Authorization ledger

| External action                         | Status  | Michael approval reference            | Executed by / at |
| --------------------------------------- | ------- | ------------------------------------- | ---------------- |
| Create or select Supabase judge project | Executed | Stage 1 approved in this task, 2026-07-15 | Primary task / 2026-07-15T18:44:42Z |
| Create or select Stripe test resources  | Executed | Stage 1 approved in this task, 2026-07-15 | Primary task / 2026-07-15T19:43:37Z |
| Create or select Vercel judge project   | Executed | Stage 1 approved in this task, 2026-07-15 | Primary task / 2026-07-15T19:01:29Z |
| Link and dry-run Supabase migrations    | Executed | Stage 2A approved in this task, 2026-07-15 | Primary task / 2026-07-15T20:44:15Z |
| Apply Supabase migrations               | Executed | Stage 2B approved in this task, 2026-07-15 | Primary task / 2026-07-15T20:50:39Z |
| Seed hosted fixtures                    | Pending |                                       |                  |
| Deploy immutable Services preview       | Pending | Includes web and both private workers |                  |
| Execute hosted reset                    | Pending |                                       |                  |
| Assign production alias or domain       | Pending |                                       |                  |
| Share judge URL and credentials         | Pending |                                       |                  |
| Publish repository                      | Pending |                                       |                  |
| Publish video                           | Pending |                                       |                  |
| Submit Devpost entry                    | Pending |                                       |                  |

## Resource boundaries

| Resource         | Status  | Safe reference hash/suffix | Isolation check |
| ---------------- | ------- | -------------------------- | --------------- |
| Supabase project | Ready   | `sha256:9890053715f8`         | New Free organization; one Nano project; `us-west-2`; checkout linked only to approved project |
| Stripe context   | Ready   | `sha256:24efed888794`      | Blank named sandbox; dedicated CLI profile; live mode untouched |
| Vercel project   | Ready   | `sha256:f108c4d15ee5`         | Exact-name project; Services preset; checkout unlinked |
| Media worker     | Pending |                            |                 |
| Document worker  | Pending |                            |                 |

## Supabase evidence

| Check                                        | Status  | Timestamp / safe result |
| -------------------------------------------- | ------- | ----------------------- |
| Link matches approved project                | Pass    | 2026-07-15T20:44:15Z; exact name and `sha256:9890053715f8` matched |
| Migration dry run reviewed                   | Pass    | 2026-07-15T20:44:15Z; 11 tracked migrations proposed in order; 0 remote before and after |
| Forward migrations applied                   | Pass    | 2026-07-15T20:50:39Z; exactly 11 reviewed files; no seed, roles, reset, or repair |
| Remote migration history exact               | Pass    | 2026-07-15T20:50:39Z; 11 local and 11 remote versions in identical order |
| Public generated types match                 | Pass    | 2026-07-15T20:50:39Z; byte-exact after removing environment-specific PostgREST `14.5` metadata |
| Public/private schema lint                   | Pass    | 2026-07-15T20:50:39Z; no schema errors found |
| Anonymous publication                        | Pending |                         |
| Owner/editor/customer/service isolation      | Pending |                         |
| Seven storage boundaries                     | Pending |                         |
| Security Advisor                             | Pending |                         |
| Performance Advisor                          | Pending |                         |
| Hosted identity domain differs from `.local` | Pending |                         |

The successful push ended with a non-fatal local pg-delta catalog-cache warning about a missing temporary certificate path. Direct migration-history, type-generation, and linked-lint verification all passed afterward. No migration repair, reset, or retry was performed.

## Stripe evidence

| Journey                                 | Status  | Safe event suffix/hash / result |
| --------------------------------------- | ------- | ------------------------------- |
| Test or sandbox mode confirmed          | Pass    | 2026-07-15T19:43:37Z; authenticated read returned `livemode: false` |
| One-time Checkout                       | Pending |                                 |
| Signed webhook                          | Pending |                                 |
| Same-event replay                       | Pending |                                 |
| One order and one entitlement           | Pending |                                 |
| Cross-account protected-delivery denial | Pending |                                 |
| Membership activation                   | Pending |                                 |
| Customer portal cancellation            | Pending |                                 |
| Membership access removal               | Pending |                                 |
| Partial and full refund                 | Pending |                                 |
| License Checkout and frozen terms       | Pending |                                 |
| Purchaser-only PDF delivery             | Pending |                                 |
| Redacted webhook recovery               | Pending |                                 |

## Worker evidence

| Check                                     | Status  | Safe digest/job suffix / result                      |
| ----------------------------------------- | ------- | ---------------------------------------------------- |
| Local media image builds                  | Pass    | `sha256:07b378557cfd…b5ec7de`                        |
| Local document image builds               | Pass    | `sha256:5ab269c9b80c…d61ed9a1`                       |
| Private HTTP auth and redaction contract  | Pass    | Health 200; no-auth 401; generic failure only        |
| Container-to-local durable queue claim    | Pass    | Both services: `processed: 0, failed: 0`             |
| Media image matches final commit          | Pass    | Candidate source and lockfile; digest recorded above |
| Approved source upload                    | Pending |                                                      |
| `queued -> processing -> ready`           | Pending |                                                      |
| Immutable source hash                     | Pending |                                                      |
| Preview and waveform                      | Pending |                                                      |
| Hosted public playback                    | Pending |                                                      |
| Media retry and expired-lease recovery    | Pending |                                                      |
| Document runtime matches pinned lock      | Pass    | Candidate source and lockfile; digest recorded above |
| License document reaches `ready`          | Pending |                                                      |
| PDF text and purchaser-only delivery      | Pending |                                                      |
| Document retry and expired-lease recovery | Pending |                                                      |

## Vercel and browser evidence

| Check                                    | Status  | Safe URL hash / result                                                                |
| ---------------------------------------- | ------- | ------------------------------------------------------------------------------------- |
| Pinned Vercel CLI                        | Pass    | `54.21.1` detected `web`, `media_worker`, and `document_worker`                       |
| Services configuration schema            | Pass    | Current official schema accepts `services`, bindings, container runtime, and `nuxtjs` |
| Immutable preview ready                  | Pending |                                                                                       |
| Deployment identifies final commit       | Pending |                                                                                       |
| Free unauthenticated public reachability | Pending |                                                                                       |
| Public health check                      | Pending |                                                                                       |
| Chromium hosted route                    | Pending |                                                                                       |
| Firefox hosted route                     | Pending |                                                                                       |
| WebKit hosted route                      | Pending |                                                                                       |
| Browser-secret scan                      | Pending |                                                                                       |
| Production response boundaries           | Pending |                                                                                       |
| Accessibility and viewport checks        | Pending |                                                                                       |
| Performance budgets                      | Pending |                                                                                       |
| Error-log review                         | Pending |                                                                                       |

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

The hosted judging environment is complete only when every required row above is `Pass` or carries a written, approved, non-capability-reducing disposition. A failure or contradiction reopens the corresponding implementation requirement.
