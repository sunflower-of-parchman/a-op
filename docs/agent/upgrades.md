# Upgrade runbook

## Versioned change contract

Dependencies are pinned, database migrations are forward-only, configuration and export schemas are versioned, and workers identify derivative versions. Codex may inspect and implement upgrades locally. Applying a migration or dependency change to a hosted or production environment requires approval after local proof.

For an upgrade:

1. Read the current `package.json`, lockfile, migrations, schema contracts, project state, and provider compatibility requirements.
2. State the reason, versions, affected modules, data migration, expected behavior, and rollback/recovery path.
3. Change the smallest coherent version set and update the lockfile through the package manager.
4. Add a new migration for database changes. Never edit a migration that may already have run.
5. Run formatting, lint, typecheck, focused authority tests, production build, browser journeys, and the aggregate gate.
6. Update runbooks, project-state schema, provenance, capability evidence, and the ExecPlan when behavior changes.
7. Present the verified diff, downtime expectation, backup, and forward-recovery plan before any external apply.

Provider SDK or API upgrades also require test-mode webhook, auth, storage, and signed-URL verification. Recovery normally uses a new forward fix. A deployment rollback may restore application code, but it cannot reverse an already-applied database migration; design migrations to tolerate the previous application during rollout.
