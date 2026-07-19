import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";

import { createInMemoryD1, scalar } from "./helpers/in-memory-d1.mjs";

register(
  new URL("./helpers/typescript-alias-loader.mjs", import.meta.url),
  import.meta.url,
);

const [{ readAccessFacts }, { decideAccess }, catalogDelivery] =
  await Promise.all([
    import("../db/access-read.ts"),
    import("../lib/access/decide-access.ts"),
    import("../lib/catalog/delivery.ts"),
  ]);
const { deliverTrackDownload, deliverTrackStream } = catalogDelivery;

const TRACK_ID = "track_access_delivery";
const REVISION_ID = "track_revision_access_delivery";
const SOURCE_ID = "media_access_delivery";
const STREAM_DERIVATIVE_ID = "derivative_access_stream";
const DOWNLOAD_DERIVATIVE_ID = "derivative_access_download";
const STREAM_KEY = "derivatives/media_access_delivery/stream-v1";
const DOWNLOAD_KEY = "derivatives/media_access_delivery/download-v1";
const SHA256 = "d".repeat(64);
const STREAM_BYTES = Uint8Array.from([0x49, 0x44, 0x33, 0x01]);
const DOWNLOAD_BYTES = Uint8Array.from([
  0x66, 0x4c, 0x61, 0x43, 0x00, 0x00, 0x00, 0x22,
]);

function identity(userId) {
  return {
    userId,
    email: `${userId}@example.invalid`,
    displayName: userId,
    roles: ["customer"],
  };
}

function stream(bytes) {
  const copy = new Uint8Array(bytes);
  return new ReadableStream({
    start(controller) {
      controller.enqueue(copy);
      controller.close();
    },
  });
}

function metadata(key, value) {
  return {
    key,
    version: "memory-version",
    size: value.bytes.byteLength,
    etag: "memory-etag",
    httpEtag: '"memory-etag"',
    checksums: {},
    uploaded: new Date("2026-07-18T00:00:00.000Z"),
    httpMetadata: { contentType: value.contentType },
    customMetadata: {},
    storageClass: "Standard",
  };
}

class ReadOnlyMemoryBucket {
  constructor() {
    this.calls = [];
    this.objects = new Map([
      [STREAM_KEY, { bytes: STREAM_BYTES, contentType: "audio/mpeg" }],
      [DOWNLOAD_KEY, { bytes: DOWNLOAD_BYTES, contentType: "audio/flac" }],
    ]);
  }

  clearCalls() {
    this.calls.length = 0;
  }

  async head(key) {
    this.calls.push({ method: "head", key });
    const value = this.objects.get(key);
    return value ? metadata(key, value) : null;
  }

  async get(key, options) {
    this.calls.push({ method: "get", key, options: options ?? null });
    const value = this.objects.get(key);
    if (!value) return null;
    return {
      ...metadata(key, value),
      body: stream(value.bytes),
      bodyUsed: false,
      arrayBuffer: async () => new Uint8Array(value.bytes).buffer,
      text: async () => new TextDecoder().decode(value.bytes),
      json: async () => JSON.parse(new TextDecoder().decode(value.bytes)),
      blob: async () => new Blob([value.bytes], { type: value.contentType }),
      writeHttpMetadata() {},
    };
  }

  async put(key) {
    this.calls.push({ method: "put", key });
    throw new Error("Protected delivery must not write R2.");
  }

  async delete(key) {
    this.calls.push({ method: "delete", key });
    throw new Error("Protected delivery must not delete R2.");
  }
}

