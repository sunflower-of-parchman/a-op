import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";

register(
  new URL("./helpers/typescript-alias-loader.mjs", import.meta.url),
  import.meta.url,
);

const {
  addLicenseTermMonths,
  licenseExpiryReached,
  LicenseStateTransitionError,
  transitionLicenseDefinitionState,
  transitionIssuedLicenseState,
  transitionLicenseRequestState,
} = await import("../lib/licensing/state-machine.ts");
const { projectLicenseDocumentText } =
  await import("../lib/licensing/snapshot.ts");

test("license request and issued-license states retain terminal history", () => {
  assert.equal(
    transitionLicenseRequestState("pending_approval", "approve", true),
    "approved",
  );
  assert.equal(
    transitionLicenseRequestState("pending_approval", "reject", true),
    "rejected",
  );
  assert.equal(
    transitionLicenseRequestState("submitted", "issue", false),
    "issued",
  );
  assert.equal(
    transitionLicenseRequestState("approved", "issue", true),
    "issued",
  );
  assert.equal(transitionIssuedLicenseState("active", "revoke"), "revoked");
  assert.equal(transitionIssuedLicenseState("active", "expire"), "expired");
  assert.equal(transitionLicenseDefinitionState("draft", "active"), "active");
  assert.equal(
    transitionLicenseDefinitionState("active", "archived"),
    "archived",
  );
  assert.throws(
    () => transitionLicenseRequestState("rejected", "issue", true),
    LicenseStateTransitionError,
  );
  assert.throws(
    () => transitionIssuedLicenseState("revoked", "expire"),
    LicenseStateTransitionError,
  );
  assert.throws(
    () => transitionLicenseDefinitionState("archived", "active"),
    LicenseStateTransitionError,
  );
});

test("license terms calculate deterministic calendar expiry boundaries", () => {
  assert.equal(
    addLicenseTermMonths("2024-01-31T18:30:00.000Z", 1),
    "2024-02-29T18:30:00.000Z",
  );
  assert.equal(
    addLicenseTermMonths("2024-02-29T18:30:00.000Z", 12),
    "2025-02-28T18:30:00.000Z",
  );
  assert.equal(addLicenseTermMonths("2026-07-19T12:00:00.000Z", null), null);
  assert.equal(
    licenseExpiryReached(
      "2026-08-19T12:00:00.000Z",
      "2026-08-19T12:00:00.000Z",
    ),
    true,
  );
});

test("license document projection is deterministic and performs no storage work", () => {
  const termsSnapshot = {
    schemaVersion: 1,
    offer: {
      id: "offer_1",
      revision: 1,
      slug: "film-license",
      commerceProductId: "product_1",
      commercePriceId: "price_1",
    },
    track: {
      id: "track_1",
      revisionId: "track_revision_1",
      slug: "fictional-track",
      title: "Fictional Track",
    },
    terms: {
      id: "terms_1",
      versionId: "terms_version_1",
      version: 1,
      slug: "sync-terms",
      name: "Synchronization terms",
      title: "Artist synchronization license",
      introduction: "Artist-authored introduction.",
      generalTerms: "Artist-authored general terms.",
      disclaimer: "Artist-authored disclaimer.",
    },
    option: {
      id: "option_1",
      optionKey: "film",
      label: "Independent film",
      description: "Fictional use.",
      usageCategory: "Synchronization",
      allowedMedia: ["Film"],
      audienceLabel: null,
      maxAudience: null,
      distributionLabel: null,
      maxCopies: null,
      termMonths: 12,
      territory: "Worldwide",
      attributionRequired: true,
      attributionText: "Music by the artist",
      exclusive: false,
      requiresApproval: true,
      licenseCreditCost: 1,
      includesTrackDownload: true,
    },
    testPrice: { id: "price_1", amountMinor: 2500, currency: "USD" },
  };
  const intendedUseSnapshot = {
    schemaVersion: 1,
    licenseeName: "Fictional Licensee",
    projectTitle: "Fictional Project",
    intendedUse: "Opening credits",
    projectDescription: "A fictional independent film.",
  };
  const input = {
    issuedLicenseId: "issued_license_1",
    issuedAt: "2026-07-19T12:00:00.000Z",
    expiresAt: "2027-07-19T12:00:00.000Z",
    termsSnapshot,
    intendedUseSnapshot,
  };
  const first = projectLicenseDocumentText(input);
  const second = projectLicenseDocumentText(input);
  assert.equal(first, second);
  assert.match(first, /^Artist synchronization license/);
  assert.match(first, /Licensee: Fictional Licensee/);
  assert.match(first, /Artist-authored general terms\./);
});
