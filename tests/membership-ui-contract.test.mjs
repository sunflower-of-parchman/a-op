import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const files = {
  accountLayout: "../app/account/layout.tsx",
  adminLayout: "../app/admin/layout.tsx",
  navigation: "../lib/modules/navigation.ts",
  registry: "../lib/modules/registry.ts",
  customerPage: "../app/account/memberships/page.tsx",
  publicPage: "../app/(public)/membership/page.tsx",
  adminPage: "../app/admin/memberships/page.tsx",
  landing: "../components/memberships/MembershipLanding.tsx",
  landingStyles: "../components/memberships/MembershipLanding.module.css",
  customer: "../components/memberships/CustomerMemberships.tsx",
  admin: "../components/memberships/AdminMemberships.tsx",
  styles: "../components/memberships/Memberships.module.css",
  mutation: "../components/memberships/useMembershipMutation.ts",
  server: "../components/memberships/server.ts",
};

async function source(path) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("Memberships stays identity-aware and role-gated without a dedicated admin navigation item", async () => {
  const [
    accountLayout,
    adminLayout,
    navigation,
    registry,
    customerPage,
    adminPage,
  ] = await Promise.all([
    source(files.accountLayout),
    source(files.adminLayout),
    source(files.navigation),
    source(files.registry),
    source(files.customerPage),
    source(files.adminPage),
  ]);

  assert.doesNotMatch(accountLayout, /resolveAccountNavigation/);
  assert.match(adminLayout, /resolveAdministrationNavigation/);
  assert.doesNotMatch(navigation, /href: "\/admin\/memberships"/);
  assert.match(navigation, /uniqueByHref/);
  assert.match(registry, /accountRoutes: \["\/account\/memberships"\]/);
  assert.match(registry, /adminRoutes: \["\/admin\/memberships"\]/);
  assert.doesNotMatch(registry, /"\/account\/membership"/);
  assert.doesNotMatch(registry, /"\/account\/subscriptions"/);
  assert.doesNotMatch(registry, /"\/admin\/subscriptions"/);

  assert.match(customerPage, /requireChatGPTUser\("\/account\/memberships"\)/);
  assert.match(customerPage, /identity\?\.roles\.includes\("customer"\)/);
  assert.match(customerPage, /requireActiveModule\(env\.DB, "memberships"\)/);
  assert.match(
    customerPage,
    /readCustomerMembershipSurface\(env\.DB, identity\.userId\)/,
  );

  assert.match(adminPage, /hasApplicationRole\(identity, "owner"\)/);
  assert.match(adminPage, /requireActiveModule\(env\.DB, "memberships"\)/);
  assert.match(
    adminPage,
    /readAdminMembershipSurface\(env\.DB, identity\.userId\)/,
  );
  assert.match(adminPage, /activeModules\.includes\("subscriptions"\)/);
});