function seedDelivery(database, downloadMode = "protected") {
  const insertUser = database.prepare(
    `INSERT INTO users (id, email, normalized_email, status)
     VALUES (?, ?, ?, 'active')`,
  );
  for (const [id, email] of [
    ["user_owner_access", "owner-access@example.invalid"],
    ["user_customer_access", "customer-access@example.invalid"],
    ["user_customer_other", "other-access@example.invalid"],
  ]) {
    insertUser.run(id, email, email);
  }
  const insertRole = database.prepare(
    `INSERT INTO role_assignments
       (id, user_id, role_key, assigned_by_user_id)
     VALUES (?, ?, ?, 'user_owner_access')`,
  );
  insertRole.run("role_owner_access", "user_owner_access", "owner");
  insertRole.run("role_customer_access", "user_customer_access", "customer");
  insertRole.run("role_customer_other", "user_customer_other", "customer");

  database
    .prepare(
      `INSERT INTO media_objects
         (id, object_key, kind, visibility, owner_user_id, content_type,
          byte_length, etag, source_version, status, approval_state,
          content_sha256, duration_ms, channels, sample_rate, revision,
          approved_by_user_id, approved_at)
       VALUES (?, ?, 'audio', 'protected', 'user_owner_access', 'audio/wav',
               16, 'source-etag', 1, 'ready', 'approved', ?, 1000, 2, 48000,
               1, 'user_owner_access', CURRENT_TIMESTAMP)`,
    )
    .run(SOURCE_ID, `originals/${SOURCE_ID}/v1`, SHA256);
  const insertDerivative = database.prepare(
    `INSERT INTO media_derivatives
       (id, source_media_id, kind, processing_profile, processing_version,
        object_key, status, approval_state, content_type, format,
        duration_ms, channels, sample_rate, byte_length, content_sha256,
        revision, approved_by_user_id, approved_at)
     VALUES (?, ?, ?, ?, '1', ?, 'ready', 'approved', ?, ?, 1000, 2, 48000,
             ?, ?, 1, 'user_owner_access', CURRENT_TIMESTAMP)`,
  );
  insertDerivative.run(
    STREAM_DERIVATIVE_ID,
    SOURCE_ID,
    "streaming",
    "stream-main",
    STREAM_KEY,
    "audio/mpeg",
    "mp3",
    STREAM_BYTES.byteLength,
    SHA256,
  );
  insertDerivative.run(
    DOWNLOAD_DERIVATIVE_ID,
    SOURCE_ID,
    "download",
    "download-main",
    DOWNLOAD_KEY,
    "audio/flac",
    "flac",
    DOWNLOAD_BYTES.byteLength,
    SHA256,
  );

  database
    .prepare(
      `INSERT INTO tracks
         (id, slug, draft_revision_id, published_revision_id,
          publication_state, version, published_at)
       VALUES (?, 'access-delivery', ?, ?, 'published', 1, CURRENT_TIMESTAMP)`,
    )
    .run(TRACK_ID, REVISION_ID, REVISION_ID);
  database
    .prepare(
      `INSERT INTO track_revisions
         (id, track_id, revision, title, view_mode, stream_mode, download_mode,
          original_media_id, streaming_derivative_id, download_derivative_id)
       VALUES (?, ?, 1, 'Access delivery', 'public', 'protected', ?, ?, ?, ?)`,
    )
    .run(
      REVISION_ID,
      TRACK_ID,
      downloadMode,
      SOURCE_ID,
      STREAM_DERIVATIVE_ID,
      DOWNLOAD_DERIVATIVE_ID,
    );
}

function setDownloadsActive(database, active) {
  database
    .prepare(
      `UPDATE artist_modules
       SET active = ?, revision = revision + 1, updated_at = CURRENT_TIMESTAMP
       WHERE module_key = 'downloads'`,
    )
    .run(active ? 1 : 0);
}

function seedGrant(database, overrides = {}) {
  const input = {
    state: "active",
    startsAt: "2026-07-01T00:00:00.000Z",
    expiresAt: "2099-08-01T00:00:00.000Z",
    remainingUses: 2,
    ...overrides,
  };
  database
    .prepare(
      `INSERT INTO access_grants
         (id, grantee_user_id, resource_type, resource_id, actions_json,
          state, starts_at, expires_at, remaining_uses,
          download_disposition, reason, granted_by_user_id)
       VALUES ('grant_access_delivery', 'user_customer_access', 'track', ?,
               '["stream","download"]', ?, ?, ?, ?, 'attachment',
               'Fictional protected delivery access.', 'user_owner_access')`,
    )
    .run(
      TRACK_ID,
      input.state,
      input.startsAt,
      input.expiresAt,
      input.remainingUses,
    );
  database
    .prepare(
      `INSERT INTO entitlements
         (id, user_id, source_type, source_id, grant_id, resource_type,
          resource_id, actions_json, state, starts_at, expires_at,
          remaining_uses, download_disposition)
       VALUES ('entitlement_access_delivery', 'user_customer_access', 'grant',
               'grant_access_delivery', 'grant_access_delivery', 'track', ?,
               '["stream","download"]', 'active', ?, ?, ?, 'attachment')`,
    )
    .run(TRACK_ID, input.startsAt, input.expiresAt, input.remainingUses);
}

function streamInput(binding, bucket, userId = "user_customer_access") {
  return {
    binding,
    bucket,
    request: new Request("https://example.invalid/api/media/stream"),
    requestId: "request_access_stream_1",
    trackId: TRACK_ID,
    requestedRevisionId: null,
    identity: identity(userId),
  };
}

