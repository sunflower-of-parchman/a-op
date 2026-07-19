import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const files = {
  publicPage: "../app/(public)/commerce/page.tsx",
  returnPage: "../app/(public)/commerce/return/page.tsx",
  legacyReturn: "../app/account/orders/return/page.tsx",
  accountPage: "../app/account/orders/page.tsx",
  adminPage: "../app/admin/commerce/page.tsx",
  accountLayout: "../app/account/layout.tsx",
  adminLayout: "../app/admin/layout.tsx",
  notice: "../components/commerce/CommerceTestModeNotice.tsx",
  catalog: "../components/commerce/CommerceCatalog.tsx",
  checkout: "../components/commerce/CommerceCheckoutButton.tsx",
  returnResult: "../components/commerce/CommerceReturnResult.tsx",
  returnRefresh: "../components/commerce/CommerceReturnRefresh.tsx",
  customerOrders: "../components/commerce/CustomerOrders.tsx",
  adminCommerce: "../components/commerce/AdminCommerce.tsx",
  styles: "../components/commerce/Commerce.module.css",
  read: "../db/commerce-surface-read.ts",
  productRead: "../db/commerce-read.ts",
  checkoutApi: "../app/api/commerce/checkout/route.ts",
  navigation: "../lib/modules/navigation.ts",
};

async function source(path) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("every commerce surface persistently identifies the test-only boundary", async () => {
  const [notice, catalog, returnResult, customerOrders, adminCommerce] =
    await Promise.all([
      source(files.notice),
      source(files.catalog),
      source(files.returnResult),
      source(files.customerOrders),
      source(files.adminCommerce),
    ]);

  assert.match(notice, /STRIPE_TEST_MODE_LABEL/);
  assert.match(notice, /NO_REAL_PAYMENT_STATEMENT/);
  assert.match(notice, /This Site cannot accept a real payment/);
  for (const surface of [
    catalog,
    returnResult,
    customerOrders,
    adminCommerce,
  ]) {
    assert.match(surface, /<CommerceTestModeNotice/);
    assert.match(surface, /Test (?:record|event|fulfillment|only)/);
  }
  assert.match(adminCommerce, /There is no live commerce control/);
});

