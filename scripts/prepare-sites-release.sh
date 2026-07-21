#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_root"

source_sha="$(git rev-parse HEAD)"

node scripts/verify-sites-deployment-contract.mjs --expected-sha "$source_sha"
npm ci
node scripts/verify-sites-deployment-contract.mjs --expected-sha "$source_sha"
npm run build
node scripts/verify-sites-deployment-contract.mjs --artifact --expected-sha "$source_sha"
node scripts/verify-runtime-artifact.mjs

printf '%s\n' "Sites release candidate prepared from $source_sha."
printf '%s\n' "Use the installed Sites hosting package helper on this unchanged checkout."
