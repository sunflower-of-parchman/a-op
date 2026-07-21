import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const files = {
  publicPage: "../app/(public)/licensing/page.tsx",
  accountPage: "../app/account/licenses/page.tsx",
  adminPage: "../app/admin/licensing/page.tsx",
  catalog: "../components/licensing/LicensingCatalog.tsx",
  request: "../components/licensing/LicenseRequestForm.tsx",
  creditRedemption: "../components/licensing/LicenseCreditRedemptionAction.tsx",
  customer: "../components/licensing/CustomerLicenses.tsx",
  admin: "../components/licensing/AdminLicensing.tsx",
  controls: "../components/licensing/LicensingMutationControls.tsx",
  styles: "../components/licensing/Licensing.module.css",
  read: "../db/licensing-read.ts",
};

async function source(path) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("licensing pages use live module-gated server state and correct authority", async () => {
  const [publicPage, accountPage, adminPage, read] = await Promise.all([
    source(files.publicPage),
    source(files.accountPage),
    source(files.adminPage),
    source(files.read),
  ]);

  for (const page of [publicPage, accountPage, adminPage]) {
    assert.match(page, /requireActiveModule\(env\.DB, "licensing"\)/);
    assert.match(page, /export const dynamic = "force-dynamic"/);
  }
  assert.match(publicPage, /listActiveLicenseOffers\(env\.DB\)/);
  assert.match(publicPage, /chatGPTSignInPath\("\/licensing"\)/);
  assert.match(publicPage, /identity\?\.roles\.includes\("customer"\)/);
  assert.match(accountPage, /requireChatGPTUser\("\/account\/licenses"\)/);
  assert.match(accountPage, /identity\?\.roles\.includes\("customer"\)/);
  assert.match(
    accountPage,
    /readCustomerLicenseHistory\(env\.DB, identity\.userId\)/,
  );
  assert.match(
    accountPage,
    /readCustomerCreditAccountDetail\(env\.DB, "license", identity\.userId\)/,
  );
  assert.match(adminPage, /hasApplicationRole\(identity, "owner"\)/);
  assert.match(
    adminPage,
    /readLicenseAdministration\(\s*env\.DB,\s*identity\.userId,?\s*\)/,
  );
  assert.match(read, /price\.stripe_environment = 'test'/);
  assert.match(read, /price\.livemode = 0/);
  assert.match(read, /FROM license_document_jobs/);
  assert.doesNotMatch(read, /lease_token AS|last_operation_key AS/);
});

