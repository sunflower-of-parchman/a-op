import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";

import { createInMemoryD1, scalar } from "./helpers/in-memory-d1.mjs";

register(
  new URL("./helpers/typescript-alias-loader.mjs", import.meta.url),
  import.meta.url,
);

const { applySetupOperationPlan } = await import("../db/setup-apply.ts");
const { compileSetupOperationPlan, createProposalArtifact } =
  await import("../lib/setup/index.ts");

const OWNER = "user_setup_apply_owner";
const SOURCE_FINGERPRINT = `sha256:${"7".repeat(64)}`;

function seedOwner(database) {
  database.exec(`
    INSERT INTO users (id, email, normalized_email, status)
    VALUES ('${OWNER}', 'setup-apply-owner@example.invalid',
            'setup-apply-owner@example.invalid', 'active');
    INSERT INTO profiles (user_id, display_name)
    VALUES ('${OWNER}', 'Fictional setup apply owner');
    INSERT INTO role_assignments
      (id, user_id, role_key, assigned_by_user_id)
    VALUES ('role_setup_apply_owner', '${OWNER}', 'owner', '${OWNER}');
  `);
}

function seedApprovedMediaSource(
  database,
  { id, mediaKey, kind, contentType, durationMs, visibility = "protected" },
) {
  const sha256 = `sha256:${"a".repeat(64)}`;
  database
    .prepare(
      `INSERT INTO media_objects
        (id, object_key, kind, visibility, owner_user_id, content_type,
         byte_length, source_version, status, approval_state, content_sha256,
         duration_ms, revision, approved_by_user_id, approved_at)
       VALUES (?, ?, ?, ?, ?, ?, 4096, 1, 'ready', 'approved', ?, ?, 1, ?,
               '2026-07-19T11:30:00.000Z')`,
    )
    .run(
      id,
      `originals/${id}`,
      kind,
      visibility,
      OWNER,
      contentType,
      sha256,
      durationMs,
      OWNER,
    );
  database
    .prepare(
      `INSERT INTO audit_events
        (id, actor_user_id, action, subject_type, subject_id,
         idempotency_key, details_json, result_json)
       VALUES (?, ?, 'media.publication.source', 'media-source', ?, ?, ?, ?)`,
    )
    .run(
      `audit_${id}`,
      OWNER,
      id,
      `publication-${id}`,
      JSON.stringify({ mediaKey, mediaSha256: sha256, visibility }),
      JSON.stringify({
        mediaId: id,
        role: "source",
        status: "ready",
        approvalState: "approved",
        revision: 1,
        mediaSha256: sha256,
      }),
    );
  return { id, mediaKey, sha256, durationMs, visibility };
}

function seedApprovedMediaDerivative(
  database,
  source,
  { id, kind, contentType, durationMs = null, profile = id },
) {
  const sha256 = `sha256:${"b".repeat(64)}`;
  database
    .prepare(
      `INSERT INTO media_derivatives
        (id, source_media_id, kind, processing_profile, processing_version,
         object_key, status, approval_state, content_type, format,
         duration_ms, byte_length, content_sha256, revision,
         approved_by_user_id, approved_at)
       VALUES (?, ?, ?, ?, '1', ?, 'ready', 'approved', ?, 'test', ?, 2048,
               ?, 1, ?, '2026-07-19T11:35:00.000Z')`,
    )
    .run(
      id,
      source.id,
      kind,
      profile,
      `derivatives/${id}`,
      contentType,
      durationMs,
      sha256,
      OWNER,
    );
  database
    .prepare(
      `INSERT INTO audit_events
        (id, actor_user_id, action, subject_type, subject_id,
         idempotency_key, details_json, result_json)
       VALUES (?, ?, 'media.publication.derivative', 'media-derivative', ?, ?, ?, ?)`,
    )
    .run(
      `audit_${id}`,
      OWNER,
      id,
      `publication-${id}`,
      JSON.stringify({
        mediaKey: source.mediaKey,
        mediaSha256: sha256,
        visibility: source.visibility,
      }),
      JSON.stringify({
        mediaId: id,
        role: "derivative",
        status: "ready",
        approvalState: "approved",
        revision: 1,
        mediaSha256: sha256,
      }),
    );
  return { id, sourceMediaId: source.id, kind, contentType, durationMs };
}

function proposal(overrides = {}) {
  const value = {
    schemaVersion: "aop.setup-proposal.v1",
    proposalId: "artist-setup-apply",
    createdAt: "2026-07-19T12:00:00Z",
    sourceStateFingerprint: SOURCE_FINGERPRINT,
    commerce: {
      adapter: "stripe-test-simulation",
      stripeEnvironment: "test",
      livemode: false,
      journey: "inactive",
      statement: "No real payment will be accepted.",
    },
    topics: {
      artist: {
        artistKey: "artist",
        publicName: "Fictional Artist",
        shortName: "Fictional",
        headline: "Music in the artist's own words.",
        description: "A fictional catalog prepared for setup verification.",
        biography: "The artist retains this fictional biography.",
        publicContactEmail: "artist@example.invalid",
        publicContactUrl: "https://artist.example.invalid",
      },
      capabilitiesNavigation: {
        activeModules: [],
        primaryNavigation: [
          {
            navigationKey: "music",
            label: "Music",
            href: "/music",
            order: 10,
            module: null,
          },
        ],
        footerNavigation: [],
      },
      rightsMedia: { rightsStatement: "", media: [] },
      catalogReleases: { tracks: [], releases: [], collections: [] },
      streamingDownloads: { tracks: [] },
      customerAccess: {
        customerLibraries: false,
        protectedDelivery: true,
        accessPlans: [],
        grantTemplates: [],
      },
      membershipsSubscriptions: {
        membershipPlans: [],
        subscriptionPlans: [],
      },
      credits: { downloadCreditRules: [], licenseCreditRules: [] },
      licensing: { terms: [], options: [] },
      coursesVideo: { courses: [], videos: [] },
      contactConsent: {
        enabled: false,
        publicEmail: null,
        invitation: "",
        consentText: "",
        categories: [],
      },
      telemetryRetention: {
        enabled: false,
        collectionMode: "disabled",
        retentionDays: 30,
        meaningfulListenSeconds: 10,
        firstPartyOnly: true,
      },
      privacyTerms: {
        privacy: {
          title: "Privacy Policy",
          body: "Fictional privacy language awaiting artist review.",
          action: "save-draft",
        },
        terms: {
          title: "Terms and Conditions",
          body: "Fictional terms awaiting artist review.",
          action: "save-draft",
        },
        artistReviewRequired: true,
      },
      accountsPublication: {
        ownerStrategy: "authenticated-requester",
        ownerAcknowledgement: "artist-authorized",
        editorAccountAliases: [],
        publication: {
          artist: "draft",
          navigation: "draft",
          catalog: "draft",
          content: "draft",
          media: "prepare-only",
        },
        externalPublication: "approval-required",
      },
    },
    mediaActions: [],
    sourceChanges: [],
    externalActions: [],
  };
  return Object.assign(value, overrides);
}

