import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  PORTABLE_DOCUMENT_NAMES,
  PORTABLE_ENTITY_KINDS,
  createArtistExportArchive,
  createSemanticFingerprint,
  serializeArtistExportArchive,
  verifyArtistExportArchive,
} from "../lib/portability/index.ts";
import { rehearseArtistExportRestoreInMemory } from "../lib/portability/sqlite-rehearsal.mjs";
import {
  DEFINITION_TABLES,
  createMigratedApplicationDatabaseInMemory,
  projectApplicationSnapshot,
  restoreArtistInstallationSnapshotPass,
} from "../lib/portability/application-restore.mjs";

const f = (values) =>
  Object.entries(values).map(([name, value]) => ({ name, value }));
const r = (values) =>
  Object.entries(values).map(([name, target]) => ({
    name,
    targetEntity: target[0],
    targetId: target[1],
  }));
const record = (entity, id, fields, relations = {}) => ({
  entity,
  id,
  fields: f(fields),
  relations: r(relations),
});

function fictionalSnapshot() {
  const publishedAt = "2026-07-19T05:00:00.000Z";
  const publication = (slug) => ({
    slug,
    publicationState: "published",
    revision: 1,
    publishedAt,
  });
  return {
    artist: [
      record("artist-config", "artist-config", {
        revision: 1,
        displayName: "Fictional Artist",
        siteTitle: "Fictional Artist Music",
        headline: "Music, access, and artist-owned delivery.",
        introduction: "A fictional installation used only for verification.",
        footerText: "Fictional Artist",
      }),
    ],
    modules: [
      record("module", "downloads", {
        key: "downloads",
        active: true,
        revision: 1,
      }),
    ],
    navigation: [
      record("navigation-set", "primary", {
        key: "primary",
        label: "Primary",
        revision: 1,
        publishedVersion: 1,
      }),
      record(
        "navigation-item",
        "navigation:primary:music",
        {
          key: "music",
          label: "Music",
          href: "/music",
          position: 0,
          external: false,
          moduleKey: null,
          version: 1,
        },
        { navigationSet: ["navigation-set", "primary"] },
      ),
    ],
    pages: [
      record(
        "page",
        "page:about",
        { ...publication("about"), moduleKey: null, kind: "standard" },
        {
          draftRevision: ["page-revision", "page:about:r1"],
          publishedRevision: ["page-revision", "page:about:r1"],
        },
      ),
      record(
        "page-revision",
        "page:about:r1",
        {
          revision: 1,
          moduleKey: null,
          kind: "standard",
          title: "About",
          introduction: "About this music.",
          bodyText: "Fictional page copy.",
        },
        { page: ["page", "page:about"] },
      ),
      record(
        "page-section-placement",
        "page:about:r1:section:story",
        { position: 1 },
        {
          pageRevision: ["page-revision", "page:about:r1"],
          contentSectionRevision: [
            "content-section-revision",
            "section:story:r1",
          ],
        },
      ),
    ],
    sections: [
      record(
        "content-section",
        "section:story",
        {
          key: "story",
          publicationState: "published",
          revision: 1,
          publishedAt,
        },
        {
          draftRevision: ["content-section-revision", "section:story:r1"],
          publishedRevision: ["content-section-revision", "section:story:r1"],
        },
      ),
      record(
        "content-section-revision",
        "section:story:r1",
        {
          revision: 1,
          kind: "prose",
          heading: "Story",
          bodyText: "A fictional artist story.",
        },
        { contentSection: ["content-section", "section:story"] },
      ),
    ],
    catalog: [
      record("track", "track:first-light", publication("first-light"), {
        draftRevision: ["track-revision", "track:first-light:r1"],
        publishedRevision: ["track-revision", "track:first-light:r1"],
      }),
      record(
        "track-revision",
        "track:first-light:r1",
        {
          revision: 1,
          title: "First Light",
          subtitle: null,
          description: "A fictional track.",
          durationMs: 180000,
          isrc: null,
          copyrightNotice: "2026 Fictional Artist",
          explicit: false,
          viewMode: "public",
          streamMode: "public",
          downloadMode: "protected",
          tags: ["instrumental"],
        },
        {
          track: ["track", "track:first-light"],
          originalMedia: ["media-object", "media:first-light"],
          streamingDerivative: ["media-derivative", "media:first-light:stream"],
          downloadDerivative: ["media-derivative", "media:first-light:stream"],
        },
      ),
      record(
        "release",
        "release:first-light",
        publication("first-light-release"),
        {
          draftRevision: ["release-revision", "release:first-light:r1"],
          publishedRevision: ["release-revision", "release:first-light:r1"],
        },
      ),
      record(
        "release-revision",
        "release:first-light:r1",
        {
          revision: 1,
          releaseType: "single",
          title: "First Light",
          subtitle: null,
          description: "A fictional single.",
          releaseDate: "2026-07-19",
          catalogNumber: null,
          copyrightNotice: "2026 Fictional Artist",
          viewMode: "public",
          tags: ["single"],
        },
        { release: ["release", "release:first-light"] },
      ),
      record(
        "release-track",
        "release:first-light:r1:track:first-light",
        { position: 1, discNumber: 1, trackNumber: 1 },
        {
          releaseRevision: ["release-revision", "release:first-light:r1"],
          track: ["track", "track:first-light"],
          trackRevision: ["track-revision", "track:first-light:r1"],
        },
      ),
      record(
        "credit",
        "credit:first-light:artist",
        {
          name: "Fictional Artist",
          role: "Composer",
          details: "Composition and performance",
          position: 1,
        },
        { subject: ["track-revision", "track:first-light:r1"] },
      ),
    ],
    access: [
      record("access-plan", "access:supporter", {
        slug: "supporter",
        name: "Supporter access",
        description: "Protected track access.",
        state: "active",
        revision: 1,
      }),
      record(
        "access-plan-item",
        "access:supporter:track:first-light",
        {
          position: 1,
          actions: ["view", "stream", "download"],
          remainingUses: null,
          downloadDisposition: "attachment",
        },
        {
          accessPlan: ["access-plan", "access:supporter"],
          resource: ["track", "track:first-light"],
        },
      ),
      record(
        "access-grant-template",
        "access-template:supporter",
        {
          key: "supporter",
          label: "Supporter access",
          accessPlanRevision: 1,
          defaultDurationDays: 30,
          state: "active",
          revision: 1,
        },
        {
          accessPlan: ["access-plan", "access:supporter"],
        },
      ),
    ],
    memberships: [
      record("membership-plan", "membership:supporter", {
        slug: "supporter",
        state: "active",
        currentRevision: 1,
      }),
      record(
        "membership-plan-revision",
        "membership:supporter:r1",
        {
          revision: 1,
          name: "Supporter",
          description: "A fictional membership.",
          benefits: ["Protected downloads"],
          downloadCredits: 1,
          licenseCredits: 0,
          durationDays: 30,
        },
        {
          membershipPlan: ["membership-plan", "membership:supporter"],
          accessPlan: ["access-plan", "access:supporter"],
        },
      ),
      record(
        "membership-credit-rule",
        "membership-credit:supporter-download",
        {
          key: "supporter-download",
          creditKind: "download",
          subjectKind: "membership",
          amount: 1,
          cadence: "once",
          state: "active",
          revision: 1,
        },
        {
          membershipPlan: ["membership-plan", "membership:supporter"],
          membershipPlanRevision: [
            "membership-plan-revision",
            "membership:supporter:r1",
          ],
        },
      ),
      record(
        "membership-credit-rule",
        "membership-credit:supporter-monthly-download",
        {
          key: "supporter-monthly-download",
          creditKind: "download",
          subjectKind: "subscription",
          amount: 1,
          cadence: "month",
          state: "active",
          revision: 1,
        },
        {
          subscriptionPlan: [
            "subscription-plan",
            "subscription:supporter-monthly",
          ],
        },
      ),
    ],
    subscriptions: [
      record(
        "subscription-plan",
        "subscription:supporter-monthly",
        {
          slug: "supporter-monthly",
          name: "Supporter monthly",
          description: "A fictional recurring definition.",
          billingInterval: "month",
          intervalCount: 1,
          state: "active",
          revision: 1,
        },
        {
          membershipPlan: ["membership-plan", "membership:supporter"],
          membershipPlanRevision: [
            "membership-plan-revision",
            "membership:supporter:r1",
          ],
        },
      ),
    ],
    commerce: [
      record(
        "commerce-product",
        "commerce:license:first-light",
        {
          slug: "license-first-light",
          name: "First Light license",
          description: "A provider-neutral simulated price definition.",
          productType: "license",
          creditKind: null,
          creditQuantity: null,
          state: "active",
          revision: 1,
        },
        { resource: ["track", "track:first-light"] },
      ),
      record(
        "commerce-price-definition",
        "commerce:license:first-light:price",
        {
          amountMinor: 2500,
          currency: "USD",
          billingInterval: "one_time",
          intervalCount: 1,
          active: true,
          revision: 1,
          bindingState: "pending",
        },
        {
          commerceProduct: ["commerce-product", "commerce:license:first-light"],
        },
      ),
      record(
        "commerce-binding-intent",
        "commerce-intent:supporter-monthly",
        {
          key: "supporter-monthly",
          intentKind: "subscription",
          name: "Supporter monthly",
          description: "A provider-neutral Test Mode binding intent.",
          amountMinor: 900,
          currency: "USD",
          billingInterval: "month",
          intervalCount: 1,
          bindingState: "pending",
          revision: 1,
        },
        {
          subscriptionPlan: [
            "subscription-plan",
            "subscription:supporter-monthly",
          ],
        },
      ),
    ],
    licensing: [
      record("license-terms", "license-terms:standard", {
        slug: "standard",
        state: "active",
        currentVersion: 1,
      }),
      record(
        "license-terms-version",
        "license-terms:standard:v1",
        {
          version: 1,
          name: "Standard",
          title: "Standard license",
          introduction: "Fictional terms for verification.",
          generalTerms: "Use is governed by the selected option.",
          disclaimer: "Artist review is required.",
        },
        { licenseTerms: ["license-terms", "license-terms:standard"] },
      ),
      record(
        "license-option",
        "license-option:standard:web",
        {
          optionKey: "web",
          label: "Web use",
          description: "One fictional web project.",
          usageCategory: "web",
          allowedMedia: ["website"],
          audienceLabel: null,
          maxAudience: null,
          distributionLabel: null,
          maxCopies: null,
          termMonths: 12,
          territory: "Worldwide",
          attributionRequired: true,
          attributionText: "Music by Fictional Artist",
          exclusive: false,
          requiresApproval: false,
          licenseCreditCost: 1,
          includesTrackDownload: true,
          position: 1,
        },
        {
          licenseTermsVersion: [
            "license-terms-version",
            "license-terms:standard:v1",
          ],
        },
      ),
      record(
        "license-offer",
        "license-offer:first-light:web",
        { slug: "first-light-web", state: "active", revision: 1 },
        {
          track: ["track", "track:first-light"],
          trackRevision: ["track-revision", "track:first-light:r1"],
          licenseTermsVersion: [
            "license-terms-version",
            "license-terms:standard:v1",
          ],
          licenseOption: ["license-option", "license-option:standard:web"],
          commerceProduct: ["commerce-product", "commerce:license:first-light"],
          priceDefinition: [
            "commerce-price-definition",
            "commerce:license:first-light:price",
          ],
        },
      ),
    ],
    courses: [
      record("course", "course:listening", publication("listening"), {
        draftRevision: ["course-revision", "course:listening:r1"],
        publishedRevision: ["course-revision", "course:listening:r1"],
      }),
      record(
        "course-revision",
        "course:listening:r1",
        {
          revision: 1,
          title: "Listening",
          description: "A fictional Course.",
          accessMode: "protected",
          estimatedMinutes: 20,
        },
        {
          course: ["course", "course:listening"],
          accessPlan: ["access-plan", "access:supporter"],
        },
      ),
      record(
        "course-section",
        "course:listening:r1:section:intro",
        {
          key: "intro",
          position: 1,
          title: "Introduction",
          description: "Begin here.",
        },
        { courseRevision: ["course-revision", "course:listening:r1"] },
      ),
      record(
        "lesson",
        "lesson:listening:intro",
        {
          key: "intro",
          slug: "intro",
          position: 1,
          title: "Listen",
          summary: "A short listening prompt.",
          accessMode: "inherit",
          estimatedMinutes: 5,
        },
        {
          courseRevision: ["course-revision", "course:listening:r1"],
          courseSection: [
            "course-section",
            "course:listening:r1:section:intro",
          ],
        },
      ),
      record(
        "lesson-item",
        "lesson:listening:intro:item:prompt",
        {
          key: "prompt",
          position: 1,
          itemType: "prompt",
          bodyText: null,
          promptText: "Listen for one changing texture.",
          caption: null,
          altText: null,
          transcriptText: null,
        },
        { lesson: ["lesson", "lesson:listening:intro"] },
      ),
    ],
    video: [
      record("video", "video:studio", publication("studio"), {
        draftRevision: ["video-revision", "video:studio:r1"],
        publishedRevision: ["video-revision", "video:studio:r1"],
      }),
      record(
        "video-revision",
        "video:studio:r1",
        {
          revision: 1,
          title: "Studio",
          summary: "A fictional artist-hosted video.",
          artistContext: "Recorded for this installation.",
          credits: ["Fictional Artist"],
          deliveryKind: "artist_hosted",
          bindingState: "pending",
        },
        {
          video: ["video", "video:studio"],
          hostedDerivative: ["media-derivative", "media:first-light:stream"],
        },
      ),
      record(
        "video-transcript",
        "video:studio:r1:transcript:en",
        {
          language: "en",
          transcriptText: "Fictional transcript.",
          revision: 1,
        },
        { videoRevision: ["video-revision", "video:studio:r1"] },
      ),
    ],
    updates: [
      record("editorial-post", "post:welcome", {
        slug: "welcome",
        title: "Welcome",
        excerpt: "A fictional editorial post.",
        bodyText:
          '[{"text":"Welcome to this fictional installation.","type":"paragraph"}]',
        state: "published",
        publishedAt,
        revision: 1,
      }),
      record(
        "update",
        "update:first-light",
        {
          slug: "first-light",
          title: "First Light",
          summary: "A fictional release update.",
          bodyText:
            '[{"text":"The fictional track is available.","type":"paragraph"}]',
          audience: "public",
          state: "published",
          publishedAt,
          revision: 1,
        },
        { resource: ["track", "track:first-light"] },
      ),
    ],
    contact: [
      record("contact-form", "contact:main", {
        key: "main",
        title: "Contact",
        description: "Contact the fictional artist.",
        bookingInformation: "Booking information is reviewed by the artist.",
        publicContactDetails: "Use this form.",
        categories: ["booking", "general"],
        state: "active",
        currentConsentVersion: 1,
        deliveryAdapter: "stored_only",
        revision: 1,
      }),
      record(
        "contact-consent-version",
        "contact:main:consent:v1",
        {
          version: 1,
          consentText: "I agree to send this message.",
          effectiveAt: publishedAt,
        },
        { contactForm: ["contact-form", "contact:main"] },
      ),
    ],
    telemetry: [
      record("telemetry-settings", "telemetry", {
        collectionMode: "consent_required",
        retentionDays: 30,
        meaningfulListenSeconds: 10,
        revision: 1,
      }),
    ],
    legal: [
      record(
        "legal-document",
        "privacy",
        {
          documentKind: "privacy",
          title: "Privacy Policy",
          currentVersion: 1,
          revision: 1,
          publishedAt,
        },
        {
          draftVersion: ["legal-document-version", "legal:privacy:v1"],
          approvedVersion: ["legal-document-version", "legal:privacy:v1"],
          publishedVersion: ["legal-document-version", "legal:privacy:v1"],
        },
      ),
      record(
        "legal-document-version",
        "legal:privacy:v1",
        {
          documentKind: "privacy",
          version: 1,
          title: "Privacy Policy",
          introduction: "A fictional legal starter.",
          bodyText: "Artist review is required before publication.",
          approved: true,
          approvedAt: publishedAt,
        },
        { legalDocument: ["legal-document", "privacy"] },
      ),
    ],
    media: [
      record("media-object", "media:first-light", {
        kind: "audio",
        visibility: "protected",
        contentType: "audio/flac",
        byteLength: 123456,
        sourceVersion: 1,
        status: "ready",
        approvalState: "approved",
        contentSha256:
          "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        durationMs: 180000,
        channels: 2,
        sampleRate: 48000,
        revision: 1,
      }),
      record(
        "media-derivative",
        "media:first-light:stream",
        {
          kind: "streaming",
          processingProfile: "audio-stream-v1",
          processingVersion: "1",
          status: "ready",
          approvalState: "approved",
          contentType: "audio/mpeg",
          format: "mp3",
          bitrateKbps: 256,
          durationMs: 180000,
          channels: 2,
          sampleRate: 48000,
          byteLength: 65432,
          contentSha256:
            "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          revision: 1,
        },
        { sourceMedia: ["media-object", "media:first-light"] },
      ),
    ],
  };
}

