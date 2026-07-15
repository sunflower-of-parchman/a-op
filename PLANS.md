# Codex Execution Plans

An execution plan, or ExecPlan, is a living design document that a coding agent can follow to deliver a working feature or system. Treat its reader as new to this repository. The reader has only the current working tree and the ExecPlan, so the plan must carry the purpose, architecture, sequence, commands, validation, safety rules, and current state needed to continue.

## Using an ExecPlan

When writing or implementing an ExecPlan, read this entire file and keep the plan synchronized with the repository. Continue through the milestones without waiting for generic permission, while respecting any explicit approval boundary in the plan. Record important decisions, discoveries, partial progress, and verification evidence as they occur. Commit coherent milestones frequently so the repository history shows what was built during OpenAI Build Week.

Every ExecPlan must be self-contained, understandable in plain language, and capable of producing observable behavior. It must explain why the work matters to a user, what files are involved, what commands to run, what success looks like, and how to recover from incomplete or failed operations. Define unfamiliar technical terms when first used.

## Required sections

Every ExecPlan must contain and maintain these sections:

- `Purpose / Big Picture`
- `Progress`
- `Surprises & Discoveries`
- `Decision Log`
- `Outcomes & Retrospective`
- `Context and Orientation`
- `Plan of Work`
- `Concrete Steps`
- `Validation and Acceptance`
- `Idempotence and Recovery`
- `Artifacts and Notes`
- `Interfaces and Dependencies`

The `Progress` section is the only section that should primarily use checkboxes. Give completed entries a UTC timestamp. Split partially completed work into explicit completed and remaining parts. At every stopping point, update the section so another agent can resume without conversation history.

Use the `Surprises & Discoveries` section for unexpected behavior, constraints, bugs, performance findings, and other evidence that changes implementation. Use the `Decision Log` for product and engineering choices, including their rationale and date. Update `Outcomes & Retrospective` after each major milestone and at completion.

## Writing requirements

Begin with the user-visible outcome. Milestones should tell a readable story: what capability is added, where it is implemented, how to exercise it, and what observation proves it works. Name repository files with repository-relative paths. Include exact commands and their working directory. When output matters, provide a short expected transcript.

Plans must resolve implementation ambiguity whenever the available evidence supports a decision. If a decision genuinely requires Michael's judgment, describe the decision point, explain why it matters, and sequence independent work so progress can continue safely.

Avoid relying on external documentation for essential knowledge. Links may supplement a plan, but the plan itself must explain the required behavior. Prefer additive changes that keep the project runnable. Any database migration, payment flow, deployment, or destructive operation must include a safe retry or recovery path.

## Validation requirements

Validation is part of implementation. Each milestone must be independently verifiable through automated tests and a human-observable behavior. Include focused unit or integration tests, browser journeys for user-facing behavior, accessibility checks for key pages, and production-build validation where relevant.

External services must have local or test-mode validation. Never use live payment credentials, publish a deployment, buy a domain, create paid resources, change DNS, expose a repository, or submit competition materials without Michael's explicit approval for that specific action.

## ExecPlan skeleton

    # <Short, action-oriented description>

    This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

    This plan must be maintained in accordance with `PLANS.md` at the repository root.

    ## Purpose / Big Picture

    Describe what a user can do after implementation and how to see it working.

    ## Progress

    - [x] (YYYY-MM-DD HH:MMZ) Example completed step.
    - [ ] Example remaining step.

    ## Surprises & Discoveries

    - Observation: ...
      Evidence: ...

    ## Decision Log

    - Decision: ...
      Rationale: ...
      Date/Author: ...

    ## Outcomes & Retrospective

    Summarize completed outcomes, gaps, and lessons.

    ## Context and Orientation

    Explain the current repository, architecture, terms, and relevant files.

    ## Plan of Work

    Describe the milestone sequence in prose, including paths and observable results.

    ## Concrete Steps

    Give exact commands, working directories, and expected output.

    ## Validation and Acceptance

    State behavioral acceptance criteria and the tests that prove them.

    ## Idempotence and Recovery

    Explain safe repetition, retries, rollback, and cleanup.

    ## Artifacts and Notes

    Preserve concise evidence and important implementation notes.

    ## Interfaces and Dependencies

    Define the required services, modules, data contracts, and stable interfaces.

When an ExecPlan changes, add a short revision note at its end explaining what changed and why. The plan should always remain sufficient for a stateless agent or human contributor to continue the work.