async function approvedPlan(value, extraScopes = []) {
  const artifact = await createProposalArtifact(value);
  const approval = {
    schemaVersion: "aop.setup-approval.v1",
    approvalId: "artist-setup-apply-approval",
    proposalId: artifact.proposal.proposalId,
    proposalHash: artifact.proposalHash,
    sourceStateFingerprint: artifact.proposal.sourceStateFingerprint,
    approvedAt: "2026-07-19T12:05:00Z",
    approvedBy: { authority: "artist-owner", accountAlias: "owner" },
    approvedScopes: [
      "configuration",
      "account-authority",
      "legal-drafts",
      ...extraScopes,
    ],
    statement: "I approve this exact proposal hash.",
  };
  return compileSetupOperationPlan({
    proposal: value,
    approval,
    currentSourceStateFingerprint: SOURCE_FINGERPRINT,
  });
}

function context(requestId) {
  return {
    actorUserId: OWNER,
    idempotencyKey: `aggregate-${requestId}`,
    requestId,
  };
}

test("the fourteen-topic D1 plan applies safe receipts and replays without duplicates", async (t) => {
  const memory = await createInMemoryD1();
  t.after(() => memory.close());
  seedOwner(memory.database);
  const value = proposal();
  const plan = await approvedPlan(value);

  const legalBefore = scalar(
    memory.database,
    "SELECT COUNT(*) FROM legal_document_versions",
  );
  const first = await applySetupOperationPlan(
    memory.binding,
    value,
    plan,
    context("setup-apply-first"),
  );
  assert.equal(first.schemaVersion, "aop.setup-apply-receipt.v1");
  assert.equal(first.operationCount, 14);
  assert.equal(first.operations.length, 14);
  assert.deepEqual(
    new Set(first.operations.map(({ topic }) => topic)),
    new Set([
      "artist",
      "capabilities-navigation",
      "rights-media",
      "catalog-releases",
      "streaming-downloads",
      "customer-access",
      "memberships-subscriptions",
      "credits",
      "licensing",
      "courses-video",
      "contact-consent",
      "telemetry-retention",
      "privacy-terms",
      "accounts-publication",
    ]),
  );
  assert.equal(first.stripeEnvironment, "test");
  assert.equal(first.livemode, false);
  assert.equal(first.statement, "No real payment will be accepted.");
  assert.equal(
    scalar(
      memory.database,
      "SELECT version FROM artist_config WHERE id = 'artist'",
    ),
    2,
  );
  assert.equal(
    scalar(memory.database, "SELECT COUNT(*) FROM legal_document_versions"),
    legalBefore + 2,
  );
  assert.equal(
    scalar(
      memory.database,
      "SELECT COUNT(*) FROM audit_events WHERE action = 'setup.operation.apply'",
    ),
    14,
  );
  assert.doesNotMatch(
    JSON.stringify(first),
    /(?:sk_|pk_|whsec_|cs_(?:test|live)|4242[ -]?4242)/i,
  );

  const auditBeforeReplay = scalar(
    memory.database,
    "SELECT COUNT(*) FROM audit_events",
  );
  const mediaJobsBeforeReplay = scalar(
    memory.database,
    "SELECT COUNT(*) FROM media_jobs",
  );
  const replay = await applySetupOperationPlan(
    memory.binding,
    value,
    plan,
    context("setup-apply-replay"),
  );
  assert.equal(replay.replayedCount, 14);
  assert.ok(replay.operations.every(({ replayed }) => replayed));
  assert.equal(
    scalar(memory.database, "SELECT COUNT(*) FROM audit_events"),
    auditBeforeReplay,
  );
  assert.equal(
    scalar(memory.database, "SELECT COUNT(*) FROM media_jobs"),
    mediaJobsBeforeReplay,
  );
  assert.deepEqual(
    memory.database.prepare("PRAGMA foreign_key_check").all(),
    [],
  );
});

test("under-specified editor aliases fail proposal validation before preview", async (t) => {
  const memory = await createInMemoryD1();
  t.after(() => memory.close());
  seedOwner(memory.database);
  const value = proposal();
  value.topics.accountsPublication.editorAccountAliases = ["fictional-editor"];
  const artistVersion = scalar(
    memory.database,
    "SELECT version FROM artist_config WHERE id = 'artist'",
  );

  await assert.rejects(approvedPlan(value), (error) => {
    assert.equal(error?.code, "SETUP_INPUT_INVALID");
    assert.ok(error?.issues?.some(({ code }) => code === "object-required"));
    return true;
  });
  assert.equal(
    scalar(
      memory.database,
      "SELECT version FROM artist_config WHERE id = 'artist'",
    ),
    artistVersion,
  );
  assert.equal(
    scalar(
      memory.database,
      "SELECT COUNT(*) FROM audit_events WHERE action LIKE 'setup.%'",
    ),
    0,
  );
});

