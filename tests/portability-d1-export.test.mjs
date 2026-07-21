import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";

import { createInMemoryD1, scalar } from "./helpers/in-memory-d1.mjs";
import { rehearseArtistExportRestoreInMemory } from "../lib/portability/sqlite-rehearsal.mjs";

register(
  new URL("./helpers/typescript-alias-loader.mjs", import.meta.url),
  import.meta.url,
);

const {
  createPortableArtistExport,
  markPortableArtistExportVerified,
  readPortableArtistSnapshot,
} = await import("../db/portability-export.ts");
const {
  PORTABLE_DOCUMENT_NAMES,
  parseArtistExportArchiveBytes,
  verifyArtistExportArchive,
} = await import("../lib/portability/index.ts");

const OWNER = "portable_owner";
const CUSTOMER = "portable_customer";
const OWNER_EMAIL = "portable-owner@example.invalid";
const CUSTOMER_POISON = "pk_live_customer_profile_must_never_export";
const ORIGINAL_OBJECT_KEY = "originals/private-object-key-must-not-export";
const DERIVATIVE_OBJECT_KEY =
  "derivatives/private-derivative-key-must-not-export";
const PROVIDER_PRICE_ID = "price_test_portability_must_not_export";
const LICENSE_PROVIDER_PRICE_ID =
  "price_test_license_portability_must_not_export";
const SHA = "f044d6e9005a4b338de6cb95a78ad7325f8eaf0e6ba0535e4247923603939453";

function seedAuthorityAndPrivateCustomer(database) {
  database.exec(`
    INSERT INTO users (id, email, normalized_email, status)
    VALUES ('${OWNER}', '${OWNER_EMAIL}', '${OWNER_EMAIL}', 'active');
    INSERT INTO profiles (user_id, display_name)
    VALUES ('${OWNER}', 'Fictional portable owner');
    INSERT INTO role_assignments
      (id, user_id, role_key, assigned_by_user_id)
    VALUES ('portable_owner_role', '${OWNER}', 'owner', '${OWNER}');

    INSERT INTO users (id, email, normalized_email, status)
    VALUES ('${CUSTOMER}', 'private-customer@example.invalid',
            'private-customer@example.invalid', 'active');
    INSERT INTO profiles (user_id, display_name)
    VALUES ('${CUSTOMER}', '${CUSTOMER_POISON}');
    INSERT INTO role_assignments
      (id, user_id, role_key, assigned_by_user_id)
    VALUES ('portable_customer_role', '${CUSTOMER}', 'customer', '${OWNER}');
  `);
}