async function buildArchive(snapshot = fictionalSnapshot()) {
  return createArtistExportArchive(snapshot, {
    applicationSchemaVersion: 15,
    createdAt: "2026-07-19T06:00:00Z",
  });
}

test("declares every customer-independent artist installation document and entity", () => {
  assert.deepEqual(PORTABLE_DOCUMENT_NAMES, [
    "artist",
    "modules",
    "navigation",
    "pages",
    "sections",
    "catalog",
    "access",
    "memberships",
    "subscriptions",
    "commerce",
    "licensing",
    "courses",
    "video",
    "updates",
    "contact",
    "telemetry",
    "legal",
    "media",
  ]);
  for (const entity of [
    "artist-config",
    "access-grant-template",
    "membership-credit-rule",
    "commerce-binding-intent",
    "commerce-price-definition",
    "license-offer",
    "course-revision",
    "video-revision",
    "telemetry-settings",
    "legal-document-version",
    "media-derivative",
  ]) {
    assert.ok(PORTABLE_ENTITY_KINDS.includes(entity));
  }
});

test("creates a canonical checksum manifest and order-independent semantic fingerprint", async () => {
  const snapshot = fictionalSnapshot();
  const archive = await buildArchive(snapshot);
  const verified = await verifyArtistExportArchive(archive);

  assert.equal(
    verified.archive.files.length,
    PORTABLE_DOCUMENT_NAMES.length + 1,
  );
  assert.equal(
    verified.archive.manifest.entries.length,
    verified.archive.files.length,
  );
  assert.match(verified.semanticFingerprint, /^[a-f0-9]{64}$/);
  assert.match(verified.archiveSha256, /^[a-f0-9]{64}$/);

  const reordered = Object.fromEntries(
    PORTABLE_DOCUMENT_NAMES.map((document) => [
      document,
      [...snapshot[document]].reverse().map((item) => ({
        ...item,
        fields: [...item.fields].reverse(),
        relations: [...item.relations].reverse(),
      })),
    ]),
  );
  const second = await createArtistExportArchive(reordered, {
    applicationSchemaVersion: 15,
    createdAt: "2026-07-19T07:00:00Z",
  });
  assert.equal(
    second.manifest.semanticFingerprint,
    archive.manifest.semanticFingerprint,
  );
});