test("approved media intent records hash-bound evidence without publishing bytes", async (t) => {
  const memory = await createInMemoryD1();
  t.after(() => memory.close());
  seedOwner(memory.database);
  const value = proposal();
  value.topics.rightsMedia = {
    rightsStatement: "The fictional artist confirms this source.",
    media: [
      {
        mediaKey: "fictional-track-audio",
        sourceAlias: "artist-approved-audio",
        kind: "audio",
        rights: "confirmed",
        intendedUse: "protected",
        attribution: null,
      },
    ],
  };
  value.topics.accountsPublication.publication.media = "publish-approved";
  value.mediaActions = [
    {
      actionId: "publish-fictional-track-audio",
      mediaKey: "fictional-track-audio",
      sourceAlias: "artist-approved-audio",
      operation: "publish-approved",
      derivatives: ["stream"],
      requiresArtistApproval: true,
    },
  ];
  const fullPlan = await approvedPlan(value, [
    "media-preparation",
    "media-publication",
  ]);
  const d1Plan = {
    ...fullPlan,
    operations: fullPlan.operations.filter(
      ({ mutationBoundary }) => mutationBoundary === "d1",
    ),
  };

  const receipt = await applySetupOperationPlan(
    memory.binding,
    value,
    d1Plan,
    context("setup-media-intent"),
  );
  const rights = receipt.operations.find(
    ({ topic }) => topic === "rights-media",
  );
  assert.deepEqual(
    { outcome: rights?.outcome, resourceCount: rights?.resourceCount },
    { outcome: "applied", resourceCount: 1 },
  );
  assert.equal(
    scalar(memory.database, "SELECT COUNT(*) FROM media_objects"),
    0,
  );
  assert.equal(scalar(memory.database, "SELECT COUNT(*) FROM media_jobs"), 0);
  const evidence = memory.database
    .prepare(
      "SELECT details_json, result_json FROM audit_events WHERE action = 'setup.operation.apply' AND subject_type = 'setup-operation'",
    )
    .all();
  assert.doesNotMatch(
    JSON.stringify(evidence),
    /artist-approved-audio|fictional artist confirms/i,
  );
});

test("a complete D1-only plan slice is accepted from a larger approved plan", async (t) => {
  const memory = await createInMemoryD1();
  t.after(() => memory.close());
  seedOwner(memory.database);
  const value = proposal({
    sourceChanges: [
      {
        changeId: "artist-navigation-language",
        scope: "nomenclature",
        summary: "Use the artist's approved navigation language.",
        requestedByArtist: true,
      },
    ],
  });
  const fullPlan = await approvedPlan(value, ["source-changes"]);
  assert.ok(
    fullPlan.operations.some(
      ({ mutationBoundary }) => mutationBoundary === "git",
    ),
  );
  const d1Plan = {
    ...fullPlan,
    operations: fullPlan.operations.filter(
      ({ mutationBoundary }) => mutationBoundary === "d1",
    ),
  };

  const receipt = await applySetupOperationPlan(
    memory.binding,
    value,
    d1Plan,
    context("setup-d1-slice"),
  );
  assert.equal(receipt.operationCount, 14);
  assert.ok(receipt.operations.every(({ topic }) => topic !== "source"));
  assert.equal(
    scalar(
      memory.database,
      "SELECT COUNT(*) FROM audit_events WHERE action = 'setup.operation.apply'",
    ),
    14,
  );
});

test("approved internal publication publishes the exact artist and navigation drafts", async (t) => {
  const memory = await createInMemoryD1();
  t.after(() => memory.close());
  seedOwner(memory.database);
  const value = proposal();
  value.topics.accountsPublication.publication.artist = "publish";
  value.topics.accountsPublication.publication.navigation = "publish";
  const plan = await approvedPlan(value, ["internal-publication"]);

  const receipt = await applySetupOperationPlan(
    memory.binding,
    value,
    plan,
    context("setup-internal-publication"),
  );
  assert.equal(receipt.operationCount, 15);
  assert.ok(
    receipt.operations.some(
      ({ action, outcome }) =>
        action === "publish-approved-internal-state" && outcome === "applied",
    ),
  );
  assert.equal(
    scalar(
      memory.database,
      `SELECT COUNT(*) FROM artist_config
       WHERE id = 'artist' AND draft_revision_id = published_revision_id`,
    ),
    1,
  );
  assert.equal(
    scalar(
      memory.database,
      `SELECT COUNT(*) FROM navigation_sets
       WHERE id IN ('primary', 'footer')
         AND draft_version = published_version`,
    ),
    2,
  );
});

test("configured catalog, contact, and telemetry topics reach their public and admin records", async (t) => {
  const memory = await createInMemoryD1();
  t.after(() => memory.close());
  seedOwner(memory.database);
  const value = proposal();
  value.topics.capabilitiesNavigation.activeModules = ["contact", "telemetry"];
  value.topics.catalogReleases.tracks = [
    {
      trackKey: "opening-track",
      title: "Opening Track",
      versionLabel: "Fictional version",
      releaseKey: null,
      sequence: 1,
      mediaKey: null,
    },
  ];
  value.topics.streamingDownloads.tracks = [
    {
      trackKey: "opening-track",
      streaming: "disabled",
      download: "disabled",
    },
  ];
  value.topics.contactConsent = {
    enabled: true,
    publicEmail: "contact@example.invalid",
    invitation: "Write to the fictional artist.",
    consentText: "I agree to send this message to the fictional artist.",
    categories: ["general"],
  };
  value.topics.telemetryRetention = {
    enabled: true,
    collectionMode: "consent-required",
    retentionDays: 45,
    meaningfulListenSeconds: 12,
    firstPartyOnly: true,
  };
  const plan = await approvedPlan(value);

  const receipt = await applySetupOperationPlan(
    memory.binding,
    value,
    plan,
    context("setup-functional-topics"),
  );
  assert.equal(receipt.operationCount, 14);
  assert.deepEqual(
    {
      ...memory.database
        .prepare(
          `SELECT draft.title, draft.subtitle, draft.stream_mode, draft.download_mode
         FROM tracks
         JOIN track_revisions AS draft ON draft.id = tracks.draft_revision_id
         WHERE tracks.slug = 'opening-track'`,
        )
        .get(),
    },
    {
      title: "Opening Track",
      subtitle: "Fictional version",
      stream_mode: "unavailable",
      download_mode: "unavailable",
    },
  );
  assert.deepEqual(
    {
      ...memory.database
        .prepare(
          `SELECT state, description, public_contact_details, categories_json
         FROM contact_forms WHERE form_key = 'contact'`,
        )
        .get(),
    },
    {
      state: "active",
      description: "Write to the fictional artist.",
      public_contact_details: "contact@example.invalid",
      categories_json: '["general"]',
    },
  );
  assert.deepEqual(
    {
      ...memory.database
        .prepare(
          `SELECT collection_mode, retention_days, meaningful_listen_seconds
         FROM telemetry_settings WHERE id = 'telemetry'`,
        )
        .get(),
    },
    {
      collection_mode: "consent_required",
      retention_days: 45,
      meaningful_listen_seconds: 12,
    },
  );
  assert.deepEqual(
    memory.database.prepare("PRAGMA foreign_key_check").all(),
    [],
  );
});

