# Contributing

Artist-Owned Platform is built for one artist to own and understand their digital home. Contributions should make that ownership more practical while preserving the project's human-approval, privacy, rights, and access boundaries.

## Begin here

1. Read [`AGENTS.md`](AGENTS.md), [`docs/architecture/product-contract.md`](docs/architecture/product-contract.md), and the decision record related to your change.
2. Run `npm ci`, `npm run setup:documents`, and `npm run setup:local`.
3. Reproduce the behavior with the fictional Daymark Assembly data. Do not use private artist media or customer information.
4. Keep the change focused. Add the narrowest useful unit, database, or browser proof.
5. Run the relevant `verify:*` command and `npm run test:docs` before requesting review.

The complete local starting path is in [`SETUP.md`](SETUP.md). The full test inventory is in [`README.md`](README.md#development).

## Product boundaries

- One installation belongs to one artist or artist-led organization.
- The artist remains the authority for identity, rights, prices, licensing terms, accounts, costs, and publication.
- Supabase holds runtime content and access state. Environment variables hold secrets. Stripe supplies verified payment facts. The application owns fulfillment and entitlement decisions.
- Browser redirects never grant paid access. Verified events and replay-safe server operations do.
- Protected media, license documents, learning material, and customer records remain private unless an explicit access decision permits delivery.
- Codex may prepare and verify changes. Consequential external actions require explicit human approval.

## Rights and demonstration data

Use original or explicitly redistribution-approved fixtures. Add every public demonstration asset to [`content/demo/assets.json`](content/demo/assets.json) with its source, paths, license, and private-material state. Never commit credentials, real customer data, private artist media, signed URLs, generated exports, production identifiers, or machine-specific paths.

## Verification

Choose the gate that owns the behavior you changed. `npm run verify:foundation` is the minimum repository check. Module work should also pass its module gate. Changes to setup, authorization, payments, media, exports, recovery, or the judge path require the corresponding end-to-end proof.

The aggregate local gate is:

```text
npm run verify
```

The judge package gate is:

```text
npm run verify:package
```

The supported browser matrix is Chrome/Chromium and Safari/WebKit on macOS and Linux CI. Firefox is outside this project's verification contract.

## Security reports

Do not open a public issue containing an exploitable vulnerability, credential, private URL, customer record, or production identifier. Keep the report private until a project security contact is published. The current review and supported boundaries are documented in [`security_best_practices_report.md`](security_best_practices_report.md).

## License status

The repository is licensed under `AGPL-3.0-or-later`. Publication and judge access remain separate Michael-controlled actions.