test("public and customer journeys preserve intended use, frozen terms, Test Checkout, credit redemption, documents, and events", async () => {
  const [catalog, request, customer, creditRedemption] = await Promise.all([
    source(files.catalog),
    source(files.request),
    source(files.customer),
    source(files.creditRedemption),
  ]);

  for (const view of [catalog, customer]) {
    assert.doesNotMatch(view, /CommerceTestModeNotice/);
  }
  assert.match(catalog, /href=\{`\/commerce#\$\{product\.offerAnchorId\}`\}/);
  assert.match(customer, /Test record/);
  assert.match(catalog, /id=\{`offer-\$\{offer\.slug\}`\}/);
  assert.match(request, /fetch\("\/api\/licensing\/requests"/);
  assert.match(request, /"idempotency-key": operationKey\.current/);
  assert.match(request, /licenseOfferId,/);
  assert.match(request, /licenseeName,/);
  assert.match(request, /projectTitle,/);
  assert.match(request, /intendedUse,/);
  assert.match(request, /projectDescription,/);
  assert.match(request, /exact intended use/i);
  assert.doesNotMatch(request, /placeholder=/i);
  assert.match(customer, /frozen version/);
  assert.match(customer, /request\.state === "approved"/);
  assert.match(customer, /<CommerceCheckoutButton/);
  assert.match(customer, /licenseRequestId=\{request\.id\}/);
  assert.match(customer, /<LicenseCreditRedemptionAction/);
  assert.match(customer, /request\.termsSnapshot\.option\.licenseCreditCost/);
  assert.match(customer, /License credits/);
  assert.match(customer, /immutable ledger history/);
  assert.match(
    creditRedemption,
    /\/api\/licensing\/requests\/\$\{encodeURIComponent\(licenseRequestId\)\}\/redeem-credit/,
  );
  assert.match(creditRedemption, /"idempotency-key": operationKey\.current/);
  assert.match(creditRedemption, /body: "\{\}"/);
  assert.match(creditRedemption, /exact cost \{licenseCreditCost\}/);
  assert.match(creditRedemption, /Resume license-credit redemption/);
  assert.match(creditRedemption, /Stripe Test Mode/);
  assert.match(creditRedemption, /No real payment will be accepted\./);
  assert.match(customer, /License documents/);
  assert.match(customer, /same server-owned license entitlement/);
  assert.match(customer, /Download license document/);
  assert.match(
    customer,
    /\/api\/licensing\/documents\/\$\{encodeURIComponent\(document\.id\)\}\/download/,
  );
  assert.match(customer, /Stripe Test Mode/);
  assert.match(customer, /No real payment will be accepted\./);
  assert.match(customer, /License events/);
});

test("owner administration exposes safe decisions and queued operational evidence", async () => {
  const [admin, controls] = await Promise.all([
    source(files.admin),
    source(files.controls),
  ]);

  assert.doesNotMatch(admin, /CommerceTestModeNotice/);
  assert.match(admin, /Approve request/);
  assert.match(admin, /Reject request/);
  assert.match(admin, /Issue owner-approved license/);
  assert.match(admin, /Revoke license/);
  assert.match(admin, /Mark license expired/);
  assert.match(admin, /Documents and jobs/);
  assert.match(admin, /Generate license document/);
  assert.match(admin, /Retry license document/);
  assert.match(admin, /Resume license document/);
  assert.match(admin, /Durable leases make interrupted jobs safe to retry/);
  assert.match(
    admin,
    /\/api\/admin\/licensing\/documents\/\$\{encodeURIComponent\(documentId\)\}\/generate/,
  );
  assert.match(admin, /Operational event history/);
  assert.match(controls, /crypto\.randomUUID\(\)/);
  assert.match(controls, /"idempotency-key": operation\.idempotencyKey/);
  assert.match(controls, /router\.refresh\(\)/);
  assert.match(controls, /aria-live="polite"/);
});

test("licensing interfaces remain open, responsive, theme-token based, and artist-neutral", async () => {
  const sources = await Promise.all(Object.values(files).map(source));
  const combined = sources.join("\n");
  const styles = await source(files.styles);

  assert.match(styles, /border-top: 1px solid var\(--slate\)/);
  assert.match(styles, /border-bottom: 1px solid var\(--slate\)/);
  assert.match(styles, /@media \(max-width: 620px\)/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.doesNotMatch(styles, /\.(?:card|panel|surface)\b/i);
  assert.doesNotMatch(styles, /url\(/i);
  assert.match(styles, /linear-gradient\(/i);
  assert.doesNotMatch(combined, /\/judge-content\//);
  assert.doesNotMatch(combined, /<(?:audio|video|picture|source)\b/i);
  assert.doesNotMatch(combined, /type=["']file["']/i);
  assert.doesNotMatch(combined, /\bFormData\b|\bFileReader\b|\bR2Bucket\b/i);
  assert.doesNotMatch(
    combined,
    /(?:cardNumber|card_number|paymentMethod|payment_method|billingAddress|billing_address)/i,
  );
  assert.match(combined, /type="submit"/);
  assert.match(combined, /type="button"/);
});

test("empty licensing reports unpublished sections without invented plans or FAQs", async () => {
  const [publicPage, catalog, contactForm, styles] = await Promise.all([
    source(files.publicPage),
    source(files.catalog),
    source("../components/contact/ContactForm.tsx"),
    source(files.styles),
  ]);

  assert.match(publicPage, /listActiveCommerceProducts\(env\.DB\)/);
  assert.match(publicPage, /readPublicContactForm\(env\.DB\)/);
  assert.doesNotMatch(publicPage, /PublicPageHeader/);
  assert.match(catalog, />One-Time Licenses</);
  assert.match(catalog, />Licensing Plans</);
  assert.match(catalog, />Education</);
  assert.match(catalog, /function CustomLicensingCallout/);
  assert.match(catalog, /aria-label="Custom Licensing"/);
  assert.match(catalog, /href="\/contact"/);
  assert.match(catalog, /Contact is not currently available\./);
  assert.match(catalog, /No one-time licenses are published\./);
  assert.match(catalog, /No licensing plans are published\./);
  assert.match(catalog, /No education plans are published\./);
  assert.doesNotMatch(catalog, />Price<|>Benefit<|>Question<|>Answer</);
  assert.doesNotMatch(catalog, /\$(?:25|60|100|250|300|500)|20\.83|41\.67/);
  assert.match(contactForm, /fetch\("\/api\/contact"/);
  assert.match(contactForm, /selectedCategory/);
  assert.match(contactForm, /embedded \? styles\.embedded/);
  assert.match(styles, /\.planGrid/);
  assert.match(styles, /\.planTile/);
});