test("non-empty access, membership, credit, licensing, and editor definitions persist and replay exactly", async (t) => {
  const memory = await createInMemoryD1();
  t.after(() => memory.close());
  seedOwner(memory.database);
  memory.database.exec(`
    INSERT INTO tracks
      (id, slug, draft_revision_id, published_revision_id,
       publication_state, published_at)
    VALUES
      ('track_setup_complete', 'complete-track',
       'track_revision_setup_complete', 'track_revision_setup_complete',
       'published', '2026-07-19T11:00:00.000Z');
    INSERT INTO track_revisions
      (id, track_id, revision, title, view_mode, stream_mode,
       download_mode, tags_json)
    VALUES
      ('track_revision_setup_complete', 'track_setup_complete', 1,
       'Complete Track', 'protected', 'protected', 'protected', '[]');
  `);

  const value = proposal();
  value.topics.capabilitiesNavigation.activeModules = [
    "downloads",
    "licensing",
    "memberships",
    "subscriptions",
  ];
  value.topics.catalogReleases.tracks = [
    {
      trackKey: "complete-track",
      title: "Complete Track",
      versionLabel: null,
      releaseKey: null,
      sequence: 1,
      mediaKey: null,
    },
  ];
  value.topics.streamingDownloads.tracks = [
    {
      trackKey: "complete-track",
      streaming: "entitled",
      download: "entitled",
    },
  ];
  value.topics.customerAccess = {
    customerLibraries: false,
    protectedDelivery: true,
    accessPlans: [
      {
        accessPlanKey: "supporter-access",
        label: "Supporter access",
        resourceType: "track",
        resourceKeys: ["complete-track"],
        accessMode: "subscription",
      },
    ],
    grantTemplates: [
      {
        grantKey: "supporter-gift",
        label: "Supporter gift access",
        accessPlanKey: "supporter-access",
        defaultDurationDays: 30,
      },
    ],
  };
  value.topics.membershipsSubscriptions = {
    membershipPlans: [
      {
        planKey: "supporter-benefits",
        name: "Supporter benefits",
        description: "Fictional protected music and monthly credits.",
        interval: "one-time",
        displayAmountMinor: 1200,
        currency: "USD",
        accessPlanKeys: ["supporter-access"],
        benefitKeys: ["protected-music"],
        durationDays: null,
      },
    ],
    subscriptionPlans: [
      {
        planKey: "monthly-supporter",
        membershipPlanKey: "supporter-benefits",
        name: "Monthly supporter",
        description: "Fictional monthly supporter subscription.",
        billingInterval: "month",
        displayAmountMinor: 1200,
        currency: "USD",
        accessPlanKeys: ["supporter-access"],
        benefitKeys: ["protected-music"],
      },
    ],
  };
  value.topics.credits = {
    downloadCreditRules: [
      {
        ruleKey: "supporter-download-credit",
        planKey: "supporter-benefits",
        amount: 2,
        cadence: "once",
      },
      {
        ruleKey: "monthly-supporter-download-credit",
        planKey: "monthly-supporter",
        amount: 2,
        cadence: "month",
      },
    ],
    licenseCreditRules: [
      {
        ruleKey: "supporter-license-credit",
        planKey: "supporter-benefits",
        amount: 1,
        cadence: "once",
      },
      {
        ruleKey: "monthly-supporter-license-credit",
        planKey: "monthly-supporter",
        amount: 1,
        cadence: "month",
      },
    ],
  };
  value.topics.licensing = {
    terms: [
      {
        termsKey: "creator-license",
        title: "Creator License",
        body: "Fictional creator-license terms for setup verification.",
        version: 1,
      },
    ],
    options: [
      {
        optionKey: "online-video",
        trackKey: "complete-track",
        label: "Online video",
        termsKey: "creator-license",
        uses: "Use the track in one fictional online video.",
        usageCategory: "online-video",
        allowedMedia: ["online video"],
        audienceLabel: "Online audience",
        maxAudience: 100000,
        distributionLabel: "One channel",
        maxCopies: null,
        termMonths: 12,
        territory: "Worldwide",
        attributionRequired: true,
        attributionText: "Music by Fictional Artist",
        exclusive: false,
        requiresApproval: true,
        licenseCreditCost: 1,
        includesTrackDownload: true,
        displayAmountMinor: 2500,
        currency: "USD",
      },
    ],
  };
  value.topics.accountsPublication.editorAccountAliases = [
    {
      email: "setup-editor@example.invalid",
      displayName: "Fictional catalog editor",
      permissionKey: "catalog.write",
      scopeId: "*",
    },
  ];

  const plan = await approvedPlan(value);
  const first = await applySetupOperationPlan(
    memory.binding,
    value,
    plan,
    context("setup-complete-topics-first"),
  );
  const byTopic = new Map(
    first.operations.map((operation) => [operation.topic, operation]),
  );
  assert.deepEqual(
    {
      access: byTopic.get("customer-access")?.resourceCount,
      memberships: byTopic.get("memberships-subscriptions")?.resourceCount,
      credits: byTopic.get("credits")?.resourceCount,
      licensing: byTopic.get("licensing")?.resourceCount,
      editors: byTopic.get("accounts-publication")?.resourceCount,
    },
    { access: 2, memberships: 4, credits: 4, licensing: 3, editors: 1 },
  );
  assert.equal(byTopic.get("customer-access")?.outcome, "applied");
  assert.equal(byTopic.get("memberships-subscriptions")?.outcome, "applied");
  assert.equal(byTopic.get("credits")?.outcome, "applied");
  assert.equal(byTopic.get("licensing")?.outcome, "applied");
  assert.equal(byTopic.get("accounts-publication")?.outcome, "applied");

  assert.deepEqual(
    {
      ...memory.database
        .prepare(
          `SELECT template_key, label, access_plan_revision,
                  default_duration_days, state, revision
           FROM access_grant_templates`,
        )
        .get(),
    },
    {
      template_key: "supporter-gift",
      label: "Supporter gift access",
      access_plan_revision: 1,
      default_duration_days: 30,
      state: "active",
      revision: 1,
    },
  );
  assert.deepEqual(
    memory.database
      .prepare(
        `SELECT intent_key, intent_kind, amount_minor, currency,
                billing_interval, interval_count, binding_state,
                stripe_environment, livemode,
                membership_plan_id IS NOT NULL AS has_membership,
                subscription_plan_id IS NOT NULL AS has_subscription,
                track_id IS NOT NULL AS has_track,
                license_terms_version_id IS NOT NULL AS has_terms,
                license_option_id IS NOT NULL AS has_option,
                commerce_product_id, commerce_price_id
         FROM commerce_binding_intents
         ORDER BY intent_key`,
      )
      .all()
      .map((row) => ({ ...row })),
    [
      {
        intent_key: "license-online-video",
        intent_kind: "license",
        amount_minor: 2500,
        currency: "USD",
        billing_interval: "one_time",
        interval_count: 1,
        binding_state: "pending",
        stripe_environment: "test",
        livemode: 0,
        has_membership: 0,
        has_subscription: 0,
        has_track: 1,
        has_terms: 1,
        has_option: 1,
        commerce_product_id: null,
        commerce_price_id: null,
      },
      {
        intent_key: "membership-supporter-benefits",
        intent_kind: "membership",
        amount_minor: 1200,
        currency: "USD",
        billing_interval: "one_time",
        interval_count: 1,
        binding_state: "pending",
        stripe_environment: "test",
        livemode: 0,
        has_membership: 1,
        has_subscription: 0,
        has_track: 0,
        has_terms: 0,
        has_option: 0,
        commerce_product_id: null,
        commerce_price_id: null,
      },
      {
        intent_key: "subscription-monthly-supporter",
        intent_kind: "subscription",
        amount_minor: 1200,
        currency: "USD",
        billing_interval: "month",
        interval_count: 1,
        binding_state: "pending",
        stripe_environment: "test",
        livemode: 0,
        has_membership: 0,
        has_subscription: 1,
        has_track: 0,
        has_terms: 0,
        has_option: 0,
        commerce_product_id: null,
        commerce_price_id: null,
      },
    ],
  );
  assert.deepEqual(
    {
      ...memory.database
        .prepare(
          `SELECT membership_plans.slug, membership_plans.state,
                  membership_plan_revisions.benefits_json,
                  membership_plan_revisions.download_credits,
                  membership_plan_revisions.license_credits,
                  membership_plan_revisions.duration_days
           FROM membership_plans
           JOIN membership_plan_revisions
             ON membership_plan_revisions.membership_plan_id = membership_plans.id
            AND membership_plan_revisions.revision = membership_plans.current_revision`,
        )
        .get(),
    },
    {
      slug: "supporter-benefits",
      state: "draft",
      benefits_json: '["protected-music"]',
      download_credits: 2,
      license_credits: 1,
      duration_days: null,
    },
  );
  assert.deepEqual(
    {
      ...memory.database
        .prepare(
          `SELECT subscription_plans.slug, subscription_plans.state,
                  subscription_plans.billing_interval,
                  subscription_plans.interval_count,
                  membership_plans.slug AS membership_slug
           FROM subscription_plans
           JOIN membership_plans
             ON membership_plans.id = subscription_plans.membership_plan_id`,
        )
        .get(),
    },
    {
      slug: "monthly-supporter",
      state: "draft",
      billing_interval: "month",
      interval_count: 1,
      membership_slug: "supporter-benefits",
    },
  );
  assert.deepEqual(
    memory.database
      .prepare(
        `SELECT rule_key, credit_kind, amount, cadence, state, revision,
                membership_plan_id IS NOT NULL AS has_membership,
                subscription_plan_id IS NOT NULL AS has_subscription
         FROM membership_credit_rules
         ORDER BY rule_key`,
      )
      .all()
      .map((row) => ({ ...row })),
    [
      {
        rule_key: "monthly-supporter-download-credit",
        credit_kind: "download",
        amount: 2,
        cadence: "month",
        state: "active",
        revision: 1,
        has_membership: 0,
        has_subscription: 1,
      },
      {
        rule_key: "monthly-supporter-license-credit",
        credit_kind: "license",
        amount: 1,
        cadence: "month",
        state: "active",
        revision: 1,
        has_membership: 0,
        has_subscription: 1,
      },
      {
        rule_key: "supporter-download-credit",
        credit_kind: "download",
        amount: 2,
        cadence: "once",
        state: "active",
        revision: 1,
        has_membership: 1,
        has_subscription: 0,
      },
      {
        rule_key: "supporter-license-credit",
        credit_kind: "license",
        amount: 1,
        cadence: "once",
        state: "active",
        revision: 1,
        has_membership: 1,
        has_subscription: 0,
      },
    ],
  );
  assert.deepEqual(
    {
      ...memory.database
        .prepare(
          `SELECT license_terms.slug, license_terms.state,
                  license_terms.current_version, license_options.option_key,
                  license_options.usage_category,
                  license_options.allowed_media_json,
                  license_options.license_credit_cost,
                  license_options.includes_track_download
           FROM license_terms
           JOIN license_terms_versions
             ON license_terms_versions.license_terms_id = license_terms.id
            AND license_terms_versions.version = license_terms.current_version
           JOIN license_options
             ON license_options.license_terms_version_id = license_terms_versions.id`,
        )
        .get(),
    },
    {
      slug: "creator-license",
      state: "draft",
      current_version: 1,
      option_key: "online-video",
      usage_category: "online-video",
      allowed_media_json: '["online video"]',
      license_credit_cost: 1,
      includes_track_download: 1,
    },
  );
  assert.deepEqual(
    {
      ...memory.database
        .prepare(
          `SELECT users.normalized_email, profiles.display_name,
                  editor_permissions.permission_key,
                  editor_permissions.scope_id
           FROM users
           JOIN profiles ON profiles.user_id = users.id
           JOIN role_assignments
             ON role_assignments.user_id = users.id
            AND role_assignments.role_key = 'editor'
            AND role_assignments.revoked_at IS NULL
           JOIN editor_permissions
             ON editor_permissions.user_id = users.id
            AND editor_permissions.revoked_at IS NULL
           WHERE users.normalized_email = 'setup-editor@example.invalid'`,
        )
        .get(),
    },
    {
      normalized_email: "setup-editor@example.invalid",
      display_name: "Fictional catalog editor",
      permission_key: "catalog.write",
      scope_id: "*",
    },
  );
  assert.equal(
    scalar(memory.database, "SELECT COUNT(*) FROM commerce_products"),
    0,
  );
  assert.equal(
    scalar(memory.database, "SELECT COUNT(*) FROM commerce_prices"),
    0,
  );
  assert.equal(
    scalar(memory.database, "SELECT COUNT(*) FROM license_offers"),
    0,
  );
  const pending = memory.database
    .prepare(
      `SELECT details_json FROM audit_events
       WHERE action = 'setup.operation.apply'
         AND subject_id = ?1`,
    )
    .get(byTopic.get("memberships-subscriptions")?.operationId);
  assert.match(pending.details_json, /"stripeTestPriceBinding":"pending"/);
  assert.doesNotMatch(
    JSON.stringify({ first, pending }),
    /(?:sk_|pk_|whsec_|cs_(?:test|live)|4242[ -]?4242)/i,
  );

  const stableCounts = {
    templates: scalar(
      memory.database,
      "SELECT COUNT(*) FROM access_grant_templates",
    ),
    creditRules: scalar(
      memory.database,
      "SELECT COUNT(*) FROM membership_credit_rules",
    ),
    bindingIntents: scalar(
      memory.database,
      "SELECT COUNT(*) FROM commerce_binding_intents",
    ),
    membershipRevisions: scalar(
      memory.database,
      "SELECT COUNT(*) FROM membership_plan_revisions",
    ),
    subscriptions: scalar(
      memory.database,
      "SELECT COUNT(*) FROM subscription_plans",
    ),
    termsVersions: scalar(
      memory.database,
      "SELECT COUNT(*) FROM license_terms_versions",
    ),
    options: scalar(memory.database, "SELECT COUNT(*) FROM license_options"),
    editors: scalar(
      memory.database,
      "SELECT COUNT(*) FROM role_assignments WHERE role_key = 'editor' AND revoked_at IS NULL",
    ),
    audits: scalar(memory.database, "SELECT COUNT(*) FROM audit_events"),
  };
  const replay = await applySetupOperationPlan(
    memory.binding,
    value,
    plan,
    context("setup-complete-topics-replay"),
  );
  assert.equal(replay.replayedCount, 14);
  assert.deepEqual(
    {
      templates: scalar(
        memory.database,
        "SELECT COUNT(*) FROM access_grant_templates",
      ),
      creditRules: scalar(
        memory.database,
        "SELECT COUNT(*) FROM membership_credit_rules",
      ),
      bindingIntents: scalar(
        memory.database,
        "SELECT COUNT(*) FROM commerce_binding_intents",
      ),
      membershipRevisions: scalar(
        memory.database,
        "SELECT COUNT(*) FROM membership_plan_revisions",
      ),
      subscriptions: scalar(
        memory.database,
        "SELECT COUNT(*) FROM subscription_plans",
      ),
      termsVersions: scalar(
        memory.database,
        "SELECT COUNT(*) FROM license_terms_versions",
      ),
      options: scalar(memory.database, "SELECT COUNT(*) FROM license_options"),
      editors: scalar(
        memory.database,
        "SELECT COUNT(*) FROM role_assignments WHERE role_key = 'editor' AND revoked_at IS NULL",
      ),
      audits: scalar(memory.database, "SELECT COUNT(*) FROM audit_events"),
    },
    stableCounts,
  );
  assert.deepEqual(
    memory.database.prepare("PRAGMA foreign_key_check").all(),
    [],
  );
});