test("public product selection uses active module-gated products and hosted Test Checkout", async () => {
  const [page, catalog, checkout, productRead] = await Promise.all([
    source(files.publicPage),
    source(files.catalog),
    source(files.checkout),
    source(files.productRead),
  ]);

  assert.match(page, /listActiveCommerceProducts\(env\.DB\)/);
  assert.match(
    page,
    /resolveApplicationIdentity\(env\.DB, authenticatedUser\)/,
  );
  assert.match(page, /identity\?\.roles\.includes\("customer"\)/);
  assert.match(page, /chatGPTSignInPath\("\/commerce"\)/);
  assert.match(
    productRead,
    /requireProductModule\(binding, product\.productType\)/,
  );
  assert.match(productRead, /FROM artist_modules/);

  assert.match(catalog, /products\.length === 0/);
  assert.match(catalog, /id=\{product\.offerAnchorId\}/);
  assert.match(productRead, /membership_plan\.slug AS membership_plan_slug/);
  assert.match(
    productRead,
    /subscription_plan\.slug AS subscription_plan_slug/,
  );
  assert.match(productRead, /`membership-\$\{membershipPlanSlug\}`/);
  assert.match(productRead, /`subscription-\$\{subscriptionPlanSlug\}`/);
  assert.match(catalog, /No test products are available/);
  assert.match(catalog, /<CommerceCheckoutButton/);
  assert.match(catalog, /approved licensing request is required/i);
  assert.match(checkout, /fetch\("\/api\/commerce\/checkout"/);
  assert.match(checkout, /"idempotency-key": operationKey\.current/);
  assert.match(checkout, /body: JSON\.stringify\(\{/);
  assert.match(checkout, /productId,/);
  assert.doesNotMatch(checkout, /amountMinor|currency|priceId|customerUserId/);
  assert.match(checkout, /url\.hostname === "checkout\.stripe\.com"/);
  assert.match(checkout, /window\.location\.assign\(checkoutUrl\)/);
});

test("return and history views read same-customer application state without granting access", async () => {
  const [
    returnPage,
    legacyReturn,
    returnResult,
    returnRefresh,
    accountPage,
    read,
    checkoutApi,
  ] = await Promise.all([
    source(files.returnPage),
    source(files.legacyReturn),
    source(files.returnResult),
    source(files.returnRefresh),
    source(files.accountPage),
    source(files.read),
    source(files.checkoutApi),
  ]);

  assert.match(returnPage, /requireChatGPTUser\(returnTo\)/);
  assert.match(returnPage, /identity\?\.roles\.includes\("customer"\)/);
  assert.match(
    returnPage,
    /readCustomerCommerceReturn\(env\.DB, identity\.userId, checkoutId\)/,
  );
  assert.match(returnPage, /safeCheckoutId/);
  assert.match(returnPage, /browserCanceled/);
  assert.match(returnPage, /canceledValue === "1"/);
  assert.match(
    checkoutApi,
    /new URL\(checkout\.returnPath, requestUrl\.origin\)/,
  );
  assert.match(
    checkoutApi,
    /cancelUrl\.searchParams\.set\("checkout", checkout\.id\)/,
  );
  assert.match(checkoutApi, /cancelUrl\.searchParams\.set\("canceled", "1"\)/);
  assert.match(legacyReturn, /redirect\(/);
  assert.match(legacyReturn, /`\/commerce\/return\?checkout=/);
  assert.match(
    returnResult,
    /browser return value\s+cannot create an order or grant access/i,
  );
  assert.match(
    returnResult,
    /Stripe Test Checkout was canceled in the browser/,
  );
  assert.match(returnResult, /granted no access/);
  assert.match(returnResult, /The return address does not grant access/);
  assert.match(returnRefresh, /\/api\/commerce\/checkout\//);
  assert.match(returnRefresh, /router\.refresh\(\)/);
  assert.doesNotMatch(
    returnPage + returnResult,
    /INSERT INTO|UPDATE |DELETE FROM/,
  );

  assert.match(accountPage, /requireChatGPTUser\("\/account\/orders"\)/);
  assert.match(accountPage, /identity\?\.roles\.includes\("customer"\)/);
  assert.match(
    accountPage,
    /readCustomerCommerceOrders\(env\.DB, identity\.userId\)/,
  );
  assert.match(read, /WHERE orders\.customer_user_id = \?1/);
  assert.match(read, /checkout_sessions\.customer_user_id = \?2/);
});

test("owner commerce administration is read-only operational evidence", async () => {
  const [
    adminPage,
    adminCommerce,
    read,
    accountLayout,
    adminLayout,
    navigation,
  ] = await Promise.all([
    source(files.adminPage),
    source(files.adminCommerce),
    source(files.read),
    source(files.accountLayout),
    source(files.adminLayout),
    source(files.navigation),
  ]);

  assert.match(adminPage, /hasApplicationRole\(identity, "owner"\)/);
  assert.match(adminPage, /readAdminCommerceEvidence\(env\.DB\)/);
  assert.match(adminPage, /listActiveCommerceProducts\(env\.DB\)/);
  assert.match(adminCommerce, /Orders and customers/);
  assert.match(adminCommerce, /Signed event evidence/);
  assert.match(adminCommerce, /Fulfillment evidence/);
  assert.match(
    adminCommerce,
    /Raw webhook\s+bodies and payment details are never shown/,
  );
  assert.doesNotMatch(adminCommerce, /type="(?:button|submit)"|<form/);
  assert.doesNotMatch(read, /raw_body_digest AS|result_json AS/);
  assert.match(accountLayout, /resolveAccountNavigation/);
  assert.match(adminLayout, /resolveAdministrationNavigation/);
  assert.match(navigation, /href: "\/account\/orders", label: "Orders"/);
  assert.match(navigation, /href: "\/admin\/commerce", label: "Commerce"/);
});

test("commerce interfaces stay open, responsive, keyboard-native, and asset-free", async () => {
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
    /(?:cardNumber|card_number|paymentMethod|payment_method|billingAddress|billing_address)/i,
  );
  assert.match(combined, /type="button"/);
  assert.match(combined, /aria-live="polite"/);
});
