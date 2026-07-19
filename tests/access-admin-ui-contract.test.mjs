import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const files = {
  adminLayout: "../app/admin/layout.tsx",
  accountLayout: "../app/account/layout.tsx",
  accessPage: "../app/admin/access/page.tsx",
  customersPage: "../app/admin/customers/page.tsx",
  accountAccessPage: "../app/account/access/page.tsx",
  workspace: "../components/admin/access/AccessWorkspace.tsx",
  workspaceStyles: "../components/admin/access/AccessWorkspace.module.css",
  customers: "../components/admin/access/CustomerWorkspace.tsx",
  customerStyles: "../components/admin/access/CustomerWorkspace.module.css",
  mutation: "../components/admin/access/useAccessMutation.ts",
  account: "../components/account/CustomerAccessLibrary.tsx",
  customerAccessRead: "../db/customer-access-read.ts",
  navigation: "../lib/modules/navigation.ts",
};

async function source(path) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("Access and Customers are real core owner and account destinations", async () => {
  const [
    adminLayout,
    accountLayout,
    accessPage,
    customersPage,
    accountPage,
    navigation,
  ] = await Promise.all([
    source(files.adminLayout),
    source(files.accountLayout),
    source(files.accessPage),
    source(files.customersPage),
    source(files.accountAccessPage),
    source(files.navigation),
  ]);

  assert.match(adminLayout, /resolveAdministrationNavigation/);
  assert.match(accountLayout, /resolveAccountNavigation/);
  assert.match(navigation, /href: "\/admin\/access", label: "Access"/);
  assert.match(navigation, /href: "\/admin\/customers", label: "Customers"/);
  assert.match(
    navigation,
    /customerActive[\s\S]*?href: "\/account\/access", label: "Access"/,
  );

  for (const page of [accessPage, customersPage]) {
    assert.match(page, /hasApplicationRole\(identity, "owner"\)/);
    assert.match(page, /readAdminAccessOverview\(env\.DB, identity\.userId\)/);
  }
  assert.match(accountPage, /requireChatGPTUser\("\/account\/access"\)/);
  assert.match(accountPage, /identity\?\.roles\.includes\("customer"\)/);
  assert.match(accountPage, /readCustomerAccessLibrary\(/);
  assert.doesNotMatch(accountPage, /requireActiveModule|customer-library/);
});

test("owner access workspace performs the complete plan and grant lifecycle", async () => {
  const workspace = await source(files.workspace);

  assert.match(workspace, /"\/api\/admin\/access\/plans"/);
  assert.match(
    workspace,
    /`\/api\/admin\/access\/plans\/\$\{encodeURIComponent\(editingPlanId\)\}`/,
  );
  assert.match(workspace, /"\/api\/admin\/access\/grants"/);
  assert.match(
    workspace,
    /`\/api\/admin\/access\/grants\/\$\{encodeURIComponent\(grantSetId\)\}\/\$\{transition\}`/,
  );
  assert.match(workspace, /expectedRevision/);
  assert.match(workspace, /expectedPlanRevision: plan\.revision/);
  assert.match(workspace, /remainingUses: null/);
  assert.match(workspace, /definition freezes when its first grant is issued/);
  assert.match(
    workspace,
    /Access issued\. Grants and entitlements are active\./,
  );
  assert.match(workspace, /Recent protected delivery/);
  assert.match(workspace, /aria-live="polite"/);
});

test("access mutation retries preserve the exact idempotency key", async () => {
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

test("customer Access renders only server-projected same-origin download controls", async () => {
  const [account, customerAccessRead] = await Promise.all([
    source(files.account),
    source(files.customerAccessRead),
  ]);

  assert.match(account, /item\.downloadUrl \?/);
  assert.match(account, /href=\{item\.downloadUrl\}/);
  assert.match(
    account,
    /aria-label=\{`Download \$\{item\.resource\.title\}`\}/,
  );
  assert.doesNotMatch(account, /api\/media\/tracks/);
  assert.match(customerAccessRead, /module_key = 'downloads'/);
  assert.match(customerAccessRead, /readTrackDownloadDelivery\(/);
  assert.match(customerAccessRead, /resolution\.publishedRevisionId/);
  assert.match(
    customerAccessRead,
    /\/api\/media\/tracks\/\$\{encodeURIComponent\(delivery\.trackId\)\}\/download\?revision=\$\{encodeURIComponent\(delivery\.revisionId\)\}/,
  );
});

test("customer Access persistently identifies stored commerce Test Mode records", async () => {
  const [account, customerAccessRead] = await Promise.all([
    source(files.account),
    source(files.customerAccessRead),
  ]);

  assert.match(account, /<CommerceTestModeNotice/);
  assert.match(account, /STRIPE_TEST_MODE_LABEL/);
  assert.match(
    account,
    /Commerce-derived memberships, subscriptions, licenses, credits, entitlements, and deliveries/,
  );
  assert.ok((account.match(/commerceTestMode/g) ?? []).length >= 3);
  assert.match(customerAccessRead, /stripe_environment, livemode/);
  assert.match(
    customerAccessRead,
    /sourceType !== "grant" && environment === "test" && livemode === 0/,
  );
  assert.match(customerAccessRead, /commerceTestEntitlementIds/);
  assert.doesNotMatch(
    account + customerAccessRead,
    /stripe_(?:customer|subscription|payment|checkout|event)_id/i,
  );
});

test("access interfaces stay open, responsive, native-control based, and asset-free", async () => {
  const sources = await Promise.all(Object.values(files).map(source));
  const combined = sources.join("\n");
  const styles = `${await source(files.workspaceStyles)}\n${await source(
    files.customerStyles,
  )}`;

  assert.match(styles, /border-top: 1px solid var\(--slate\)/);
  assert.match(styles, /border-bottom: 1px solid var\(--slate\)/);
  assert.match(styles, /@media \(max-width: 760px\)/);
  assert.doesNotMatch(styles, /\.(?:card|panel|surface)\b/i);
  assert.doesNotMatch(styles, /(?:background-)?image\s*:|url\(/i);
  assert.doesNotMatch(combined, /<(?:img|audio|video|picture|source)\b/i);
  assert.doesNotMatch(combined, /type=["']file["']/i);
  assert.doesNotMatch(combined, /FormData|FileReader|R2Bucket/i);
  assert.doesNotMatch(combined, /placeholder=/i);
  assert.match(combined, /type="checkbox"/);
  assert.match(combined, /type="submit"/);
  assert.match(combined, /type="button"/);
});