test("rehearses the verified export twice in disposable in-memory SQLite without duplicates", async () => {
  const report = await rehearseArtistExportRestoreInMemory(
    await buildArchive(),
  );
  assert.equal(report.semanticFingerprint, report.restoredSemanticFingerprint);
  assert.equal(report.firstPass.inserted, report.recordCount);
  assert.equal(report.firstPass.reused, 0);
  assert.equal(report.secondPass.inserted, 0);
  assert.equal(report.secondPass.reused, report.recordCount);
  assert.equal(report.duplicateCount, 0);
  assert.equal(report.commerceBindingState, "pending");
  assert.equal(report.externalVideoBindingState, "pending");
  assert.equal(report.applicationSchemaRestored, true);
  assert.equal(report.migrationCount, 34);
  assert.equal(report.foreignKeyViolationCount, 0);
  assert.equal(report.sourceObjectKeysRestored, 0);
  assert.equal(report.mediaBytesRestored, 0);
});

test("rejects a changed portable identity without inserting another definition", async (t) => {
  const memory = await createMigratedApplicationDatabaseInMemory();
  t.after(() => memory.database.close());
  const original = fictionalSnapshot();
  await restoreArtistInstallationSnapshotPass(memory.database, original, 1, {
    replaceSeedDefinitions: true,
  });
  const before = await createSemanticFingerprint(
    await projectApplicationSnapshot(memory.database),
  );

  const changed = structuredClone(original);
  changed.artist[0].fields.find(({ name }) => name === "headline").value =
    "A changed artist definition.";
  changed.modules.push(
    record("module", "video", {
      key: "video",
      active: true,
      revision: 1,
    }),
  );

  await assert.rejects(
    restoreArtistInstallationSnapshotPass(memory.database, changed, 2),
    (error) =>
      error?.code === "PORTABILITY_RESTORE_CONFLICT" &&
      error?.location === "$.restore.artist-config:artist-config",
  );
  assert.equal(
    memory.database
      .prepare(
        "SELECT COUNT(*) AS count FROM artist_modules WHERE module_key = 'video'",
      )
      .get().count,
    0,
  );
  assert.equal(
    await createSemanticFingerprint(
      await projectApplicationSnapshot(memory.database),
    ),
    before,
  );
});

