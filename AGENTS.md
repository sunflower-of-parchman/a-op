# Repository instructions

This repository builds the complete Artist-Owned Platform described in `plans/artistOwnedPlatform.md`. Read `PLANS.md`, the complete ExecPlan, `BUILD_WEEK.md`, and the relevant architecture contracts before changing code.

## Product outcome

Deliver the complete open-source, web-only, single-artist platform. One deployment represents one artist or artist-led organization with owner and editor accounts plus customer accounts. The public visitor experience does not require AI. Codex is the artist's setup, implementation, maintenance, and verification partner.

Do not reduce the product to a catalog demonstration or substitute decorative controls for working behavior. Every completed capability must be integrated, tested, demonstrated, documented, and recorded in `docs/submission/capability-evidence.md`.

## Primary task and evidence

This repository's primary implementation task is recorded in `BUILD_WEEK.md`. Keep core architecture, implementation, integration, milestone decisions, and full verification in that task. Supporting tasks may perform bounded research or isolated investigation; integrate their results in the primary task.

At every stopping point:

1. Update `plans/artistOwnedPlatform.md` Progress, Surprises & Discoveries, Decision Log, and Outcomes & Retrospective.
2. Update `docs/submission/capability-evidence.md` with real files, commits, tests, manual proof, judge actions, and status.
3. Update `docs/submission/model-and-agent-use.md` using available task metadata; never infer model use.
4. Keep the application runnable and commit one coherent milestone at a time.

## Private reference boundary

Sound for Movement is a private, user-owned, read-only architectural reference. Its optional local path belongs only in ignored `setup/local-paths.json`. Never modify the reference repository. Never copy its secrets, customer data, private media, production endpoints, branding, or machine paths. Record each generalized concept and its new implementation in `docs/provenance.md`.

## Architecture invariants

- Follow `docs/architecture/configuration-authority.md`. Shared schemas define contracts, repository configuration supplies bootstrap defaults, Supabase owns artist-editable runtime state, environment variables own secrets, and project state records only non-secret setup progress.
- Follow `docs/architecture/media-processing-contract.md`. Upload source audio directly to private storage, create durable jobs, and process through the shared local and deployed worker. Original media is immutable.
- Authentication identifies the user. RLS and explicit database grants authorize data access. A browser redirect never proves payment or grants access.
- Verified server-side payment events create orders and entitlements atomically. All protected delivery uses the central `decideAccess` contract.
- Enable RLS on every exposed table. Use explicit `TO` roles, ownership predicates, and both `USING` and `WITH CHECK` for updates. Never authorize with user-editable metadata.
- Keep service-role and secret credentials server-only. Diagnostics, logs, setup proposals, exports, Git, screenshots, and browser bundles must redact them.
- Treat the Supabase `storage` schema as read-only except for supported policies and indexes. Use the Storage API for file operations.

## Human authority and external actions

Michael remains the authority for identity, writing, music and media rights, prices, licensing terms, accounts, costs, open-source license, and publication.

Do not publish or expose the repository, deploy or promote publicly, create paid resources, change DNS, enable live Stripe, send email, upload a public video, share judging access, or submit to Devpost without Michael's explicit approval for that specific action. Local development, deterministic simulations, and test-mode preparation may proceed.

## Codex-guided setup

When the artist asks to set up or personalize the platform:

1. Read `SETUP.md`, `docs/architecture/configuration-authority.md`, `docs/architecture/media-processing-contract.md`, and `setup/project-state.json`.
2. Run `npm run setup:preflight`, bring up the local demonstration with `npm run setup:local` when needed, and run `npm run setup:check`. Explain any missing external service as a checkpoint, not as a reason to weaken local verification.
3. Run `npm run setup:interview -- --json` and discuss all 14 topics conversationally. Preserve the artist's wording. The artist remains the authority for identity, rights, pricing, accounts, costs, and publication.
4. Write the complete validated proposal only under ignored `setup/proposals/`. Never put a secret, customer record, private task detail, or unapproved personal data in it. Inspect media only at a path the artist identifies; never infer rights or approval.
5. Run `npm run setup:preview -- <proposal>`. Present the stale-state result, configuration diff, media approvals, and every external action. Preview must remain non-mutating.
6. Apply only after the human explicitly approves the displayed proposal and the approval record is complete. Use `npm run setup:apply -- <proposal> --confirm-approved-proposal`. This command supports local Supabase only.
7. Run `npm run setup:check`, inspect the personalized public result, and retain the non-secret `setup/project-state.json` update. Reapply is supported and must not duplicate configuration, media, or jobs.
8. Use the runbook named by each `remainingExternalSteps` entry. Connected plugins and CLIs accelerate the documented contract; they do not grant authority. Stop before any external mutation or cost until the artist approves that exact action.

For ongoing maintenance, begin with `npm run diagnose`, use the smallest relevant runbook in `docs/agent/`, keep migrations forward-only, and leave completed setup history and recovery instructions available to the next Codex task.

## Interface direction

Public artist sites must feel composed rather than templated. Start with the artist identity, a dominant visual or release, rigorous typography, generous open space, and one clear action. Default to cardless layouts. Use cards only for meaningful selectable items or functional boundaries. Keep to two typefaces and one accent color unless the artist explicitly chooses otherwise.

Administration is a calm working surface with clear navigation, status, and action. Use utility language. Avoid marketing heroes, dashboard card mosaics, ornamental gradients, and decorative UI that does not help the artist operate the system.

Before building a new public surface, record its visual thesis, content plan, and interaction thesis. Test keyboard behavior, reduced motion, mobile layouts, and contrast as part of implementation.

## Working practices

- Read relevant files before editing.
- Use `rg` for repository searches.
- Use `apply_patch` for file edits.
- Preserve unrelated changes in a dirty worktree.
- Pin dependencies and commit the lockfile.
- Discover Supabase CLI commands through `npx supabase --help`; do not guess current syntax.
- Create migration files through the Supabase CLI once it is installed.
- Run focused tests after each change and the complete verification suite at milestone gates.
- Keep local resets local-only and make them refuse a hosted database target.
- Never place real prices or legal terms into demonstration data unless Michael has approved them for this project.
