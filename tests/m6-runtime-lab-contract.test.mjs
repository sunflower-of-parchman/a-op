import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const route = await readFile(
  new URL("../app/api/runtime-lab/m6/route.ts", import.meta.url),
  "utf8",
);
const verifier = await readFile(
  new URL("../scripts/verify-m6-runtime.mjs", import.meta.url),
  "utf8",
);
const combined = `${route}\n${verifier}`;

test("the Milestone 6 runtime laboratory is explicit, local, and production-off", () => {
  assert.match(route, /resolveSimulationMode\(/);
  assert.match(route, /function requireLab\(\)/);
  assert.match(route, /if \(!runtimeLabEnabled\(\)\) unavailable\(\)/);
  assert.match(route, /requireSameOrigin\(request\)/);
  assert.match(route, /requireExactObject\(value, \["action"\]\)/);
  assert.match(route, /requireExactObject\(value, \["runId"\]\)/);
  assert.match(verifier, /AOP_ENABLE_RUNTIME_LAB = "1"/);
  assert.match(verifier, /"--strictPort"/);
  assert.match(verifier, /startServer\(\{ runtimeLab: false \}\)/);
  assert.match(verifier, /"\/api\/runtime-lab\/m6",\s*404/);
});

test("the laboratory owns only fictional metadata fixtures and exact module state", () => {
  assert.match(route, /m6-customer-\$\{shortId\}@a-op\.invalid/);
  assert.match(route, /Fictional M6 Customer/);
  assert.match(route, /Fictional commerce track/);
  assert.match(route, /Fictional Test subscription/);
  assert.match(
    route,
    /'protected', 'unavailable',[\s\S]*?'unavailable', '\[\]'/,
  );
  assert.match(route, /baselineCounts: await readTableCounts\(\)/);
  assert.match(route, /baselineModules: await readModuleStates\(\)/);
  assert.match(route, /moduleStateRestored: true/);
  assert.doesNotMatch(
    route,
    /R2Bucket|env\.MEDIA|\.put\(|FormData|FileReader/i,
  );
});

test("the verifier sends HMAC-signed checkout and invoice events to the real route", () => {
  assert.match(verifier, /createHmac\("sha256", webhookSecret\)/);
  assert.match(verifier, /`\$\{timestamp\}\.\$\{rawBody\}`/);
  assert.match(verifier, /"\/api\/commerce\/webhooks\/stripe"/);
  assert.match(verifier, /"checkout\.session\.completed"/);
  assert.match(verifier, /"invoice\.paid"/);
  assert.match(verifier, /"awaiting-subscription-invoice"/);
  assert.match(verifier, /"initial-subscription"/);
  assert.match(verifier, /replay\.result\.replayed, true/);
  assert.match(verifier, /STRIPE_LIVE_EVENT_REJECTED/);
  assert.match(verifier, /STRIPE_WEBHOOK_SIGNATURE_INVALID/);
  assert.match(verifier, /assert\.deepEqual\(afterReplay, fulfilled\)/);
  assert.match(
    verifier,
    /assert\.deepEqual\(await readRunState\(run\), beforeLive\)/,
  );
});

test("the HTTP journey proves protected access and visible Test Mode evidence", () => {
  assert.match(verifier, /`\/music\/tracks\/\$\{run\.trackSlug\}`/);
  assert.match(verifier, /"\/commerce"/);
  assert.match(verifier, /"\/account\/orders"/);
  assert.match(verifier, /"\/account\/memberships"/);
  assert.match(verifier, /"\/account\/credits"/);
  assert.match(verifier, /"\/account\/access"/);
  assert.match(verifier, /"\/admin\/commerce"/);
  assert.match(verifier, /"\/admin\/memberships"/);
  assert.match(verifier, /`\/admin\/credits\?customer=/);
  assert.match(verifier, /"Stripe Test Mode"/);
  assert.match(verifier, /"No real payment will be accepted\."/);
  assert.match(verifier, /"Subscription entitlement"/);
});

test("cleanup removes every run row and proves the exact D1 baseline", () => {
  for (const table of [
    "entitlements",
    "credit_reservation_allocations",
    "credit_ledger_entries",
    "credit_reservations",
    "credit_grant_lots",
    "credit_accounts",
    "subscription_events",
    "subscriptions",
    "memberships",
    "fulfillment_events",
    "order_items",
    "orders",
    "audit_events",
    "commerce_events",
    "checkout_sessions",
    "commerce_prices",
    "commerce_products",
    "subscription_plans",
    "membership_plan_revisions",
    "membership_plans",
    "access_plan_items",
    "access_plans",
    "tracks",
    "role_assignments",
    "profiles",
    "users",
    "runtime_proofs",
  ]) {
    assert.match(route, new RegExp(`DELETE FROM ${table}`));
  }
  assert.match(
    route,
    /countsEqual\(restoredCounts, snapshot\.baselineCounts\)/,
  );
  assert.match(
    route,
    /modulesEqual\(\s*restoredModules,\s*snapshot\.baselineModules,?\s*\)/,
  );
  assert.match(route, /retainedVerificationRows !== 0/);
  assert.match(verifier, /retainedVerificationRows: 0/);
  assert.match(verifier, /baselineCountsRestored: true/);
  assert.match(verifier, /moduleStateRestored: true/);
  assert.match(verifier, /r2ObjectsTouched: 0/);
  assert.match(verifier, /mediaRowsCreated: 0/);
  assert.match(verifier, /temporaryFilesCreated: 0/);
});

test("the runtime proof contains no card collection, media creation, temporary files, or external call", () => {
  assert.doesNotMatch(
    combined,
    /cardNumber|card_number|cvc|cvv|expiryMonth|payment_method_data/i,
  );
  assert.doesNotMatch(
    combined,
    /screenshot|imagegen|<img|\.png|\.jpe?g|\.gif|\.webp/i,
  );
  assert.doesNotMatch(
    combined,
    /mkdtemp|writeFile|appendFile|createWriteStream/i,
  );
  assert.doesNotMatch(verifier, /fetch\(\s*["'`]https?:\/\//i);
  assert.doesNotMatch(
    combined,
    /sites-hosting|custom domain|dns|sendmail|slack|social media/i,
  );
});
