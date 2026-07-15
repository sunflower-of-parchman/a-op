# Model and agent use record

This document records how Codex, GPT-5.6 Sol, and GPT-5.6 Pro contribute to the OpenAI Build Week project. Keep it current throughout implementation and reconcile it with task metadata before submission.

## Declared implementation record

- Primary implementation task: This Codex task.
- Primary Codex task/thread ID: `019f6291-c1c9-7cf3-9da7-be2a19b7154c`
- Models used: GPT-5.6 Sol and GPT-5.6 Pro.
- Model confirmation: Michael confirmed both models on July 14, 2026.
- Primary-task purpose: Architecture integration, core implementation, milestone decisions, and full verification.
- Supporting-task boundary: Supporting tasks may perform bounded research or isolated investigations. Core integration, milestone decisions, major verification, and the majority of implementation remain in the primary task.
- Final `/feedback` Session ID: Pending completion and confirmation through `/feedback`; do not infer equivalence with the task/thread ID.

## Product runtime boundary

The deployed artist website does not require an OpenAI API key and does not make visitor-facing model calls. GPT-5.6 Sol and GPT-5.6 Pro contribute through Codex while the platform is designed, built, configured, tested, documented, and maintained.

The artist remains the authority for identity, writing, media rights, prices, licensing terms, accounts, costs, and external publication. Codex performs implementation and technical operations within those decisions and stops for explicit approval before consequential external actions.

## Evidence contract

For every major milestone, add an entry containing:

- UTC date and primary or supporting task designation.
- Model shown by the implementation environment or task metadata.
- Human decision or source requirement.
- Material code, migration, test, setup, or documentation contribution.
- Relevant commit identifier after a commit exists.
- Verification command and result.
- Capability row in `docs/submission/capability-evidence.md`.

Do not infer a task's model from writing style or memory. Use environment-provided task metadata where available. If metadata cannot be exported directly, record the visible model designation and state that it was user-confirmed.

## Milestone entries

### Planning baseline — 2026-07-15

- Task: Primary implementation task.
- Models: GPT-5.6 Sol and GPT-5.6 Pro, user-confirmed for the Build Week work. Exact turn-level model attribution remains pending environment metadata.
- Human decisions: Build the complete artist-owned platform; keep the visitor runtime free of required AI calls; make the repository Codex-native; preserve artist control over creative, business, rights, account, and publication decisions.
- Material contribution: Full ExecPlan, planning convention, competition brief, configuration-authority contract, media-processing contract, and evidence contract.
- Commit: `e71e1d9` (`Establish Build Week execution baseline`).
- Verification: Documentation structure and public-release scans only; application implementation has not begun.

## Submission reconciliation

Before submission:

1. Capture the final `/feedback` Session ID from the primary implementation task.
2. Export or record the task's available model and session metadata.
3. Confirm that both GPT-5.6 Sol and GPT-5.6 Pro claims are supported by the task record.
4. Link milestone entries to dated commits and capability evidence.
5. Ensure the README and video accurately describe human decisions, Codex implementation, and the model/runtime boundary.
