# Provenance

This repository is a new OpenAI Build Week implementation informed by Michael Wall's privately owned Sound for Movement web platform and years of operating an independent music company.

## Boundary

The private Sound for Movement repository is a read-only architectural reference. It remains separate from this repository. Its machine-specific path belongs only in ignored `setup/local-paths.json`.

Do not bring these materials into the open-source project:

- Sound for Movement branding, logos, public copy, private documents, or production URLs.
- Michael's music, artwork, photographs, video, customer records, analytics, or business secrets.
- Environment variables, tokens, keys, webhook secrets, connection strings, or local filesystem paths.
- Historical migrations or business-specific rules that do not express the reusable platform contract.

## What may inform the new work

Reusable concepts may be studied and implemented independently: Nuxt application structure, music catalog relationships, audio playback behavior, Supabase authorization patterns, Stripe fulfillment, entitlements, licensing workflow, learning content, video, administration, telemetry, testing, and operational recovery.

Each implementation entry below must name the concept, private reference area when safe, new Build Week files, the reason for generalization, the relevant commit, and verification. Do not copy private content to make the entry easier.

## Implementation ledger

| Capability             | Private reference concept                                                                                      | New Build Week implementation                                                                                            | Generalization                                                                                                                                                                                                                                                                                    | Commit                          | Verification                                                                                                                                                                                                                   |
| ---------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Platform planning      | Production-proven web, music, licensing, membership, education, and operations architecture                    | `plans/artistOwnedPlatform.md`; `README.md`; `AGENTS.md`; `SETUP.md`; `docs/architecture/`                               | Defined a reusable single-artist product, authority model, Codex setup contract, design direction, and evidence requirements without private code or data                                                                                                                                         | `e71e1d9`; `8c8a95d`; `ebdc320` | Required ExecPlan sections, product contracts, JSON, public-path, secret-pattern, and documentation checks passed                                                                                                              |
| Application foundation | Nuxt application organization, local Supabase operation, typed configuration, and automated browser safety net | `package.json`; `artist.config.ts`; `app/`; `shared/`; `scripts/`; `supabase/`; `tests/`; `.github/workflows/verify.yml` | Reimplemented an independent Node 24 and Nuxt 4 foundation around a fictional artist, semantic tokens, a single published configuration record, explicit Data API grants and RLS, redacted local setup, and portable verification with no private code, content, paths, endpoints, or credentials | `83c3b4f`                       | Clean `npm ci`; local migration, seed, anonymous policy read, and generated types; formatting, lint, type checking, seven unit/integration tests, production build, and four desktop/mobile Playwright and axe journeys passed |

A capability is not considered Build Week work until the new files, dated commit, and verification exist in this repository.
