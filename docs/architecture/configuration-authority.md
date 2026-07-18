# Configuration authority

This contract gives each kind of configuration one durable home.

## Repository contracts and starting defaults

Shared TypeScript schemas define the validated contracts for artist settings, modules, navigation, catalog data, memberships, subscriptions, licensing, Courses, video, contact, telemetry, legal documents, setup proposals, and exports.

Repository defaults supply:

- the complete Sound for Movement-derived visual foundation in both dark and light themes;
- neutral `a-op` content and standard product names;
- every supported module definition and its dependencies;
- bootstrap navigation and administration structure; and
- local fictional records used for safe development journeys.

These defaults make a fresh installation visually complete and operationally understandable before the artist adds their material.

## Runtime artist state

D1 owns artist-editable runtime state: identity, published pages, navigation, enabled modules, catalog, access grants, memberships, subscriptions, licensing options, Courses, video, contact settings, telemetry preferences, legal-document versions, and operational status.

Draft and published states are explicit. Preview reads a selected draft. Public routes read published state. Administration writes validated changes through server actions and records revisions and audit events.

## Capability activation

Every installation contains the complete supported codebase. A module registry records whether each capability is active and which shared contracts it requires.

Music publishing, catalog, streaming, identity, access, and administration form the core. An artist can begin with streaming alone. They can activate direct downloads, customer libraries, licensing, memberships, subscriptions, Courses, video, What's New, contact, telemetry, and other modules as their work grows.

Public navigation, routes, administration navigation, setup questions, background jobs, and telemetry follow the active module registry. Deactivation preserves durable records and access history. Reactivation restores the existing configuration after validation.

## Artist-specific code and visual changes

Git owns changes to the artist's fork: visual rules, layout, component composition, page structure, nomenclature, module code, and new capabilities. ChatGPT Work and Codex translate the artist's natural-language direction into reviewed source changes and verify the result in both themes and responsive layouts.

The D1 configuration remains compatible with repository schemas. A source change that alters a schema includes a forward migration and updates setup, export, and recovery behavior.

## Secrets and private runtime configuration

Server-managed runtime values own private delivery credentials, external worker credentials, and other deployment secrets. `.env.example` documents names and non-secret formats. Runtime validation reports presence and safe shape through redacted output.

## Installation state

`setup/project-state.json` records non-secret setup facts: schema version, enabled modules, completed checks, Sites binding names, and remaining approval-gated actions. D1 remains authoritative for product state. Git remains authoritative for source. The project-state file remains a resumable status ledger.

## Setup lifecycle

The ChatGPT Work setup lifecycle is:

    preflight
    -> module and catalog conversation
    -> structured proposal
    -> validated preview
    -> explicit artist approval
    -> deterministic application
    -> public and administrative verification
    -> project-state update

Installation begins from the complete visual foundation. The setup conversation focuses on the artist's material, active capabilities, rights, access, memberships, subscriptions, licensing, and publication. Later natural-language work can reshape the visual system and structure as deeply as the artist chooses.

Applying the same approved proposal is idempotent. It updates intended records, reuses approved media objects and jobs, and preserves audit history.
