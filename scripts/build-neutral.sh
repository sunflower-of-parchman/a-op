#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_root"

unset STRIPE_PUBLISHABLE_KEY
unset STRIPE_SECRET_KEY
unset STRIPE_WEBHOOK_SECRET

node scripts/verify-commerce-boundary.mjs --allow-missing
WRANGLER_LOG_PATH=.wrangler/wrangler.log vinext build