function downloadInput(binding, bucket, userId, requestId) {
  return {
    binding,
    bucket,
    requestId,
    trackId: TRACK_ID,
    requestedRevisionId: null,
    identity: userId === null ? null : identity(userId),
  };
}

async function assertRuntimeCode(promise, expectedCode) {
  await assert.rejects(promise, (error) => {
    assert.equal(error?.name, "RuntimeError");
    assert.equal(error?.code, expectedCode);
    return true;
  });
}

test("D1 access facts preserve grant state, limits, and safe source explanation", async (t) => {
  const memory = await createInMemoryD1();
  t.after(() => memory.close());
  seedDelivery(memory.database);
  seedGrant(memory.database);

  const request = {
    identity: { userId: "user_customer_access", roles: ["customer"] },
    resourceType: "track",
    resourceId: TRACK_ID,
    action: "download",
    now: "2026-07-18T18:00:00.000Z",
  };
  const projection = await readAccessFacts(memory.binding, request);
  assert.deepEqual(projection.sources, [
    {
      sourceType: "grant",
      explanation: "Artist access grant",
      state: "active",
      entitlementId: "entitlement_access_delivery",
      startsAt: "2026-07-01T00:00:00.000Z",
      expiresAt: "2099-08-01T00:00:00.000Z",
      remainingUses: 2,
    },
  ]);
  assert.deepEqual(
    await decideAccess({ ...request, facts: projection.facts }),
    {
      allowed: true,
      reason: "explicit-grant",
      source: "grant",
      entitlementId: "entitlement_access_delivery",
      expiresAt: "2099-08-01T00:00:00.000Z",
      remainingUses: 2,
      downloadDisposition: "attachment",
      sourceExplanation: "Artist access grant",
    },
  );

  const other = await readAccessFacts(memory.binding, {
    ...request,
    identity: { userId: "user_customer_other", roles: ["customer"] },
  });
  assert.deepEqual(other.sources, []);
  assert.deepEqual(other.facts.grants, []);
  const wrongAction = await readAccessFacts(memory.binding, {
    ...request,
    action: "view",
  });
  assert.deepEqual(wrongAction.sources, []);
  assert.deepEqual(wrongAction.facts.grants, []);

  memory.database
    .prepare(
      `INSERT INTO entitlements
         (id, user_id, source_type, source_id, resource_type, resource_id,
          actions_json, state)
       VALUES ('entitlement_membership_access', 'user_customer_access',
               'membership', 'membership_fixture', 'release',
               'release_access_fixture', '["view"]', 'active')`,
    )
    .run();
  const membership = await readAccessFacts(memory.binding, {
    ...request,
    resourceType: "release",
    resourceId: "release_access_fixture",
    action: "view",
  });
  assert.deepEqual(membership.sources, [
    {
      sourceType: "membership",
      explanation: "Membership entitlement",
      state: "active",
      entitlementId: "entitlement_membership_access",
      startsAt: null,
      expiresAt: null,
      remainingUses: null,
    },
  ]);
});

test("protected stream grants revoke and expire immediately before any R2 read", async (t) => {
  const memory = await createInMemoryD1();
  t.after(() => memory.close());
  seedDelivery(memory.database);
  seedGrant(memory.database);
  const bucket = new ReadOnlyMemoryBucket();

  const allowed = await deliverTrackStream(streamInput(memory.binding, bucket));
  assert.equal(allowed.status, 200);
  assert.equal(allowed.headers.get("x-aop-access-source"), "grant");
  assert.deepEqual(new Uint8Array(await allowed.arrayBuffer()), STREAM_BYTES);

  bucket.clearCalls();
  memory.database
    .prepare(
      `UPDATE access_grants
       SET state = 'revoked', revoked_at = CURRENT_TIMESTAMP
       WHERE id = 'grant_access_delivery'`,
    )
    .run();
  await assertRuntimeCode(
    deliverTrackStream(streamInput(memory.binding, bucket)),
    "ACCESS_DENIED",
  );
  assert.deepEqual(bucket.calls, []);

  memory.database
    .prepare(
      `UPDATE access_grants
       SET state = 'active', revoked_at = NULL, expires_at = '2026-07-10T00:00:00.000Z'
       WHERE id = 'grant_access_delivery'`,
    )
    .run();
  bucket.clearCalls();
  await assertRuntimeCode(
    deliverTrackStream(streamInput(memory.binding, bucket)),
    "ACCESS_DENIED",
  );
  assert.deepEqual(bucket.calls, []);
});