function seedLogicalMediaAndProviderBoundPrice(database) {
  database.exec(`
    INSERT INTO media_objects
      (id, object_key, kind, visibility, owner_user_id, content_type,
       byte_length, status, approval_state, content_sha256,
       approved_by_user_id, approved_at)
    VALUES
      ('portable_media', '${ORIGINAL_OBJECT_KEY}', 'audio', 'protected',
       '${OWNER}', 'audio/wav', 4096, 'ready', 'approved', '${SHA}',
       '${OWNER}', '2026-07-19T12:00:00.000Z');
    INSERT INTO media_derivatives
      (id, source_media_id, kind, processing_profile, processing_version,
       object_key, status, approval_state, content_type, format,
       byte_length, content_sha256, approved_by_user_id, approved_at)
    VALUES
      ('portable_stream', 'portable_media', 'streaming', 'stream-v1', '1',
       '${DERIVATIVE_OBJECT_KEY}', 'ready', 'approved', 'audio/mpeg', 'mp3',
       2048, '${SHA}', '${OWNER}', '2026-07-19T12:00:00.000Z');
    INSERT INTO media_objects
      (id, object_key, kind, visibility, owner_user_id, content_type,
       byte_length, status, approval_state)
    VALUES
      ('recursive_export_media', 'runtime-lab/export-record-must-not-export',
       'export', 'protected', '${OWNER}',
       'application/vnd.a-op.artist-export+json', 1, 'ready', 'approved');

    INSERT INTO tracks
      (id, slug, draft_revision_id, published_revision_id,
       publication_state, version, published_at)
    VALUES
      ('portable_track', 'portable-track', 'portable_track_revision',
       'portable_track_revision', 'published', 1,
       '2026-07-19T12:00:00.000Z');
    INSERT INTO track_revisions
      (id, track_id, revision, title, description, duration_ms, meter,
       tempo_bpm, musical_key, copyright_notice,
       explicit, view_mode, stream_mode, download_mode, original_media_id,
       streaming_derivative_id, tags_json)
    VALUES
      ('portable_track_revision', 'portable_track', 1, 'Portable track',
       'Fictional portable track.', 185000, '4/4', 120, 'C minor',
       '2026 Fictional Artist', 0, 'public',
       'public', 'protected', 'portable_media', 'portable_stream',
       '["fictional"]');
    INSERT INTO access_plans
      (id, slug, name, description, state, revision)
    VALUES
      ('portable_access', 'portable-access', 'Portable access',
       'Fictional protected delivery.', 'active', 1);
    INSERT INTO access_grant_templates
      (id, template_key, label, access_plan_id, access_plan_revision,
       default_duration_days, state, revision)
    VALUES
      ('portable_access_template', 'portable-access', 'Portable access',
       'portable_access', 1, 30, 'active', 1);
    INSERT INTO membership_plans
      (id, slug, state, current_revision)
    VALUES
      ('portable_membership', 'portable-membership', 'active', 1);
    INSERT INTO membership_plan_revisions
      (id, membership_plan_id, revision, name, description, benefits_json,
       access_plan_id, access_plan_revision, download_credits,
       license_credits, duration_days)
    VALUES
      ('portable_membership_v1', 'portable_membership', 1,
       'Portable membership', 'Fictional membership definition.',
       '["protected-downloads"]', 'portable_access', 1, 1, 0, 30);
    INSERT INTO subscription_plans
      (id, slug, name, description, membership_plan_id,
       membership_plan_revision_id, membership_plan_revision,
       billing_interval, interval_count, state, revision)
    VALUES
      ('portable_subscription', 'portable-subscription',
       'Portable subscription', 'Fictional monthly subscription.',
       'portable_membership', 'portable_membership_v1', 1,
       'month', 1, 'active', 1);
    INSERT INTO membership_credit_rules
      (id, rule_key, credit_kind, membership_plan_id,
       membership_plan_revision_id, membership_plan_revision, amount,
       cadence, state, revision)
    VALUES
      ('portable_membership_credit', 'portable-membership-download',
       'download', 'portable_membership', 'portable_membership_v1', 1,
       1, 'once', 'active', 1);
    INSERT INTO membership_credit_rules
      (id, rule_key, credit_kind, subscription_plan_id,
       subscription_plan_revision, amount, cadence, state, revision)
    VALUES
      ('portable_subscription_credit', 'portable-subscription-download',
       'download', 'portable_subscription', 1, 1, 'month', 'active', 1);
    INSERT INTO commerce_products
      (id, slug, name, description, product_type, resource_type, resource_id,
       access_plan_id, access_plan_revision, state, revision)
    VALUES
      ('portable_product', 'portable-product', 'Portable product',
       'Fictional product definition.', 'track', 'track', 'portable_track',
       'portable_access', 1, 'active', 1);
    INSERT INTO commerce_prices
      (id, commerce_product_id, amount_minor, currency, billing_interval,
       interval_count, stripe_price_id, active, stripe_environment,
       livemode, revision)
    VALUES
      ('portable_price', 'portable_product', 1200, 'USD', 'one_time', 1,
       '${PROVIDER_PRICE_ID}', 1, 'test', 0, 1);

    INSERT INTO commerce_products
      (id, slug, name, description, product_type, resource_type, resource_id,
       state, revision)
    VALUES
      ('portable_license_product', 'portable-license-product',
       'Portable license product', 'Fictional license product definition.',
       'license', 'track', 'portable_track', 'active', 1);
    INSERT INTO commerce_prices
      (id, commerce_product_id, amount_minor, currency, billing_interval,
       interval_count, stripe_price_id, active, stripe_environment,
       livemode, revision)
    VALUES
      ('portable_license_price', 'portable_license_product', 2400, 'USD',
       'one_time', 1, '${LICENSE_PROVIDER_PRICE_ID}', 1, 'test', 0, 1);
    INSERT INTO license_terms (id, slug, state, current_version)
    VALUES ('portable_terms', 'portable-terms', 'active', 1);
    INSERT INTO license_terms_versions
      (id, license_terms_id, version, name, title, introduction,
       general_terms, disclaimer)
    VALUES
      ('portable_terms_v1', 'portable_terms', 1, 'Portable terms',
       'Portable terms', 'Fictional introduction.',
       'Fictional general terms.', 'Fictional disclaimer.');
    INSERT INTO license_options
      (id, license_terms_id, license_terms_version_id, license_terms_version,
       option_key, label, description, usage_category, allowed_media_json,
       territory, attribution_required, exclusive, requires_approval,
       license_credit_cost, includes_track_download, position)
    VALUES
      ('portable_license_option', 'portable_terms', 'portable_terms_v1', 1,
       'short-film', 'Short film', 'Fictional short-film use.', 'film',
       '["film"]', 'Worldwide', 0, 0, 0, 1, 1, 1);
    INSERT INTO commerce_binding_intents
      (id, intent_key, intent_kind, name, description, track_id,
       track_revision_id, track_revision, license_terms_id,
       license_terms_version_id, license_terms_version, license_option_id,
       amount_minor, currency, billing_interval, interval_count,
       created_by_user_id, last_operation_key)
    VALUES
      ('portable_license_binding_intent', 'portable-license-intent',
       'license', 'Portable license intent',
       'Provider-neutral Test Mode definition.', 'portable_track',
       'portable_track_revision', 1, 'portable_terms', 'portable_terms_v1', 1,
       'portable_license_option', 2400, 'USD', 'one_time', 1, '${OWNER}',
       'setup:portable-license-binding-intent');
    INSERT INTO license_offers
      (id, slug, track_id, track_revision_id, license_terms_id,
       license_terms_version_id, license_terms_version, license_option_id,
       commerce_product_id, commerce_price_id, state, revision)
    VALUES
      ('portable_license_offer', 'portable-license-offer', 'portable_track',
       'portable_track_revision', 'portable_terms', 'portable_terms_v1', 1,
       'portable_license_option', 'portable_license_product',
       'portable_license_price', 'active', 1);
    INSERT INTO updates
      (id, slug, title, summary, body_json, audience, resource_type,
       resource_id, state, published_at, revision)
    VALUES
      ('portable_offer_update', 'portable-offer-update',
       'Portable license offer', 'Fictional license update.',
       '[{"type":"paragraph","text":"A fictional license offer."}]',
       'public', 'license', 'portable_license_offer', 'published',
       '2026-07-19T12:00:00.000Z', 1);
  `);
}

