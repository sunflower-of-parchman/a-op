# ADR 006: Codex-guided, deterministic setup

- Status: Accepted
- Date: 2026-07-15

## Decision

Codex conducts the artist interview and proposal reasoning. Versioned scripts validate, preview, apply, and verify state changes. The lifecycle is interview, structured proposal, validated preview and diff, explicit human approval, deterministic application, verification, and project-state update.

## Why

Conversation makes sophisticated setup approachable. Deterministic state changes make it testable, repeatable, reviewable, and recoverable.

## Consequences

Setup proposals contain no secrets and perform no external action. The artist retains authority over identity, rights, prices, accounts, costs, and publication. The installed public site does not require an OpenAI API key.