test("track downloads require module and exact account or grant authority, then record one redacted delivery", async (t) => {
  const memory = await createInMemoryD1();
  t.after(() => memory.close());
  seedDelivery(memory.database, "account");
  const bucket = new ReadOnlyMemoryBucket();

  await assertRuntimeCode(
    deliverTrackDownload(
      downloadInput(
        memory.binding,
        bucket,
        "user_customer_access",
        "request_download_module_off",
      ),
    ),
    "MODULE_INACTIVE",
  );
  assert.deepEqual(bucket.calls, []);

  setDownloadsActive(memory.database, true);
  const accountResponse = await deliverTrackDownload(
    downloadInput(
      memory.binding,
      bucket,
      "user_customer_access",
      "request_download_account_1",
    ),
  );
  assert.equal(accountResponse.status, 200);
  assert.equal(accountResponse.headers.get("content-type"), "audio/flac");
  assert.equal(
    accountResponse.headers.get("content-disposition"),
    'attachment; filename="access-delivery.flac"',
  );
  assert.equal(accountResponse.headers.get("x-aop-access-source"), "account");
  assert.deepEqual(
    new Uint8Array(await accountResponse.arrayBuffer()),
    DOWNLOAD_BYTES,
  );
  const publicResponseFacts = JSON.stringify({
    headers: [...accountResponse.headers],
  });
  assert.doesNotMatch(
    publicResponseFacts,
    /derivatives\/|download-v1|derivative_access|originals\/|[d]{32}/,
  );
  assert.equal(
    scalar(
      memory.database,
      `SELECT COUNT(*) FROM download_events
       WHERE request_id = 'request_download_account_1'`,
    ),
    1,
  );

  memory.database
    .prepare(
      `UPDATE track_revisions SET download_mode = 'protected' WHERE id = ?`,
    )
    .run(REVISION_ID);
  seedGrant(memory.database);

  bucket.clearCalls();
  await assertRuntimeCode(
    deliverTrackDownload(
      downloadInput(
        memory.binding,
        bucket,
        "user_customer_other",
        "request_download_cross_user",
      ),
    ),
    "ACCESS_DENIED",
  );
  assert.deepEqual(bucket.calls, []);

  const grantInput = downloadInput(
    memory.binding,
    bucket,
    "user_customer_access",
    "request_download_grant_1",
  );
  const grantResponse = await deliverTrackDownload(grantInput);
  assert.equal(grantResponse.status, 200);
  assert.equal(grantResponse.headers.get("x-aop-access-source"), "grant");
  assert.deepEqual(
    new Uint8Array(await grantResponse.arrayBuffer()),
    DOWNLOAD_BYTES,
  );

  await deliverTrackDownload(grantInput);
  assert.equal(
    scalar(
      memory.database,
      `SELECT COUNT(*) FROM download_events
       WHERE request_id = 'request_download_grant_1'`,
    ),
    1,
  );
  assert.deepEqual(
    {
      ...memory.database
        .prepare(
          `SELECT user_id, resource_type, resource_id, media_derivative_id,
                  entitlement_id, access_source, byte_length
           FROM download_events
           WHERE request_id = 'request_download_grant_1'`,
        )
        .get(),
    },
    {
      user_id: "user_customer_access",
      resource_type: "track",
      resource_id: TRACK_ID,
      media_derivative_id: DOWNLOAD_DERIVATIVE_ID,
      entitlement_id: "entitlement_access_delivery",
      access_source: "grant",
      byte_length: DOWNLOAD_BYTES.byteLength,
    },
  );
  assert.equal(
    bucket.calls.some(({ method }) => method === "put" || method === "delete"),
    false,
  );
});

test("public track downloads record an anonymous public delivery without customer identity", async (t) => {
  const memory = await createInMemoryD1();
  t.after(() => memory.close());
  seedDelivery(memory.database, "public");
  setDownloadsActive(memory.database, true);
  const bucket = new ReadOnlyMemoryBucket();

  const response = await deliverTrackDownload(
    downloadInput(
      memory.binding,
      bucket,
      null,
      "request_download_public_anonymous",
    ),
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-aop-access-source"), "public");
  assert.deepEqual(
    new Uint8Array(await response.arrayBuffer()),
    DOWNLOAD_BYTES,
  );
  assert.deepEqual(
    {
      ...memory.database
        .prepare(
          `SELECT user_id, access_source, resource_id
           FROM download_events
           WHERE request_id = 'request_download_public_anonymous'`,
        )
        .get(),
    },
    {
      user_id: null,
      access_source: "public",
      resource_id: TRACK_ID,
    },
  );
});
