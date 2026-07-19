import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const createRoute = new URL(
  "../app/api/admin/commerce/products/route.ts",
  import.meta.url,
);
const activateRoute = new URL(
  "../app/api/admin/commerce/products/[commerceProductId]/activate/route.ts",
  import.meta.url,
);
const archiveRoute = new URL(
  "../app/api/admin/commerce/products/[commerceProductId]/archive/route.ts",
  import.meta.url,
);
const repositoryFile = new URL(
  "../db/commerce-admin-write.ts",
  import.meta.url,
);

test("commerce product mutation APIs are owner-only exact JSON operations", async () => {
  const [create, activate, archive] = await Promise.all([
    readFile(createRoute, "utf8"),
    readFile(activateRoute, "utf8"),
    readFile(archiveRoute, "utf8"),
  ]);
  for (const source of [create, activate, archive]) {
    assert.match(source, /export const dynamic = "force-dynamic"/);
    assert.match(source, /export async function POST\(/);
    assert.match(source, /await readJsonMutation\(request\)/);
    assert.match(source, /requireIdempotencyKey\(request\)/);
    assert.match(source, /requireApplicationAuthority\(env\.DB, \["owner"\]\)/);
    assert.doesNotMatch(source, /"editor"|commerce\.write/);
    assert.match(source, /return runApiRoute\(/);
    assert.match(source, /return apiJson\(/);
  }

  assert.match(
    create,
    /requireMutationObject\([\s\S]*?\["product"\][\s\S]*?\)/,
  );
  assert.match(create, /createCommerceProduct\(env\.DB, input\.product/);
  assert.match(create, /result\.replayed \? 200 : 201/);
  assert.match(
    activate,
    /requireMutationObject\([\s\S]*?\["expectedRevision", "licenseOffer"\][\s\S]*?\)/,
  );
  assert.match(
    activate,
    /requireExpectedVersion\(input\.expectedRevision, \{\s*allowZero: false,\s*\}\)/,
  );
  assert.match(
    activate,
    /activateCommerceProduct\([\s\S]*?env\.DB[\s\S]*?commerceProductId[\s\S]*?expectedRevision[\s\S]*?input\.licenseOffer/,
  );
  assert.match(
    archive,
    /requireMutationObject\([\s\S]*?\["expectedRevision"\][\s\S]*?\)/,
  );
  assert.match(
    archive,
    /archiveCommerceProduct\([\s\S]*?env\.DB[\s\S]*?commerceProductId[\s\S]*?expectedRevision/,
  );
});

test("commerce product administration has no payment, customer, grant, or entitlement authority", async () => {
  const combined = (
    await Promise.all([
      readFile(createRoute, "utf8"),
      readFile(activateRoute, "utf8"),
      readFile(archiveRoute, "utf8"),
      readFile(repositoryFile, "utf8"),
    ])
  ).join("\n");

  assert.doesNotMatch(
    combined,
    /fetch\(|checkout\.stripe\.com|Authorization:\s*Bearer|sk_(?:test|live)_|pk_(?:test|live)_/,
  );
  assert.doesNotMatch(
    combined,
    /card(?:Number|Cvc|Expiry)|payment_method_data|createCheckoutSession|stripe-checkout/i,
  );
  assert.doesNotMatch(
    combined,
    /INSERT INTO (?:orders|order_items|entitlements|access_grants|access_grant_sets|checkout_sessions)/i,
  );
  assert.doesNotMatch(combined, /customerUserId|granteeUserId/);
});

test("product definitions and test price rows are create-once", async () => {
  const source = await readFile(repositoryFile, "utf8");
  assert.equal(
    (source.match(/INSERT INTO commerce_products/g) ?? []).length,
    1,
  );
  assert.equal((source.match(/INSERT INTO commerce_prices/g) ?? []).length, 1);
  assert.doesNotMatch(
    source,
    /UPDATE commerce_prices|DELETE FROM commerce_prices/,
  );
  assert.doesNotMatch(
    source,
    /SET\s+(?:name|description|product_type|resource_type|resource_id|access_plan_id|membership_plan_id|subscription_plan_id|credit_kind|credit_quantity)\s*=/,
  );
  assert.match(
    source,
    /UPDATE commerce_products[\s\S]*?SET state = 'active', revision = revision \+ 1/,
  );
  assert.match(
    source,
    /UPDATE commerce_products[\s\S]*?SET state = 'archived', revision = revision \+ 1/,
  );
  assert.match(source, /stripe_environment, livemode, revision/);
  assert.match(source, /'test', 0, 1/);
  assert.match(source, /orderCount/);
});
