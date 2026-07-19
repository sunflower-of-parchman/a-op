import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";

register(
  new URL("./helpers/typescript-alias-loader.mjs", import.meta.url),
  import.meta.url,
);

const legal = await import("../lib/legal/index.ts");

function validSetup(overrides = {}) {
  return {
    ...legal.createDefaultLegalSetupAnswers(),
    publicContactEmail: "artist@example.invalid",
    contactSubmissions: true,
    downloads: true,
    memberships: true,
    subscriptions: true,
    licensing: true,
    services: ["OpenAI Sites", "Stripe", "Fictional support service"],
    ...overrides,
  };
}

test("legal setup accepts the exact complete installation-answer schema", () => {
  const result = legal.validateLegalSetupAnswers(validSetup());
  assert.equal(result.ok, true);
  assert.deepEqual(result.value.services, [
    "OpenAI Sites",
    "Stripe",
    "Fictional support service",
  ]);
});

test("legal setup rejects live commerce, card handling, residency promises, and extra fields", () => {
  for (const setup of [
    validSetup({ stripeEnvironment: "live" }),
    validSetup({ realPaymentsAccepted: true }),
    validSetup({ paymentCardDataHandledByAop: true }),
    validSetup({ sitesResidencyAtLaunch: "guaranteed" }),
    validSetup({ telemetryRetentionDays: 366 }),
    { ...validSetup(), liveCommerce: true },
  ]) {
    const result = legal.validateLegalSetupAnswers(setup);
    assert.equal(result.ok, false);
  }
});

test("legal draft validation normalizes writing and requires a complete setup", () => {
  const result = legal.validateLegalDraftInput({
    documentId: "privacy",
    title: " Privacy Policy ",
    introduction: " Artist-reviewed policy. ",
    bodyText: " First line.\r\nSecond line. ",
    setupAnswers: validSetup(),
  });
  assert.equal(result.ok, true);
  assert.equal(result.value.title, "Privacy Policy");
  assert.equal(result.value.bodyText, "First line.\nSecond line.");

  const incomplete = legal.validateLegalDraftInput({
    documentId: "privacy",
    title: "Privacy Policy",
    introduction: "",
    bodyText: "Policy body.",
    setupAnswers: {},
  });
  assert.equal(incomplete.ok, false);
});
