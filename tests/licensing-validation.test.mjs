import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";

register(
  new URL("./helpers/typescript-alias-loader.mjs", import.meta.url),
  import.meta.url,
);

const {
  validateLicenseDefinitionStateChangeInput,
  validateIssuedLicenseTerminalInput,
  validateLicenseIssuanceInput,
  validateLicenseOfferCreateInput,
  validateLicenseRequestSubmitInput,
  validateStripeTestLicenseFulfillmentInput,
  validateLicenseTermsCreateInput,
  validateLicenseTermsRevisionInput,
} = await import("../lib/licensing/validation.ts");

function option(overrides = {}) {
  return {
    optionKey: "independent-film",
    label: "Independent film",
    description: "A fictional synchronization use.",
    usageCategory: "Synchronization",
    allowedMedia: ["Film", "Festival trailer"],
    audienceLabel: "Festival audiences",
    maxAudience: 100_000,
    distributionLabel: "One finished production",
    maxCopies: 1,
    termMonths: 12,
    territory: "Worldwide",
    attributionRequired: true,
    attributionText: "Music by the artist",
    exclusive: false,
    requiresApproval: true,
    licenseCreditCost: 2,
    includesTrackDownload: true,
    ...overrides,
  };
}

function terms(overrides = {}) {
  return {
    slug: "sync-terms",
    state: "active",
    name: "Synchronization terms",
    title: "Artist synchronization license",
    introduction: "These are fictional artist-authored introductory terms.",
    generalTerms: "These are fictional artist-authored general terms.",
    disclaimer: "Fictional disclaimer.",
    options: [option()],
    ...overrides,
  };
}

test("license terms normalize one immutable definition and reject ambiguous options", () => {
  const result = validateLicenseTermsCreateInput(
    terms({ slug: " Sync-Terms ", name: "  Synchronization terms  " }),
  );
  assert.equal(result.ok, true);
  assert.equal(result.value.slug, "sync-terms");
  assert.equal(result.value.name, "Synchronization terms");
  assert.deepEqual(result.value.options[0].allowedMedia, [
    "Film",
    "Festival trailer",
  ]);
  assert.equal(Object.isFrozen(result.value), true);
  assert.equal(Object.isFrozen(result.value.options), true);
  assert.equal(Object.isFrozen(result.value.options[0]), true);

  const invalid = validateLicenseTermsCreateInput(
    terms({
      options: [
        option({ attributionText: null }),
        option({ optionKey: "independent-film" }),
      ],
      livemode: true,
    }),
  );
  assert.equal(invalid.ok, false);
  assert.deepEqual(invalid.issues.map(({ field }) => field).sort(), [
    "livemode",
    "options",
    "options.0.attributionText",
  ]);

  const revision = { ...terms() };
  delete revision.slug;
  delete revision.state;
  assert.equal(validateLicenseTermsRevisionInput(revision).ok, true);
});

test("offers and intended-use requests accept only server-relevant facts", () => {
  const offer = validateLicenseOfferCreateInput({
    slug: "track-film-license",
    trackId: "track_fictional",
    trackRevisionId: "track_revision_fictional",
    licenseTermsId: "license_terms_fictional",
    licenseTermsVersion: 2,
    licenseOptionId: "license_option_fictional",
    commerceProductId: "commerce_product_fictional",
    commercePriceId: "commerce_price_fictional",
    state: "active",
  });
  assert.equal(offer.ok, true);

  const request = validateLicenseRequestSubmitInput({
    licenseOfferId: "license_offer_fictional",
    licenseeName: "  Fictional Licensee  ",
    projectTitle: "  Fictional Project  ",
    intendedUse: "  Opening credits  ",
    projectDescription: "  A fictional independent production.  ",
  });
  assert.equal(request.ok, true);
  assert.equal(request.value.licenseeName, "Fictional Licensee");
  assert.equal(request.value.intendedUse, "Opening credits");
  assert.equal(
    validateLicenseRequestSubmitInput({
      ...request.value,
      customerUserId: "browser_claim",
    }).ok,
    false,
  );
  assert.equal(
    validateLicenseDefinitionStateChangeInput({
      expectedState: "draft",
      nextState: "active",
    }).ok,
    true,
  );
  assert.equal(
    validateLicenseDefinitionStateChangeInput({
      expectedState: "active",
      nextState: "active",
    }).ok,
    false,
  );
});

test("issuance contracts distinguish owner, verified test order, and consumed credit links", () => {
  assert.equal(
    validateLicenseIssuanceInput({
      source: "owner_approval",
      licenseRequestId: "license_request_1",
      expectedRevision: 2,
      issuedAt: "2026-07-19T06:00:00-06:00",
    }).value.issuedAt,
    "2026-07-19T12:00:00.000Z",
  );
  assert.equal(
    validateLicenseIssuanceInput({
      source: "stripe_test_order",
      licenseRequestId: "license_request_1",
      expectedRevision: 2,
      issuedAt: "2026-07-19T12:00:00.000Z",
      orderId: "order_test_1",
      fulfillmentEventId: "fulfillment_test_1",
    }).ok,
    true,
  );
  assert.equal(
    validateLicenseIssuanceInput({
      source: "credit_redemption",
      licenseRequestId: "license_request_1",
      expectedRevision: 2,
      issuedAt: "2026-07-19T12:00:00.000Z",
      creditLedgerEntryId: "credit_ledger_1",
    }).ok,
    true,
  );
  const live = validateLicenseIssuanceInput({
    source: "stripe_test_order",
    licenseRequestId: "license_request_1",
    expectedRevision: 2,
    issuedAt: "2026-07-19T12:00:00.000Z",
    orderId: "order_live_1",
    fulfillmentEventId: "fulfillment_live_1",
    livemode: true,
  });
  assert.equal(live.ok, false);
  assert.deepEqual(
    live.issues.map(({ field }) => field),
    ["livemode"],
  );
  assert.equal(
    validateIssuedLicenseTerminalInput({
      expectedRevision: 1,
      effectiveAt: "2026-08-19T12:00:00.000Z",
      reason: "The recorded term completed.",
    }).ok,
    true,
  );

  const provider = validateStripeTestLicenseFulfillmentInput({
    customerUserId: "customer_license_provider",
    commerceProductId: "product_license_provider",
    commercePriceId: "price_license_provider",
    commerceEventId: "commerce_event_license_provider",
    orderId: "order_license_provider",
    fulfillmentEventId: "fulfillment_license_provider",
    factsFingerprint: "a".repeat(64),
    stripeEventId: "evt_AopLicenseProvider001",
    stripeObjectId: "cs_test_AopLicenseProvider001",
    fulfillmentProviderObjectId: "cs_test_AopLicenseProvider001",
    providerEventCreatedAt: "2026-07-20T06:00:00-06:00",
    requestId: "request.license.provider",
  });
  assert.equal(provider.ok, true);
  assert.equal(
    provider.value.providerEventCreatedAt,
    "2026-07-20T12:00:00.000Z",
  );
  assert.equal(Object.isFrozen(provider.value), true);
  const providerWithLiveClaim = validateStripeTestLicenseFulfillmentInput({
    ...provider.value,
    livemode: true,
  });
  assert.equal(providerWithLiveClaim.ok, false);
  assert.deepEqual(
    providerWithLiveClaim.issues.map(({ field }) => field),
    ["livemode"],
  );
});
