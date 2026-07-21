# Sites release contract

## Purpose

One private Sites release carries one exact `a-op` source commit, its generated Worker artifact, the repository hosting configuration, and the complete checked-in D1 migration chain. Deployment stops on any mismatch. A deployment agent never replaces repository routes, components, copy, repositories, or database access with a substitute Site.

## Hosting capability preflight

Before cloning, installing, building, or opening localhost for a repository-link request, inspect the active task's callable tools. Continue only when the task can create a Site, obtain source-write credentials, save a Site version, deploy it privately, and check deployment status. A Sites skill plus the design picker is an incomplete hosting surface.

If any hosting action is absent, stop with `The full Sites hosting connector is unavailable. No Site has been created.` A local preview is not a fallback deployment and must never be reported as the new website. Repository code cannot add a connector that the task was not provisioned to use.

## Initial Site linkage

For a new installation, run one ordinary neutral production build first:

    npm run build

After that build succeeds and Michael approves creation of the private Site, create it once with the installed Sites hosting helper. Record the assigned non-empty `project_id` in `.openai/hosting.json`, commit and push that single linkage with the validated source, and then run the final preparation below. This avoids preparing and discarding an unlinked release artifact.

## Required final preparation

Run from a clean clone of `sunflower-of-parchman/a-op` on `main`:

    npm run prepare:sites-release

The command fails unless `HEAD` equals `origin/main` and `.openai/hosting.json` contains the assigned `project_id`. It records the full source SHA, installs the lockfile exactly, confirms that installation did not change source, builds once, confirms that the build did not change source, and verifies:

- `dist/server/index.js`;
- `dist/.openai/hosting.json` with logical `DB` and `MEDIA` bindings;
- one non-empty sequential migration chain and the matching Drizzle journal;
- byte-for-byte source and packaged migration parity;
- the dedicated database-backed `/membership` route and its neutral empty state;
- the repository-backed Music and Licensing reads;
- the packaged security and client-boundary contracts; and
- the final Worker SHA-256 digest.

The release build is always the neutral installation. The preparation command removes `STRIPE_PUBLISHABLE_KEY`, `STRIPE_SECRET_KEY`, and `STRIPE_WEBHOOK_SECRET` from its child build environment so an unrelated caller value cannot activate or block commerce. Stripe Test values remain absent until an artist deliberately activates simulated commerce after hosted neutral verification, stores the complete values in Sites settings, and redeploys the approved version.

Any failure is terminal for that release attempt. Report the failing command and output. Do not edit application source, create `app/site.tsx`, add route shims, write replacement prose, create alternate components, or deploy a partial artifact.

## Official packaging and versioning

After preparation succeeds, use the currently installed `sites:sites-hosting` package helper on the same unchanged checkout. The helper stages `dist/`, the current linked `.openai/hosting.json`, and `drizzle/` into the official archive.

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