test("rolls back the seed replacement when a valid portable relation breaks an application D1 composite owner constraint", async (t) => {
  const memory = await createMigratedApplicationDatabaseInMemory();
  t.after(() => memory.database.close());
  const before = Object.fromEntries(
    DEFINITION_TABLES.map((table) => [
      table,
      memory.database.prepare(`SELECT COUNT(*) AS count FROM "${table}"`).get()
        .count,
    ]),
  );

  const broken = fictionalSnapshot();
  const sourceTrack = broken.catalog.find(({ entity }) => entity === "track");
  const sourceRevision = broken.catalog.find(
    ({ entity }) => entity === "track-revision",
  );
  const otherTrack = structuredClone(sourceTrack);
  otherTrack.id = "track:other";
  otherTrack.fields.find(({ name }) => name === "slug").value = "other";
  otherTrack.relations.find(({ name }) => name === "draftRevision").targetId =
    "track:other:r1";
  otherTrack.relations.find(
    ({ name }) => name === "publishedRevision",
  ).targetId = "track:other:r1";
  const otherRevision = structuredClone(sourceRevision);
  otherRevision.id = "track:other:r1";
  otherRevision.fields.find(({ name }) => name === "title").value =
    "Other track";
  otherRevision.relations.find(({ name }) => name === "track").targetId =
    "track:other";
  broken.catalog.push(otherTrack, otherRevision);
  broken.catalog
    .find(({ entity }) => entity === "release-track")
    .relations.find(({ name }) => name === "trackRevision").targetId =
    "track:other:r1";

  await assert.rejects(
    restoreArtistInstallationSnapshotPass(memory.database, broken, 1, {
      replaceSeedDefinitions: true,
    }),
    (error) =>
      error?.code === "PORTABILITY_RESTORE_CONFLICT" &&
      error?.location === "$.restore.relations",
  );
  const after = Object.fromEntries(
    DEFINITION_TABLES.map((table) => [
      table,
      memory.database.prepare(`SELECT COUNT(*) AS count FROM "${table}"`).get()
        .count,
    ]),
  );
  assert.deepEqual(after, before);
  assert.deepEqual(
    memory.database.prepare("PRAGMA foreign_key_check").all(),
    [],
  );
});