test("a follow-up proposal binds audited ready media and publishes playable track, Course, and video state", async (t) => {
  const memory = await createInMemoryD1();
  t.after(() => memory.close());
  seedOwner(memory.database);

  const audio = seedApprovedMediaSource(memory.database, {
    id: "media_source_setup_audio",
    mediaKey: "approved-track-audio",
    kind: "audio",
    contentType: "audio/wav",
    durationMs: 180_000,
  });
  const audioStream = seedApprovedMediaDerivative(memory.database, audio, {
    id: "media_derivative_setup_audio_stream",
    kind: "streaming",
    contentType: "audio/mpeg",
    durationMs: 180_000,
    profile: "audio-streaming-mp3-192",
  });
  const audioDownload = seedApprovedMediaDerivative(memory.database, audio, {
    id: "media_derivative_setup_audio_download",
    kind: "download",
    contentType: "audio/flac",
    durationMs: 180_000,
    profile: "audio-download-flac",
  });
  const video = seedApprovedMediaSource(memory.database, {
    id: "media_source_setup_video",
    mediaKey: "approved-hosted-video",
    kind: "video",
    contentType: "video/mp4",
    durationMs: 90_000,
  });
  const hostedVideo = seedApprovedMediaDerivative(memory.database, video, {
    id: "media_derivative_setup_video_stream",
    kind: "streaming",
    contentType: "video/mp4",
    durationMs: 90_000,
    profile: "video-streaming-mp4-h264-720",
  });
  const videoDownload = seedApprovedMediaDerivative(memory.database, video, {
    id: "media_derivative_setup_video_download",
    kind: "download",
    contentType: "video/mp4",
    durationMs: 90_000,
    profile: "video-download-mp4-h264-1080",
  });
  const poster = seedApprovedMediaDerivative(memory.database, video, {
    id: "media_derivative_setup_video_poster",
    kind: "poster",
    contentType: "image/webp",
    profile: "video-poster-webp-1280",
  });
  const captions = seedApprovedMediaDerivative(memory.database, video, {
    id: "media_derivative_setup_video_captions",
    kind: "transcript",
    contentType: "text/vtt",
    profile: "video-captions-webvtt",
  });
  const image = seedApprovedMediaSource(memory.database, {
    id: "media_source_setup_course_image",
    mediaKey: "approved-course-image",
    kind: "image",
    contentType: "image/png",
    durationMs: null,
  });
  const courseImage = seedApprovedMediaDerivative(memory.database, image, {
    id: "media_derivative_setup_course_image",
    kind: "thumbnail",
    contentType: "image/webp",
    profile: "image-course-webp-1600",
  });
  const document = seedApprovedMediaSource(memory.database, {
    id: "media_source_setup_course_document",
    mediaKey: "approved-course-document",
    kind: "document",
    contentType: "application/pdf",
    durationMs: null,
  });
  const courseDocument = seedApprovedMediaDerivative(
    memory.database,
    document,
    {
      id: "media_derivative_setup_course_document",
      kind: "download",
      contentType: "application/pdf",
      profile: "document-download-pdf-copy",
    },
  );

  const value = proposal();
  value.topics.capabilitiesNavigation.activeModules = [
    "downloads",
    "courses",
    "video",
  ];
  value.topics.rightsMedia = {
    rightsStatement: "The fictional artist confirms these exact media uses.",
    media: [
      {
        mediaKey: audio.mediaKey,
        sourceAlias: "approved-audio-alias",
        kind: "audio",
        rights: "confirmed",
        intendedUse: "protected",
        attribution: null,
      },
      {
        mediaKey: video.mediaKey,
        sourceAlias: "approved-video-alias",
        kind: "video",
        rights: "confirmed",
        intendedUse: "protected",
        attribution: null,
      },
      {
        mediaKey: image.mediaKey,
        sourceAlias: "approved-image-alias",
        kind: "image",
        rights: "confirmed",
        intendedUse: "protected",
        attribution: null,
      },
      {
        mediaKey: document.mediaKey,
        sourceAlias: "approved-document-alias",
        kind: "document",
        rights: "confirmed",
        intendedUse: "protected",
        attribution: null,
      },
    ],
  };
  value.topics.catalogReleases.tracks = [
    {
      trackKey: "published-track",
      title: "Published Track",
      versionLabel: null,
      releaseKey: null,
      sequence: 1,
      mediaKey: audio.mediaKey,
    },
  ];
  value.topics.streamingDownloads.tracks = [
    {
      trackKey: "published-track",
      streaming: "public",
      download: "account",
    },
  ];
  value.topics.coursesVideo = {
    courses: [
      {
        courseKey: "artist-course",
        title: "Artist Course",
        summary: "A fictional Course with approved media.",
        accessPlanKey: null,
        lessons: [
          {
            lessonKey: "listen",
            title: "Listen",
            summary: "Listen and download the approved track.",
            mediaKeys: [audio.mediaKey],
          },
          {
            lessonKey: "watch",
            title: "Watch",
            summary: "Watch and download the approved video.",
            mediaKeys: [video.mediaKey],
          },
          {
            lessonKey: "view-image",
            title: "View image",
            summary: "View the approved Course image.",
            mediaKeys: [image.mediaKey],
          },
          {
            lessonKey: "document",
            title: "Document",
            summary: "Download the approved Course document.",
            mediaKeys: [document.mediaKey],
          },
          {
            lessonKey: "read",
            title: "Read",
            summary: "A text-only lesson remains complete.",
            mediaKeys: [],
          },
        ],
      },
    ],
    videos: [
      {
        videoKey: "artist-video",
        title: "Artist Video",
        summary: "A fictional artist-hosted video.",
        mediaKey: video.mediaKey,
        transcript: "A complete fictional transcript.",
        externalEmbedUrl: null,
        consentRequired: false,
      },
    ],
  };
  value.topics.accountsPublication.publication.catalog = "publish";
  value.topics.accountsPublication.publication.content = "publish";
  const plan = await approvedPlan(value, ["internal-publication"]);

  const receipt = await applySetupOperationPlan(
    memory.binding,
    value,
    plan,
    context("setup-ready-media-follow-up"),
  );
  assert.equal(receipt.operationCount, 15);
  assert.deepEqual(
    {
      ...memory.database
        .prepare(
          `SELECT tracks.publication_state, draft.duration_ms,
                  draft.stream_mode, draft.download_mode,
                  draft.original_media_id, draft.streaming_derivative_id,
                  draft.download_derivative_id
           FROM tracks
           JOIN track_revisions AS draft ON draft.id = tracks.draft_revision_id
           WHERE tracks.slug = 'published-track'`,
        )
        .get(),
    },
    {
      publication_state: "published",
      duration_ms: 180_000,
      stream_mode: "public",
      download_mode: "account",
      original_media_id: audio.id,
      streaming_derivative_id: audioStream.id,
      download_derivative_id: audioDownload.id,
    },
  );
  assert.deepEqual(
    memory.database
      .prepare(
        `SELECT lessons.lesson_key, lesson_items.position,
                lesson_items.item_type, lesson_items.media_derivative_id
         FROM courses
         JOIN course_revisions ON course_revisions.id = courses.published_revision_id
         JOIN lessons ON lessons.course_revision_id = course_revisions.id
         JOIN lesson_items ON lesson_items.lesson_id = lessons.id
         WHERE courses.slug = 'artist-course'
         ORDER BY lessons.position, lesson_items.position`,
      )
      .all()
      .map((row) => ({ ...row })),
    [
      {
        lesson_key: "listen",
        position: 1,
        item_type: "text",
        media_derivative_id: null,
      },
      {
        lesson_key: "listen",
        position: 2,
        item_type: "audio",
        media_derivative_id: audioStream.id,
      },
      {
        lesson_key: "listen",
        position: 3,
        item_type: "download",
        media_derivative_id: audioDownload.id,
      },
      {
        lesson_key: "watch",
        position: 1,
        item_type: "text",
        media_derivative_id: null,
      },
      {
        lesson_key: "watch",
        position: 2,
        item_type: "image",
        media_derivative_id: poster.id,
      },
      {
        lesson_key: "watch",
        position: 3,
        item_type: "video",
        media_derivative_id: hostedVideo.id,
      },
      {
        lesson_key: "watch",
        position: 4,
        item_type: "download",
        media_derivative_id: videoDownload.id,
      },
      {
        lesson_key: "view-image",
        position: 1,
        item_type: "text",
        media_derivative_id: null,
      },
      {
        lesson_key: "view-image",
        position: 2,
        item_type: "image",
        media_derivative_id: courseImage.id,
      },
      {
        lesson_key: "document",
        position: 1,
        item_type: "text",
        media_derivative_id: null,
      },
      {
        lesson_key: "document",
        position: 2,
        item_type: "download",
        media_derivative_id: courseDocument.id,
      },
      {
        lesson_key: "read",
        position: 1,
        item_type: "text",
        media_derivative_id: null,
      },
    ],
  );
  assert.deepEqual(
    {
      ...memory.database
        .prepare(
          `SELECT videos.publication_state, draft.delivery_kind,
                  draft.hosted_derivative_id, draft.poster_derivative_id,
                  transcript.captions_derivative_id
           FROM videos
           JOIN video_revisions AS draft ON draft.id = videos.published_revision_id
           JOIN video_transcripts AS transcript
             ON transcript.video_revision_id = draft.id
           WHERE videos.slug = 'artist-video'`,
        )
        .get(),
    },
    {
      publication_state: "published",
      delivery_kind: "artist_hosted",
      hosted_derivative_id: hostedVideo.id,
      poster_derivative_id: poster.id,
      captions_derivative_id: captions.id,
    },
  );
  assert.doesNotMatch(
    JSON.stringify(receipt),
    /originals\/|derivatives\/|audio\/|video\/|image\/|text\/vtt/i,
  );

  const revisionCounts = {
    tracks: scalar(memory.database, "SELECT COUNT(*) FROM track_revisions"),
    courses: scalar(memory.database, "SELECT COUNT(*) FROM course_revisions"),
    videos: scalar(memory.database, "SELECT COUNT(*) FROM video_revisions"),
  };
  const replay = await applySetupOperationPlan(
    memory.binding,
    value,
    plan,
    context("setup-ready-media-follow-up-replay"),
  );
  assert.equal(replay.replayedCount, 15);
  assert.deepEqual(
    {
      tracks: scalar(memory.database, "SELECT COUNT(*) FROM track_revisions"),
      courses: scalar(memory.database, "SELECT COUNT(*) FROM course_revisions"),
      videos: scalar(memory.database, "SELECT COUNT(*) FROM video_revisions"),
    },
    revisionCounts,
  );
  assert.deepEqual(
    memory.database.prepare("PRAGMA foreign_key_check").all(),
    [],
  );
});

