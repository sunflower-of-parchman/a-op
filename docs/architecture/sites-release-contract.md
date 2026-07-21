# Sites release contract

## Purpose

One private Sites release carries one exact `a-op` source commit, its generated Worker artifact, the repository hosting configuration, and the complete checked-in D1 migration chain. Deployment stops on any mismatch. A deployment agent never replaces repository routes, components, copy, repositories, or database access with a substitute Site.

## Required preparation

Run from a clean clone of `sunflower-of-parchman/a-op` on `main`:

    npm run prepare:sites-release

The command fails unless `HEAD` equals `origin/main`. It records the full source SHA, installs the lockfile exactly, confirms that installation did not change source, builds once, confirms that the build did not change source, and verifies:

- `dist/server/index.js`;
- `dist/.openai/hosting.json` with logical `DB` and `MEDIA` bindings;
- migrations `0000` through `0035` and the matching Drizzle journal;
- byte-for-byte source and packaged migration parity;
- the dedicated database-backed `/membership` route and its neutral empty state;
- the repository-backed Music and Licensing reads;
- the packaged security and client-boundary contracts; and
- the final Worker SHA-256 digest.

Any failure is terminal for that release attempt. Report the failing command and output. Do not edit application source, create `app/site.tsx`, add route shims, write replacement prose, create alternate components, or deploy a partial artifact.

## Official packaging and versioning

After preparation succeeds, use the currently installed `sites:sites-hosting` package helper on the same unchanged checkout. The helper stages `dist/`, the current `.openai/hosting.json`, and `drizzle/` into the official archive. If Sites provisioning adds `project_id`, commit that single hosting-linkage change through the official Sites source flow, rebuild and rerun the release command from that clean commit, then package it.

Save one Sites version with the exact source commit and archive. Prefer private deployment. Stop on quota, permission, access, packaging, version-save, migration, or deployment failure.

## Hosted acceptance

The deployed version must be the saved version created from the verified archive. Verify the following against the same deployed URL and inspect Worker logs:

- `/` renders the neutral repository home;
- `/music` returns `200` and its repository-owned empty state when no music is published;
- `/membership` returns `200` and `No membership is published.` for an unconfigured neutral installation;
- `/licensing` returns `200` and `No license options are published.` when no offers are published;
- `/api/health` returns `200`, while remaining supporting evidence rather than proof of route, migration, or artifact identity; and
- no unexpected `404`, `5xx`, binding error, migration error, or Worker exception appears.

A response that cannot identify the saved version, source SHA, Worker digest, tested URL, and hosted result has not established a successful one-shot deployment.

Complete these hosted checks before asking the artist about capabilities, content, assets, design, or setup. After they pass, tell the artist that their new artist-owned website is ready and that it is time to personalize it. Ask them to attach a context document or approved assets, share a Google Drive folder containing material they want to use, approve a local asset folder, or begin with the blank Site. Personalization follows `SETUP.md` and begins from the working neutral deployment.
