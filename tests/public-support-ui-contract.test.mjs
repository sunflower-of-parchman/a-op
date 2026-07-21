import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("About and Login are dedicated public routes", async () => {
  const [about, login, navigation] = await Promise.all([
    source("app/(public)/about/page.tsx"),
    source("app/(public)/login/page.tsx"),
    source("components/public/PublicNavigation.tsx"),
  ]);

  assert.match(about, /readPublishedPageBySlug\(env\.DB, "about"\)/);
  assert.match(about, /page_about_revision_1/);
  assert.doesNotMatch(about, /linkDirectory|href="\//);
  assert.match(login, /getChatGPTUser\(\)/);
  assert.match(login, /chatGPTSignInPath\("\/account"\)/);
  assert.match(login, /Continue with ChatGPT/);
  assert.match(navigation, /loginHref/);
  assert.match(navigation, /label: "Log in"/);
});

test("Contact remains visible until its real published form is ready", async () => {
  const [page, unavailable, form] = await Promise.all([
    source("app/(public)/contact/page.tsx"),
    source("components/contact/ContactUnavailable.tsx"),
    source("components/contact/ContactForm.tsx"),
  ]);

  assert.match(page, /readPublicContactForm\(env\.DB\)/);
  assert.match(
    page,
    /form \? <ContactForm form=\{form\} \/> : <ContactUnavailable \/>/,
  );
  assert.doesNotMatch(page, /notFound/);
  assert.match(unavailable, /No contact form is published\./);
  assert.match(form, /fetch\("\/api\/contact"/);
  assert.match(form, /consentVersionId: form\.consent\.id/);
});

test("Privacy and Terms expose substantive editable starters without self-publication", async () => {
  const [route, starter, workspace] = await Promise.all([
    source("app/(public)/[slug]/page.tsx"),
    source("lib/legal/public-starters.ts"),
    source("components/legal/LegalDocumentWorkspace.tsx"),
  ]);

  assert.match(route, /<LegalStarterDocument/);
  assert.match(route, /readPublishedLegalDocument/);
  assert.match(starter, /Information this site may collect/);
  assert.match(starter, /Storage and service boundary/);
  assert.match(starter, /Artist content and ownership/);
  assert.match(starter, /Memberships, subscriptions, and credits/);
  assert.match(starter, /\[contact email or contact-page link\]/);
  assert.match(workspace, /getLegalDocumentStarter\(initial\.id\)/);
  assert.match(workspace, /initial\.draft\.setupAnswers === null/);
  assert.doesNotMatch(starter, /approvedAt|publishedAt|publish now/);
});