function createInput(idempotencyKey, timestamp = "2026-07-19T12:30:00.000Z") {
  return {
    applicationSchemaVersion: 19,
    actorUserId: OWNER,
    idempotencyKey,
    now: () => new Date(timestamp),
  };
}

test("D1 export emits every fixed document with provider-neutral definitions only", async (t) => {
  const memory = await createInMemoryD1();
  t.after(() => memory.close());
  seedAuthorityAndPrivateCustomer(memory.database);
  seedLogicalMediaAndProviderBoundPrice(memory.database);

  const result = await createPortableArtistExport(
    memory.binding,
    createInput("portable-export-0001"),
  );
  const verified = await verifyArtistExportArchive(
    parseArtistExportArchiveBytes(result.bytes),
  );
  const rehearsal = await rehearseArtistExportRestoreInMemory(verified.archive);
  assert.equal(result.replayed, false);
  assert.equal(result.fileCount, PORTABLE_DOCUMENT_NAMES.length + 1);
  assert.equal(result.mediaObjectCount, 1);
  assert.equal(rehearsal.semanticFingerprint, verified.semanticFingerprint);
  assert.equal(
    rehearsal.restoredSemanticFingerprint,
    verified.semanticFingerprint,
  );
  assert.equal(rehearsal.duplicateCount, 0);
  assert.equal(rehearsal.commerceBindingState, "pending");
  assert.equal(rehearsal.applicationSchemaRestored, true);
  assert.equal(rehearsal.migrationCount, 35);
  assert.equal(rehearsal.foreignKeyViolationCount, 0);
  assert.equal(rehearsal.sourceObjectKeysRestored, 0);
  assert.equal(rehearsal.mediaBytesRestored, 0);
  for (const document of PORTABLE_DOCUMENT_NAMES) {
    assert.ok(
      verified.archive.files.some(
        ({ path }) => path === `definitions/${document}.json`,
      ),
      `missing fixed ${document} document`,
    );
  }

  const modulesChecksum = verified.archive.manifest.entries.find(
    ({ path }) => path === "definitions/modules.json",
  )?.sha256;
  assert.equal(
    modulesChecksum,
    "f044d6e9005a4b338de6cb95a78ad7325f8eaf0e6ba0535e4247923603939453",
    "the fixed lowercase SHA contains a PAN-like digit run and remains a checksum",
  );

  const serialized = new TextDecoder().decode(result.bytes);
  for (const prohibited of [
    OWNER_EMAIL,
    CUSTOMER,
    CUSTOMER_POISON,
    ORIGINAL_OBJECT_KEY,
    DERIVATIVE_OBJECT_KEY,
    PROVIDER_PRICE_ID,
    LICENSE_PROVIDER_PRICE_ID,
    "recursive_export_media",
  ]) {
    assert.doesNotMatch(serialized, new RegExp(prohibited));
  }
  const price = verified.snapshot.commerce.find(
    ({ entity, id }) =>
      entity === "commerce-price-definition" && id === "portable_price",
  );
  assert.ok(price);
  assert.deepEqual(
    Object.fromEntries(price.fields.map(({ name, value }) => [name, value])),
    {
      active: true,
      amountMinor: 1200,
      billingInterval: "one_time",
      bindingState: "pending",
      currency: "USD",
      intervalCount: 1,
      revision: 1,
    },
  );
  const trackRevision = verified.snapshot.catalog.find(
    ({ entity, id }) =>
      entity === "track-revision" && id === "portable_track_revision",
  );
  assert.ok(trackRevision);
  assert.equal(
    Object.fromEntries(
      trackRevision.fields.map(({ name, value }) => [name, value]),
    ).meter,
    "4/4",
  );
  assert.equal(
    Object.fromEntries(
      trackRevision.fields.map(({ name, value }) => [name, value]),
    ).tempoBpm,
    120,
  );
  assert.equal(
    Object.fromEntries(
      trackRevision.fields.map(({ name, value }) => [name, value]),
    ).musicalKey,
    "C minor",
  );
  const grantTemplate = verified.snapshot.access.find(
    ({ entity, id }) =>
      entity === "access-grant-template" && id === "portable_access_template",
  );
  assert.ok(grantTemplate);
  assert.deepEqual(grantTemplate.relations, [
    {
      name: "accessPlan",
      targetEntity: "access-plan",
      targetId: "portable_access",
    },
  ]);
  const membershipCreditRules = verified.snapshot.memberships.filter(
    ({ entity }) => entity === "membership-credit-rule",
  );
  assert.equal(membershipCreditRules.length, 2);
  assert.deepEqual(
    membershipCreditRules.map((record) => ({
      fields: Object.fromEntries(
        record.fields.map(({ name, value }) => [name, value]),
      ),
      relations: record.relations,
    })),
    [
      {
        fields: {
          amount: 1,
          cadence: "once",
          creditKind: "download",
          key: "portable-membership-download",
          revision: 1,
          state: "active",
          subjectKind: "membership",
        },
        relations: [
          {
            name: "membershipPlan",
            targetEntity: "membership-plan",
            targetId: "portable_membership",
          },
          {
            name: "membershipPlanRevision",
            targetEntity: "membership-plan-revision",
            targetId: "portable_membership_v1",
          },
        ],
      },
      {
        fields: {
          amount: 1,
          cadence: "month",
          creditKind: "download",
          key: "portable-subscription-download",
          revision: 1,
          state: "active",
          subjectKind: "subscription",
        },
        relations: [
          {
            name: "subscriptionPlan",
            targetEntity: "subscription-plan",
            targetId: "portable_subscription",
          },
        ],
      },
    ],
  );
  const bindingIntent = verified.snapshot.commerce.find(
    ({ entity, id }) =>
      entity === "commerce-binding-intent" &&
      id === "portable_license_binding_intent",
  );
  assert.ok(bindingIntent);
  assert.equal(
    bindingIntent.fields.find(({ name }) => name === "bindingState")?.value,
    "pending",
  );
  const linkedUpdate = verified.snapshot.updates.find(
    ({ entity, id }) => entity === "update" && id === "portable_offer_update",
  );
  assert.deepEqual(linkedUpdate?.relations, [
    {
      name: "resource",
      targetEntity: "license-offer",
      targetId: "portable_license_offer",
    },
  ]);
  assert.deepEqual(
    memory.database.prepare("PRAGMA foreign_key_check").all(),
    [],
  );
});