test("setup media binding fails before a delivery receipt for missing, ambiguous, or incompatible derivatives", async () => {
  async function runCase(kind) {
    const memory = await createInMemoryD1();
    seedOwner(memory.database);
    const audio = seedApprovedMediaSource(memory.database, {
      id: `media_source_${kind}`,
      mediaKey: `audio-${kind}`,
      kind: "audio",
      contentType: "audio/wav",
      durationMs: 120_000,
    });
    if (kind !== "missing") {
      seedApprovedMediaDerivative(memory.database, audio, {
        id: `media_derivative_${kind}_stream_one`,
        kind: "streaming",
        contentType: "audio/mpeg",
        durationMs: kind === "incompatible" ? 119_000 : 120_000,
      });
    }
    if (kind === "ambiguous") {
      seedApprovedMediaDerivative(memory.database, audio, {
        id: "media_derivative_ambiguous_stream_two",
        kind: "streaming",
        contentType: "audio/ogg",
        durationMs: 120_000,
      });
    }
    const value = proposal();
    value.topics.rightsMedia = {
      rightsStatement: "The fictional artist confirms this source.",
      media: [
        {
          mediaKey: audio.mediaKey,
          sourceAlias: `approved-${kind}-audio`,
          kind: "audio",
          rights: "confirmed",
          intendedUse: "protected",
          attribution: null,
        },
      ],
    };
    value.topics.catalogReleases.tracks = [
      {
        trackKey: `track-${kind}`,
        title: `Track ${kind}`,
        versionLabel: null,
        releaseKey: null,
        sequence: 1,
        mediaKey: audio.mediaKey,
      },
    ];
    value.topics.streamingDownloads.tracks = [
      {
        trackKey: `track-${kind}`,
        streaming: "public",
        download: "disabled",
      },
    ];
    const plan = await approvedPlan(value);
    const before = {
      artistVersion: scalar(
        memory.database,
        "SELECT version FROM artist_config WHERE id = 'artist'",
      ),
      navigationRevision: scalar(
        memory.database,
        "SELECT SUM(revision) FROM navigation_sets",
      ),
      tracks: scalar(memory.database, "SELECT COUNT(*) FROM tracks"),
      trackRevisions: scalar(
        memory.database,
        "SELECT COUNT(*) FROM track_revisions",
      ),
      legalVersions: scalar(
        memory.database,
        "SELECT COUNT(*) FROM legal_document_versions",
      ),
      setupReceipts: scalar(
        memory.database,
        "SELECT COUNT(*) FROM audit_events WHERE action = 'setup.operation.apply'",
      ),
    };
    await assert.rejects(
      applySetupOperationPlan(
        memory.binding,
        value,
        plan,
        context(`setup-media-${kind}`),
      ),
      (error) => {
        assert.equal(
          error?.code,
          kind === "missing"
            ? "SETUP_MEDIA_MISSING"
            : kind === "ambiguous"
              ? "SETUP_MEDIA_AMBIGUOUS"
              : "SETUP_MEDIA_INCOMPATIBLE",
        );
        return true;
      },
    );
    assert.deepEqual(
      {
        artistVersion: scalar(
          memory.database,
          "SELECT version FROM artist_config WHERE id = 'artist'",
        ),
        navigationRevision: scalar(
          memory.database,
          "SELECT SUM(revision) FROM navigation_sets",
        ),
        tracks: scalar(memory.database, "SELECT COUNT(*) FROM tracks"),
        trackRevisions: scalar(
          memory.database,
          "SELECT COUNT(*) FROM track_revisions",
        ),
        legalVersions: scalar(
          memory.database,
          "SELECT COUNT(*) FROM legal_document_versions",
        ),
        setupReceipts: scalar(
          memory.database,
          "SELECT COUNT(*) FROM audit_events WHERE action = 'setup.operation.apply'",
        ),
      },
      before,
    );
    assert.equal(
      scalar(
        memory.database,
        `SELECT COUNT(*) FROM audit_events
         WHERE action = 'setup.operation.apply'
           AND json_extract(details_json, '$.action') = 'reconcile-track-availability'`,
      ),
      0,
    );
    memory.close();
  }

  for (const kind of ["missing", "ambiguous", "incompatible"]) {
    await runCase(kind);
  }
});
