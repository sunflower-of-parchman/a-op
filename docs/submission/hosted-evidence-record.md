# Hosted judging evidence record

This record stays pending until an approved operator executes the corresponding stage in [`hosted-operator-runbook.md`](hosted-operator-runbook.md). It stores safe evidence only. Provider secrets, full project references, passwords, raw webhook payloads, customer-like identifiers, private URLs, and access tokens belong in approved private provider or judging records.

## Candidate

| Field                     | Status  | Safe evidence |
| ------------------------- | ------- | ------------- |
| Final public name         | Pending |               |
| License                   | Pending |               |
| Exact 40-character commit | Pending |               |
| Local full aggregate      | Pending |               |
| Dependency audit          | Pending |               |
| Local schema lint         | Pending |               |
| Linux CI all jobs         | Pending |               |

## Authorization ledger

| External action                         | Status  | Michael approval reference | Executed by / at |
| --------------------------------------- | ------- | -------------------------- | ---------------- |
| Create or select Supabase judge project | Pending |                            |                  |
| Create or select Stripe test resources  | Pending |                            |                  |
| Create or select Vercel judge project   | Pending |                            |                  |
| Deploy media worker                     | Pending |                            |                  |
| Deploy document worker                  | Pending |                            |                  |
| Apply Supabase migrations               | Pending |                            |                  |
| Seed hosted fixtures                    | Pending |                            |                  |
| Deploy immutable preview                | Pending |                            |                  |
| Execute hosted reset                    | Pending |                            |                  |
| Assign production alias or domain       | Pending |                            |                  |
| Share judge URL and credentials         | Pending |                            |                  |
| Publish repository                      | Pending |                            |                  |
| Publish video                           | Pending |                            |                  |
| Submit Devpost entry                    | Pending |                            |                  |

## Resource boundaries

| Resource         | Status  | Safe reference hash/suffix | Isolation check |
| ---------------- | ------- | -------------------------- | --------------- |
| Supabase project | Pending |                            |                 |
| Stripe context   | Pending |                            |                 |
| Vercel project   | Pending |                            |                 |
| Media worker     | Pending |                            |                 |
| Document worker  | Pending |                            |                 |

## Supabase evidence

| Check                                        | Status  | Timestamp / safe result |
| -------------------------------------------- | ------- | ----------------------- |
| Link matches approved project                | Pending |                         |
| Migration dry run reviewed                   | Pending |                         |
| Forward migrations applied                   | Pending |                         |
| Remote migration history exact               | Pending |                         |
| Public generated types match                 | Pending |                         |
| Public/private schema lint                   | Pending |                         |
| Anonymous publication                        | Pending |                         |
| Owner/editor/customer/service isolation      | Pending |                         |
| Seven storage boundaries                     | Pending |                         |
| Security Advisor                             | Pending |                         |
| Performance Advisor                          | Pending |                         |
| Hosted identity domain differs from `.local` | Pending |                         |

## Stripe evidence

| Journey                                 | Status  | Safe event suffix/hash / result |
| --------------------------------------- | ------- | ------------------------------- |
| Test or sandbox mode confirmed          | Pending |                                 |
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

| Check                                     | Status  | Safe digest/job suffix / result |
| ----------------------------------------- | ------- | ------------------------------- |
| Media image matches final commit          | Pending |                                 |
| Approved source upload                    | Pending |                                 |
| `queued -> processing -> ready`           | Pending |                                 |
| Immutable source hash                     | Pending |                                 |
| Preview and waveform                      | Pending |                                 |
| Hosted public playback                    | Pending |                                 |
| Media retry and expired-lease recovery    | Pending |                                 |
| Document runtime matches pinned lock      | Pending |                                 |
| License document reaches `ready`          | Pending |                                 |
| PDF text and purchaser-only delivery      | Pending |                                 |
| Document retry and expired-lease recovery | Pending |                                 |

## Vercel and browser evidence

| Check                                    | Status  | Safe URL hash / result |
| ---------------------------------------- | ------- | ---------------------- |
| Pinned Vercel CLI                        | Pending |                        |
| Immutable preview ready                  | Pending |                        |
| Deployment identifies final commit       | Pending |                        |
| Free unauthenticated public reachability | Pending |                        |
| Public health check                      | Pending |                        |
| Chromium hosted route                    | Pending |                        |
| Firefox hosted route                     | Pending |                        |
| WebKit hosted route                      | Pending |                        |
| Browser-secret scan                      | Pending |                        |
| Production response boundaries           | Pending |                        |
| Accessibility and viewport checks        | Pending |                        |
| Performance budgets                      | Pending |                        |
| Error-log review                         | Pending |                        |

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

| Item                            | Status  | Safe evidence                          |
| ------------------------------- | ------- | -------------------------------------- |
| Primary task ID                 | Ready   | `019f6291-c1c9-7cf3-9da7-be2a19b7154c` |
| GPT-5.6 Sol/Pro task metadata   | Pending |                                        |
| `/feedback` Session ID          | Pending |                                        |
| Final video timecodes           | Pending |                                        |
| Frame-by-frame privacy review   | Pending |                                        |
| Approved public repository URL  | Pending |                                        |
| Approved hosted URL             | Pending |                                        |
| Approved public video URL       | Pending |                                        |
| Devpost preview review          | Pending |                                        |
| Devpost submission confirmation | Pending |                                        |

## Final result

Status: **Pending**

The hosted judging environment is complete only when every required row above is `Pass` or carries a written, approved, non-capability-reducing disposition. A failure or contradiction reopens the corresponding implementation requirement.