test("export creation and in-memory verification persist one idempotent manifest", async (t) => {
  const memory = await createInMemoryD1();
  t.after(() => memory.close());
  seedAuthorityAndPrivateCustomer(memory.database);

  const first = await createPortableArtistExport(
    memory.binding,
    createInput("portable-export-0002"),
  );
  const replay = await createPortableArtistExport(
    memory.binding,
    createInput("portable-export-0002", "2026-07-19T13:00:00.000Z"),
  );
  const definitionReplay = await createPortableArtistExport(
    memory.binding,
    createInput("portable-export-0003", "2026-07-19T14:00:00.000Z"),
  );
  assert.equal(replay.replayed, true);
  assert.equal(definitionReplay.replayed, true);
  assert.deepEqual(replay.bytes, first.bytes);
  assert.deepEqual(definitionReplay.bytes, first.bytes);
  assert.equal(
    scalar(memory.database, "SELECT COUNT(*) FROM export_manifests"),
    1,
  );

  const verifiedArchive = await verifyArtistExportArchive(first.archive);
  const marked = await markPortableArtistExportVerified(
    memory.binding,
    verifiedArchive,
    {
      actorUserId: OWNER,
      idempotencyKey: "portable-verify-0001",
      now: () => new Date("2026-07-19T12:31:00.000Z"),
    },
  );
  const markedReplay = await markPortableArtistExportVerified(
    memory.binding,
    verifiedArchive,
    {
      actorUserId: OWNER,
      idempotencyKey: "portable-verify-0001",
      now: () => new Date("2026-07-19T15:00:00.000Z"),
    },
  );
  assert.equal(marked.replayed, false);
  assert.equal(markedReplay.replayed, true);
  assert.equal(markedReplay.verifiedAt, marked.verifiedAt);
  assert.deepEqual(
    {
      ...memory.database
        .prepare(
          `SELECT status, contains_customer_data, contains_provider_payload,
                  manifest_sha256, file_count, byte_count, verified_at
           FROM export_manifests`,
        )
        .get(),
    },
    {
      status: "verified",
      contains_customer_data: 0,
      contains_provider_payload: 0,
      manifest_sha256: first.archiveSha256,
      file_count: first.fileCount,
      byte_count: first.byteCount,
      verified_at: "2026-07-19T12:31:00.000Z",
    },
  );

  memory.database.exec(`
    INSERT INTO artist_config_revisions
      (id, artist_config_id, revision, display_name, site_title, headline,
       introduction, footer_text)
    VALUES
      ('portable_artist_revision_2', 'artist', 2, 'a-op',
       'a-op: artist-owned platform', 'Music first.',
       'A changed fictional artist definition.',
       'Fictional ownership statement.');
    UPDATE artist_config
    SET draft_revision_id = 'portable_artist_revision_2', version = 2
    WHERE id = 'artist';
  `);
  await assert.rejects(
    createPortableArtistExport(
      memory.binding,
      createInput("portable-export-0002", "2026-07-19T16:00:00.000Z"),
    ),
    (error) => error?.code === "PORTABILITY_IDEMPOTENCY_CONFLICT",
  );
  const changedState = await createPortableArtistExport(
    memory.binding,
    createInput("portable-export-0006", "2026-07-19T16:00:00.000Z"),
  );
  assert.equal(changedState.replayed, false);
  assert.notEqual(changedState.semanticFingerprint, first.semanticFingerprint);
  assert.equal(
    scalar(memory.database, "SELECT COUNT(*) FROM export_manifests"),
    2,
  );
});

