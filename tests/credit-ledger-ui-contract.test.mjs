import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const files = {
  accountPage: "../app/account/credits/page.tsx",
  adminPage: "../app/admin/credits/page.tsx",
  accountLayout: "../app/account/layout.tsx",
  adminLayout: "../app/admin/layout.tsx",
  navigation: "../lib/modules/navigation.ts",
  customer: "../components/credits/CustomerCredits.tsx",
  admin: "../components/credits/AdminCredits.tsx",
  grant: "../components/credits/CreditGrantForm.tsx",
  controls: "../components/credits/CreditMutationControls.tsx",
  styles: "../components/credits/Credits.module.css",
  surfaceRead: "../db/credit-surface-read.ts",
  creditRead: "../db/credit-ledger-read.ts",
};

async function source(path) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("customer credit page reads both same-customer reconciled account histories", async () => {
  const [page, customer, read] = await Promise.all([
    source(files.accountPage),
    source(files.customer),
    source(files.creditRead),
  ]);

  assert.match(page, /requireChatGPTUser\("\/account\/credits"\)/);
  assert.match(page, /identity\?\.roles\.includes\("customer"\)/);
  assert.match(
    page,
    /readCustomerCreditAccountDetail\(env\.DB, "download", identity\.userId\)/,
  );
  assert.match(
    page,
    /readCustomerCreditAccountDetail\(env\.DB, "license", identity\.userId\)/,
  );
  assert.match(read, /activeCustomerCondition\(actor\)/);
  assert.match(read, /balancesReconciled:/);
  assert.match(customer, /<CommerceTestModeNotice/);
  assert.match(customer, /Stripe Test Mode/);
  assert.match(customer, /Balances reconciled/);
  assert.match(customer, /Active lots/);
  assert.match(customer, /Reservations/);
  assert.match(customer, /Ledger history/);
  assert.match(customer, /No credit activity recorded/);
});

test("owner workspace remains customer-scoped and exposes only exact current operations", async () => {
  const [page, admin, grant, controls, surfaceRead] = await Promise.all([
    source(files.adminPage),
    source(files.admin),
    source(files.grant),
    source(files.controls),
    source(files.surfaceRead),
  ]);

  assert.match(page, /hasApplicationRole\(identity, "owner"\)/);
  assert.match(page, /readCreditCustomers\(env\.DB, identity\.userId\)/);
  assert.match(page, /requestedCustomerId/);
  assert.match(page, /readOwnerCreditAccounts\([\s\S]*?selectedCustomerId/);
  assert.match(page, /readOwnerCreditAccountDetail\(/);
  assert.match(surfaceRead, /activeOwnerCondition\(actorUserId\)/);
  assert.match(surfaceRead, /customer_role\.role_key = 'customer'/);
  assert.match(admin, /<CommerceTestModeNotice/);
  assert.match(admin, /no live payment or live credential control/i);
  assert.match(grant, /Manual owner grant/);
  assert.match(admin, /Expire reservation/);
  assert.match(admin, /Reverse consumption/);
  assert.match(admin, /Expire available lot/);
  assert.match(admin, /Reverse unused lot/);
  assert.match(admin, /Release remains a customer-authorized operation/);
  assert.doesNotMatch(
    admin,
    /releaseCreditReservation|Reserve credits|Consume credits/,
  );
  assert.match(grant, /fetch\("\/api\/admin\/credits\/grants"/);
  assert.match(grant, /expectedAccountRevision:/);
  assert.doesNotMatch(grant, /originType|originId|fulfillmentEventId/);
  assert.match(controls, /crypto\.randomUUID\(\)/);
  assert.match(controls, /"idempotency-key": operation\.idempotencyKey/);
  assert.match(controls, /router\.refresh\(\)/);
});

test("credit navigation additions are minimal and role-scoped", async () => {
  const [accountLayout, adminLayout, navigation] = await Promise.all([
    source(files.accountLayout),
    source(files.adminLayout),
    source(files.navigation),
  ]);

  assert.match(accountLayout, /resolveAccountNavigation/);
  assert.match(adminLayout, /resolveAdministrationNavigation/);
  assert.match(
    navigation,
    /\{ href: "\/account\/credits", label: "Credits" \}/,
  );
  assert.match(navigation, /\{ href: "\/admin\/credits", label: "Credits" \}/);
  assert.match(navigation, /customerActive\s*\? \[/);
  assert.match(navigation, /owner\s*\? \[/);
});

test("credit interfaces are open, responsive, keyboard-native, and asset-free", async () => {
  const sources = await Promise.all(Object.values(files).map(source));
  const combined = sources.join("\n");
  const styles = await source(files.styles);

  assert.match(styles, /border-top: 1px solid var\(--slate\)/);
  assert.match(styles, /border-bottom: 1px solid var\(--slate\)/);
  assert.match(styles, /@media \(max-width: 620px\)/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.doesNotMatch(styles, /\.(?:card|panel|surface)\b/i);
  assert.doesNotMatch(styles, /(?:background-)?image\s*:|url\(|gradient\(/i);
  assert.doesNotMatch(combined, /<(?:img|audio|video|picture|source)\b/i);
  assert.doesNotMatch(combined, /type=["']file["']/i);
  assert.doesNotMatch(combined, /\bFormData\b|\bFileReader\b|\bR2Bucket\b/i);
  assert.doesNotMatch(
    combined,
    /(?:cardNumber|card_number|paymentMethod|payment_method|billingAddress|billing_address|pk_live_|sk_live_)/i,
  );
  assert.match(combined, /type="submit"/);
  assert.match(combined, /type="button"/);
  assert.match(combined, /aria-live="polite"/);
});