test("public Membership uses published records without invented price copy", async () => {
  const [page, landing, styles, registry] = await Promise.all([
    source(files.publicPage),
    source(files.landing),
    source(files.landingStyles),
    source(files.registry),
  ]);

  assert.match(page, /requireActiveModule\(env\.DB, "memberships"\)/);
  assert.match(page, /listActiveCommerceProducts\(env\.DB\)/);
  assert.match(page, /productType === "subscription"/);
  assert.match(page, /productType === "membership"/);
  assert.match(landing, /product\?\.name \?\? "Membership benefits"/);
  assert.doesNotMatch(landing, /: "Price"/);
  assert.match(landing, /`\/commerce#\$\{product\.offerAnchorId\}`/);
  for (const destination of [
    "/courses",
    "/music",
    "/account/credits",
    "/account/memberships",
  ]) {
    assert.match(landing, new RegExp(destination.replaceAll("/", "\\/")));
  }
  assert.match(registry, /publicRoutes: \["\/membership", "\/commerce"\]/);
  assert.match(registry, /label: "Membership",\s+href: "\/membership"/);
  assert.match(styles, /@media \(max-width: 900px\)/);
  assert.match(styles, /@media \(max-width: 620px\)/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(landing, /images\[index\]\.url/);
  assert.match(styles, /\.benefitLink img/);
});

test("customer and owner interfaces show durable periods, benefits, credits, history, and record-level Test Mode provenance", async () => {
  const [customer, admin] = await Promise.all([
    source(files.customer),
    source(files.admin),
  ]);
  const combined = `${customer}\n${admin}`;

  assert.match(customer, /Current benefits, access periods, credit balances/);
  assert.match(customer, /Cancellation boundary/);
  assert.match(customer, /Included benefits/);
  assert.match(customer, /Subscription history/);
  assert.doesNotMatch(customer, /CommerceTestModeNotice/);
  assert.match(customer, /membership\.source === "stripe_test"/);
  assert.match(customer, /subscription\.source === "stripe_test"/);

  assert.match(admin, /Membership revisions pin benefits, access, credits/);
  assert.match(admin, /Activation atomically creates the relationship/);
  assert.match(admin, /customerCreditLabel/);
  assert.match(admin, /compactHistory/);
  assert.doesNotMatch(admin, /CommerceTestModeNotice/);
  assert.match(admin, /relationship\.source === "stripe_test"/);
  assert.match(admin, /Follows verified Test Mode events/);
  assert.ok((combined.match(/Stripe Test Mode/g) ?? []).length >= 5);
});

test("owner workspace performs plan, activation, and boundary-aware lifecycle mutations", async () => {
  const admin = await source(files.admin);

  assert.match(admin, /\/api\/admin\/memberships\/plans\/membership/);
  assert.match(admin, /\/api\/admin\/memberships\/plans\/subscription/);
  assert.match(
    admin,
    /`\/api\/admin\/memberships\/relationships\/\$\{relationshipKind\}`/,
  );
  assert.match(
    admin,
    /`\/api\/admin\/memberships\/relationships\/\$\{kind\}\/\$\{encodeURIComponent\(/,
  );
  assert.match(admin, /expectedRevision: relationship\.revision/);
  assert.match(admin, /membershipPlanRevision: plan\.revision/);
  assert.match(admin, /subscriptionPlanRevision: plan\.revision/);
  assert.match(admin, /"pause"/);
  assert.match(admin, /"resume"/);
  assert.match(admin, /"schedule-cancellation"/);
  assert.match(admin, /"clear-cancellation"/);
  assert.match(admin, /"apply-cancellation"/);
  assert.match(admin, /"expire"/);
  assert.match(admin, /"renew"/);
  assert.match(admin, /cancellationReached \?/);
  assert.match(admin, /boundaryReached \?/);
  assert.match(admin, /aria-live="polite"/);
});

test("membership mutation retries retain the exact request idempotency key", async () => {
  const mutation = await source(files.mutation);
  assert.match(
    mutation,
    /fingerprint = `\$\{method\}:\$\{url\}:\$\{serializedBody\}`/,
  );
  assert.match(mutation, /pending\?\.fingerprint === fingerprint/);
  assert.match(mutation, /idempotencyKey: crypto\.randomUUID\(\)/);
  assert.match(mutation, /"idempotency-key": operation\.idempotencyKey/);
  assert.match(
    mutation,
    /if \(response\.status < 500\) pendingOperation\.current = null/,
  );
});

test("membership interfaces stay open, responsive, and native-control based", async () => {
  const sources = await Promise.all(Object.values(files).map(source));
  const combined = sources.join("\n");
  const operationalSources = await Promise.all(
    Object.entries(files)
      .filter(([key]) => key !== "landing" && key !== "landingStyles")
      .map(([, path]) => source(path)),
  );
  const styles = await source(files.styles);

  assert.match(styles, /border-top: 1px solid var\(--slate\)/);
  assert.match(styles, /border-bottom: 1px solid var\(--slate\)/);
  assert.match(styles, /@media \(max-width: 860px\)/);
  assert.match(styles, /@media \(max-width: 620px\)/);
  assert.doesNotMatch(styles, /\.(?:card|panel|surface)\b/i);
  assert.doesNotMatch(styles, /(?:background-)?image\s*:|url\(|gradient\(/i);
  assert.doesNotMatch(
    operationalSources.join("\n"),
    /<(?:img|audio|video|picture|source)\b/i,
  );
  assert.doesNotMatch(combined, /type=["']file["']/i);
  assert.doesNotMatch(combined, /FormData|FileReader|R2Bucket/i);
  assert.doesNotMatch(combined, /placeholder=/i);
  assert.doesNotMatch(
    combined,
    /cardNumber|card_number|cvc|cvv|expiryMonth|payment_method_data/i,
  );
  assert.match(combined, /type="submit"/);
  assert.match(combined, /type="button"/);
  assert.match(combined, /type="datetime-local"/);
});
