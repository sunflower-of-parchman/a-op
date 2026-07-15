# ADR 011: Open-source license

- Status: Accepted
- Date opened: 2026-07-15
- Date decided: 2026-07-15

## Decision

Michael selected the GNU Affero General Public License v3.0 or later (`AGPL-3.0-or-later`) for the repository and its original fictional demonstration assets.

MIT permits broad reuse, including proprietary derivatives. AGPL-3.0 requires operators who modify and provide the software over a network to offer the corresponding source under the same license.

## Rationale

This project is intended as a gift that artists can operate, study, change, and share. The AGPL permits that use while requiring modified network-hosted versions to make their corresponding source available under the same license. That keeps improvements to the transferable artist platform open.

## Consequences

The repository contains GNU's standard AGPL v3 text in `LICENSE`; package metadata uses the SPDX identifier `AGPL-3.0-or-later`; and the original Daymark Assembly demonstration assets use the same repository license. Publication, deployment, provider setup, and competition submission remain separate Michael-controlled actions.