test("rejects missing, extra, traversal, symlink, and corrupt archive entries", async () => {
  const archive = await buildArchive();

  const missing = structuredClone(archive);
  missing.files.pop();
  await assert.rejects(() => verifyArtistExportArchive(missing), {
    code: "PORTABILITY_ENTRY_SET_INVALID",
  });

  const extra = structuredClone(archive);
  extra.files.push({
    path: "definitions/extra.json",
    kind: "file",
    mediaType: "application/json",
    text: "{}",
  });
  extra.manifest.entries.push({
    path: "definitions/extra.json",
    mediaType: "application/json",
    byteLength: 2,
    sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  });
  await assert.rejects(() => verifyArtistExportArchive(extra), {
    code: "PORTABILITY_ENTRY_SET_INVALID",
  });

  const traversal = structuredClone(archive);
  traversal.files[0].path = "../artist.json";
  await assert.rejects(() => verifyArtistExportArchive(traversal), {
    code: "PORTABILITY_ENTRY_PATH_INVALID",
  });

  const symlink = structuredClone(archive);
  symlink.files[0].kind = "symlink";
  await assert.rejects(() => verifyArtistExportArchive(symlink), {
    code: "PORTABILITY_ENTRY_KIND_INVALID",
  });

  const reorderedManifest = structuredClone(archive);
  reorderedManifest.manifest.entries.reverse();
  await assert.rejects(() => verifyArtistExportArchive(reorderedManifest), {
    code: "PORTABILITY_ENTRY_SET_INVALID",
  });

  const corrupt = structuredClone(archive);
  corrupt.files[0].text += " ";
  await assert.rejects(() => verifyArtistExportArchive(corrupt), {
    code: "PORTABILITY_CHECKSUM_INVALID",
  });
});

