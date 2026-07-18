# Codex Execution Plans

An execution plan, or ExecPlan, is a living design document that a coding agent can follow to deliver a working feature or system. Treat its reader as new to this repository. The reader has the current working tree and the ExecPlan, so the plan carries the purpose, architecture, sequence, commands, validation, safety rules, and current state needed to continue.

## Using an ExecPlan

Read this entire file before writing or implementing an ExecPlan. Keep the active plan synchronized with the repository and continue through functional milestones while respecting its explicit approval boundaries.

Working product behavior leads the plan. Each milestone should create a capability a person can use, integrate it with the existing application, and prove the result through the smallest useful automated checks and a human-observable journey. Documentation records the decisions and operating knowledge needed to keep that behavior healthy.

Commit coherent functional milestones when Michael asks to save the work. Keep the application runnable at each integration point.

Every ExecPlan must be self-contained, understandable in plain language, and capable of producing observable behavior. It explains why the work matters to a user, which files are involved, which commands to run, what success looks like, and how to recover from incomplete operations. Define unfamiliar technical terms when first used.

## Required sections

Every ExecPlan contains and maintains these sections:

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

The `Progress` section is the primary checkbox section. Give completed entries a UTC timestamp. Split partially completed work into explicit completed and remaining parts. At each stopping point, update the section so another agent can resume from the repository alone.

Use `Surprises & Discoveries` for behavior, constraints, bugs, performance findings, and new facts that change implementation. Use `Decision Log` for product and engineering choices with their rationale and date. Update `Outcomes & Retrospective` after each major milestone and at completion.

## Writing requirements

Begin with the user-visible outcome. Milestones tell a readable story: which capability appears, where it is implemented, how to exercise it, and what observation proves it works.

Name repository files with repository-relative paths. Include exact commands and their working directory. When output matters, provide a short expected transcript.

Resolve implementation ambiguity when current product decisions and official documentation support a clear answer. When Michael's authority is required, state the decision point, explain why it matters, and sequence independent functional work so progress continues safely.

Carry essential behavior and architecture in the plan itself. Official links and skills supplement the plan and govern time-sensitive platform details.

Prefer implementation steps that keep the integrated product runnable. Database migrations, access-state changes, hosted operations, and destructive local operations include a safe retry and recovery path.

## Validation requirements

Validation serves working behavior.

Each milestone includes:

- A production build or the narrowest equivalent compilation check.
- Focused unit or integration checks for the product contract changed.
- A browser journey for user-facing behavior.
- A direct human-observable result.

Authorization, entitlements, protected media, migrations, and recovery receive strong automated coverage because failures can affect rights, privacy, or durable data.

External integrations use local fixtures or deterministic simulation first. Public deployment, DNS, repository visibility, email delivery, and public uploads require Michael's action-specific approval.

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

    Summarize completed outcomes, remaining work, and lessons.

    ## Context and Orientation

    Explain the current repository, architecture, terms, and relevant files.

    ## Plan of Work

    Describe the milestone sequence in prose, including paths and observable results.

    ## Concrete Steps

    Give exact commands, working directories, and expected output.

    ## Validation and Acceptance

    State behavioral acceptance criteria and the focused checks that prove them.

    ## Idempotence and Recovery

    Explain safe repetition, retries, rollback, and cleanup.

    ## Artifacts and Notes

    Preserve concise implementation facts and operating notes.

    ## Interfaces and Dependencies

    Define the required services, modules, data contracts, and stable interfaces.

When an ExecPlan changes, add a short revision note at its end explaining what changed and why. The plan remains sufficient for a stateless agent or human contributor to continue the work.
