import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const files = {
  publicRoute: "../app/api/contact/route.ts",
  formRoute: "../app/api/admin/contact/form/route.ts",
  stateRoute:
    "../app/api/admin/contact/submissions/[submissionId]/state/route.ts",
  noteRoute:
    "../app/api/admin/contact/submissions/[submissionId]/notes/route.ts",
  publicPage: "../app/(public)/contact/page.tsx",
  adminPage: "../app/admin/contact/page.tsx",
  form: "../components/contact/ContactForm.tsx",
  admin: "../components/contact/ContactAdminWorkspace.tsx",
  styles: "../components/contact/Contact.module.css",
  read: "../db/contact-read.ts",
  write: "../db/contact-write.ts",
};

async function source(path) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("public contact submission is exact, same-origin, idempotent, module-gated, and identity-optional", async () => {
  const [route, write] = await Promise.all([
    source(files.publicRoute),
    source(files.write),
  ]);
  assert.match(route, /readJsonMutation\(request\)/);
  assert.match(route, /requireIdempotencyKey\(request\)/);
  assert.match(route, /requireActiveModule\(env\.DB, "contact"\)/);
  assert.match(route, /getChatGPTUser\(\)/);
  assert.match(route, /identity\?\.userId \?\? null/);
  assert.match(route, /submitContactInquiry/);
  assert.match(write, /consent_version_id/);
  assert.match(write, /consented_at/);
  assert.match(write, /deliveryAdapter: "stored_only"/);
  assert.match(write, /contact\.submission\.create/);
  assert.doesNotMatch(
    `${route}\n${write}`,
    /(?:resend|sendgrid|mailgun|smtp|postmark|nodemailer|webhook_url)/i,
  );
});

test("contact administration is owner-only and preserves exact state and note operations", async () => {
  const sources = await Promise.all([
    source(files.formRoute),
    source(files.stateRoute),
    source(files.noteRoute),
    source(files.adminPage),
    source(files.read),
  ]);
  const combined = sources.join("\n");
  assert.match(combined, /requireApplicationAuthority\(env\.DB, \["owner"\]\)/);
  assert.match(combined, /hasApplicationRole\(identity, "owner"\)/);
  assert.match(combined, /requireActiveModule\(env\.DB, "contact"\)/);
  assert.match(combined, /configureContactForm/);
  assert.match(combined, /changeContactSubmissionState/);
  assert.match(combined, /addContactSubmissionNote/);
  assert.match(combined, /readContactAdminWorkspace/);
  assert.match(combined, /contact_consent_versions/);
  assert.match(combined, /contact_notes/);
});

test("public and administration surfaces show consent and stored-only delivery without assets", async () => {
  const [publicPage, form, admin, styles] = await Promise.all([
    source(files.publicPage),
    source(files.form),
    source(files.admin),
    source(files.styles),
  ]);
  const combined = `${publicPage}\n${form}\n${admin}`;
  assert.match(publicPage, /readPublicContactForm\(env\.DB\)/);
  assert.match(form, /form\.consent\.text/);
  assert.match(form, /Consent version/);
  assert.match(form, /form\.bookingInformation/);
  assert.match(form, /form\.publicContactDetails/);
  assert.match(form, />Booking</);
  assert.match(form, />Contact details</);
  assert.match(form, /delivery adapter is stored only/i);
  assert.match(
    admin,
    /Existing\s+inquiries[\s\S]*retain the text they accepted/i,
  );
  assert.match(admin, /Accepted consent text/);
  assert.match(admin, /Delivery adapter/);
  assert.match(admin, /name="bookingInformation"/);
  assert.match(admin, /name="publicContactDetails"/);
  assert.match(styles, /@media \(max-width: 760px\)/);
  assert.doesNotMatch(combined, /<(?:img|picture|audio|video|source)\b/i);
  assert.doesNotMatch(combined, /type=["']file["']|\bFormData\b.*FileReader/is);
  assert.doesNotMatch(
    combined,
    /(?:cardNumber|card_number|paymentMethod|payment_method|billingAddress|billing_address|pk_live_|sk_live_)/i,
  );
});