test("rejects customer records, provider identifiers, card data, object keys, and unknown fields", async () => {
  const customerState = fictionalSnapshot();
  customerState.catalog[0].entity = "order";
  await assert.rejects(() => buildArchive(customerState), {
    code: "PORTABILITY_PROHIBITED_DATA",
  });

  const provider = fictionalSnapshot();
  provider.commerce[1].fields.push({
    name: "stripePriceId",
    value: "price_1234567890",
  });
  await assert.rejects(() => buildArchive(provider), {
    code: "PORTABILITY_PROHIBITED_DATA",
  });

  const card = fictionalSnapshot();
  card.artist[0].fields.find(({ name }) => name === "headline").value =
    "Test number 4242 4242 4242 4242";
  await assert.rejects(() => buildArchive(card), {
    code: "PORTABILITY_PROHIBITED_DATA",
  });

  const objectKey = fictionalSnapshot();
  objectKey.media[0].fields.find(({ name }) => name === "contentType").value =
    "originals/private-source.aif";
  await assert.rejects(() => buildArchive(objectKey), {
    code: "PORTABILITY_PROHIBITED_DATA",
  });

  const machinePath = fictionalSnapshot();
  machinePath.artist[0].fields.find(
    ({ name }) => name === "introduction",
  ).value = "/Users/example/private/music.aif";
  await assert.rejects(() => buildArchive(machinePath), {
    code: "PORTABILITY_PROHIBITED_DATA",
  });

  const credential = fictionalSnapshot();
  credential.artist[0].fields.find(({ name }) => name === "headline").value =
    "sk_live_1234567890abcdef";
  await assert.rejects(() => buildArchive(credential), {
    code: "PORTABILITY_PROHIBITED_DATA",
  });

  const unknown = fictionalSnapshot();
  unknown.artist[0].unrecognized = true;
  await assert.rejects(() => buildArchive(unknown), {
    code: "PORTABILITY_SCHEMA_INVALID",
  });
});

test("stdin CLI verifies and rehearses without temporary files or external state", async () => {
  const bytes = serializeArtistExportArchive(await buildArchive());
  for (const command of ["verify-stdin", "rehearse-stdin"]) {
    const result = spawnSync(
      process.execPath,
      ["scripts/aop-portability.mjs", command],
      {
        cwd: process.cwd(),
        input: Buffer.from(bytes),
        encoding: "utf8",
      },
    );
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.status, "passed");
  }
});
