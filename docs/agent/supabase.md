# Supabase runbook

## Authority and current support

Supabase owns runtime artist data, authentication, authorization, and storage. The repository supports a complete local stack. A hosted project is an approval-gated connection because creating or linking it changes an external account and may create cost.

| Work                                                                                      | Codex may do locally | Connected tool or CLI              | Human approval                                |
| ----------------------------------------------------------------------------------------- | -------------------- | ---------------------------------- | --------------------------------------------- |
| Preflight, start, migrate, seed, type generation, checks                                  | Yes                  | Docker and the pinned Supabase CLI | Not required                                  |
| Inspect a proposed hosted migration or project settings                                   | Yes, read-only       | Supabase plugin, dashboard, or CLI | Not required when read-only                   |
| Create/link a hosted project, push a migration, upload data, change auth/storage settings | Prepare only         | Supabase plugin, dashboard, or CLI | Required before the external change           |
| Delete, reset, pause, or restore a hosted project                                         | Never infer          | Provider controls                  | Explicit destructive-action approval required |

## Local path

Run `npm ci`, `npm run setup:preflight`, `npm run setup:local`, and `npm run setup:check`. `setup:local` refuses to replace a non-local Supabase environment. `npm run seed:reset` and integration tests also refuse a non-local target.

The local stack applies tracked migrations, seeds the fictional authority fixtures, generates `shared/types/database.ts`, and writes ignored `.env` values without printing them. Verify schema authority with `npm run test:db`, `npm run test:policies`, and the relevant milestone gate.

## Hosted checkpoint

Before any link or push, show the artist:

1. The selected project and region, expected plan or cost, and whether it is new or existing.
2. The migration list and a dry-run or SQL review.
3. The secrets that must be placed in the hosted service and Vercel without displaying their values.
4. The backup and recovery plan in `backup-restore.md`.

After approval, a connected tool may link the repository and apply only reviewed forward migrations. Never run the local demonstration reset against a hosted project. Verify migrations, forced RLS, explicit grants, public reads, owner/editor/customer isolation, storage policies, and generated types. Record only the safe result in `setup/project-state.json`; leave credentials in provider secret stores.

Recovery: stop after any partial failure, preserve the provider error with secrets redacted, inspect migration history, and use a new forward migration. Do not edit an already-applied migration or silently retry a destructive operation.
