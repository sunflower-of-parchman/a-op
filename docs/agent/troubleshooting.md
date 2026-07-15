# Troubleshooting runbook

## Safe first response

Run `npm run diagnose` and `npm run setup:check`. These commands report aggregate, redacted state. Then inspect the smallest relevant local log or owner operations surface. Do not paste `.env`, provider payloads, database connection strings, personal messages, account emails, or signed URLs into a task.

| Symptom                        | Check                                            | Supported recovery                                                                    |
| ------------------------------ | ------------------------------------------------ | ------------------------------------------------------------------------------------- |
| Local setup will not start     | Docker status, `npm run setup:preflight`         | Start Docker, rerun the idempotent local setup                                        |
| Setup proposal is stale        | `npm run setup:preview -- <proposal>`            | Regenerate from the current published configuration and ask for approval again        |
| Setup apply refuses            | Approval block, local URL, existing config draft | Complete the human review; resolve the separate draft; never bypass the guard         |
| Sign-in works but access fails | Role, entitlement, RLS, central access decision  | Correct the supported authority source and rerun policy tests                         |
| Payment remains pending        | Verified webhook and redacted failure record     | Retrieve/replay the provider event through `/admin/commerce` in approved test mode    |
| Media remains processing       | Owner media queue, worker lease/error            | Run `npm run media:work`; retry the durable job without replacing the original        |
| License PDF is unavailable     | Document job and Python dependency               | Install the pinned renderer, run `npm run documents:work`, retry from owner licensing |
| Optional analytics absent      | Consent, global setting, GPC/DNT                 | Explain the configured privacy result; do not bypass the visitor signal               |
| Deployment or domain missing   | `setup/project-state.json` remaining steps       | Follow `vercel-domain.md` and stop at its approval checkpoint                         |

If an error repeats, preserve the exact redacted command, exit status, affected safe identifier, migration/app version, and whether local or external state changed. Prefer a reproducible local test and a forward fix. Any hosted mutation, destructive reset, provider replay, secret rotation, DNS change, deployment, or message send needs the approval described in its runbook.