test("non-owner and altered archives cannot create or verify evidence", async (t) => {
  const memory = await createInMemoryD1();
  t.after(() => memory.close());
  seedAuthorityAndPrivateCustomer(memory.database);

  await assert.rejects(
    createPortableArtistExport(memory.binding, {
      ...createInput("portable-export-0004"),
      actorUserId: CUSTOMER,
    }),
    (error) => error?.code === "ROLE_REQUIRED",
  );
  const result = await createPortableArtistExport(
    memory.binding,
    createInput("portable-export-0005"),
  );
  const changed = structuredClone(result.archive);
  changed.files[0].text = `${changed.files[0].text} `;
  await assert.rejects(
    verifyArtistExportArchive(changed),
    (error) => error?.code === "PORTABILITY_CHECKSUM_INVALID",
  );
  assert.equal(
    scalar(
      memory.database,
      "SELECT COUNT(*) FROM export_manifests WHERE status = 'verified'",
    ),
    0,
  );
  const verified = await verifyArtistExportArchive(result.archive);
  await assert.rejects(
    markPortableArtistExportVerified(memory.binding, verified, {
      actorUserId: CUSTOMER,
      idempotencyKey: "portable-verify-0002",
    }),
    (error) => error?.code === "ROLE_REQUIRED",
  );
  assert.equal(
    scalar(
      memory.database,
      "SELECT COUNT(*) FROM export_manifests WHERE status = 'verified'",
    ),
    0,
  );
});

test("the source adapter returns a validated customer-independent snapshot", async (t) => {
  const memory = await createInMemoryD1();
  t.after(() => memory.close());
  seedAuthorityAndPrivateCustomer(memory.database);
  const snapshot = await readPortableArtistSnapshot(memory.binding);
  assert.deepEqual(Object.keys(snapshot), [...PORTABLE_DOCUMENT_NAMES]);
  assert.equal(snapshot.artist.length, 1);
  assert.equal(snapshot.telemetry.length, 1);
  assert.doesNotMatch(JSON.stringify(snapshot), /portable_customer|pk_live_/);
});
