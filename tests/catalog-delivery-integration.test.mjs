import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";

import { createInMemoryD1 } from "./helpers/in-memory-d1.mjs";

register(
  new URL("./helpers/typescript-alias-loader.mjs", import.meta.url),
  import.meta.url,
);

const [
  { deliverTrackStream },
  catalogWrite,
  mediaAdmin,
  { readPublicTrack },
  { resolveApplicationIdentity },
] = await Promise.all([
  import("../lib/catalog/delivery.ts"),
  import("../db/catalog-write.ts"),
  import("../db/media-admin.ts"),
  import("../db/catalog-read.ts"),
  import("../lib/auth/application-identity.ts"),
]);
const { publishTrack, saveTrackDraft } = catalogWrite;
const { recordMediaOperationalFailure } =
  await import("../db/operational-failures-write.ts");
const {
  registerMediaDerivative,
  registerMediaSource,
  setMediaDerivativeApproval,
  setMediaSourceApproval,
} = mediaAdmin;

const SOURCE_ID = "media_delivery_source";
const DERIVATIVE_ID = "derivative_delivery_stream";
const DERIVATIVE_KEY = "derivatives/media_delivery_source/stream-main-v1";
const CONTENT_TYPE = "audio/mpeg";
const SHA256 = "a".repeat(64);
const AUDIO_BYTES = Uint8Array.from([
  0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x02, 0x41, 0x4f,
]);

function objectMetadata(key, bytes, contentType) {
  return {
    key,
    version: "memory-version",
    size: bytes.byteLength,
    etag: "memory-etag",
    httpEtag: '"memory-etag"',
    checksums: {},
    uploaded: new Date("2026-07-18T00:00:00.000Z"),
    httpMetadata: { contentType },
    customMetadata: {},
    storageClass: "Standard",
  };
}

function streamBytes(bytes) {
  const copy = new Uint8Array(bytes);
  return new ReadableStream({
    start(controller) {
      controller.enqueue(copy);
      controller.close();
    },
  });
}

class ReadOnlyMemoryBucket {
  constructor() {
    this.calls = [];
    this.objects = new Map([
      [
        DERIVATIVE_KEY,
        { bytes: new Uint8Array(AUDIO_BYTES), contentType: CONTENT_TYPE },
      ],
    ]);
  }

  clearCalls() {
    this.calls.length = 0;
  }

  async head(key) {
    this.calls.push({ method: "head", key });
    const object = this.objects.get(key);
    return object
      ? objectMetadata(key, object.bytes, object.contentType)
      : null;
  }

  async get(key, options) {
    this.calls.push({ method: "get", key, options: options ?? null });
    const object = this.objects.get(key);
    if (!object) return null;

    const range = options?.range;
    const bytes = range
      ? object.bytes.slice(range.offset, range.offset + range.length)
      : object.bytes;
    return {
      ...objectMetadata(key, object.bytes, object.contentType),
      body: streamBytes(bytes),
      bodyUsed: false,
      arrayBuffer: async () => new Uint8Array(bytes).buffer,
      text: async () => new TextDecoder().decode(bytes),
      json: async () => JSON.parse(new TextDecoder().decode(bytes)),
      blob: async () => new Blob([bytes], { type: object.contentType }),
      writeHttpMetadata() {},
    };
  }

  async put(key) {
    this.calls.push({ method: "put", key });
    throw new Error("This delivery proof forbids R2 writes.");
  }

  async delete(key) {
    this.calls.push({ method: "delete", key });
    throw new Error("This delivery proof forbids R2 deletes.");
  }
}

function seedAuthority(database) {
  const insertUser = database.prepare(
    `INSERT INTO users (id, email, normalized_email, status)
     VALUES (?, ?, ?, 'active')`,
  );
  for (const [id, email] of [
    ["user_owner", "owner@example.invalid"],
    ["user_editor", "editor@example.invalid"],
    ["user_customer", "customer@example.invalid"],
  ]) {
    insertUser.run(id, email, email);
  }

  const insertRole = database.prepare(
    `INSERT INTO role_assignments
       (id, user_id, role_key, assigned_by_user_id)
     VALUES (?, ?, ?, 'user_owner')`,
  );
  insertRole.run("role_owner", "user_owner", "owner");
  insertRole.run("role_editor", "user_editor", "editor");
  insertRole.run("role_customer", "user_customer", "customer");
  database
    .prepare(
      `INSERT INTO editor_permissions
         (id, user_id, permission_key, scope_id, assigned_by_user_id)
       VALUES ('permission_delivery_track', 'user_editor', 'catalog.write',
               'delivery-track', 'user_owner')`,
    )
    .run();
  database
    .prepare(
      `INSERT INTO editor_permissions
         (id, user_id, permission_key, scope_id, assigned_by_user_id)
       VALUES ('permission_delivery_media', 'user_editor', 'media.write', '*',
               'user_owner')`,
    )
    .run();
}

function seedAuthorityAndMedia(database) {
  seedAuthority(database);

  database
    .prepare(
      `INSERT INTO media_objects
         (id, object_key, kind, visibility, owner_user_id, content_type,
          byte_length, etag, source_version, status, approval_state,
          content_sha256, duration_ms, channels, sample_rate, revision,
          approved_by_user_id, approved_at)
       VALUES (?, ?, 'audio', 'protected', 'user_owner', 'audio/wav', 48,
               'source-etag', 1, 'ready', 'approved', ?, 1000, 2, 48000, 1,
               'user_owner', CURRENT_TIMESTAMP)`,
    )
    .run(SOURCE_ID, `originals/${SOURCE_ID}/v1`, SHA256);
  database
    .prepare(
      `INSERT INTO media_derivatives
         (id, source_media_id, kind, processing_profile, processing_version,
          object_key, status, approval_state, content_type, format,
          bitrate_kbps, duration_ms, channels, sample_rate, byte_length,
          content_sha256, revision, approved_by_user_id, approved_at)
       VALUES (?, ?, 'streaming', 'stream-main', '1', ?, 'ready', 'approved',
               ?, 'mp3', 192, 1000, 2, 48000, ?, ?, 1, 'user_owner',
               CURRENT_TIMESTAMP)`,
    )
    .run(
      DERIVATIVE_ID,
      SOURCE_ID,
      DERIVATIVE_KEY,
      CONTENT_TYPE,
      AUDIO_BYTES.byteLength,
      SHA256,
    );
}

function trackInput(streamMode) {
  return {
    slug: "delivery-track",
    title: "Delivery track",
    subtitle: null,
    description: "Fictional bytes for an in-memory delivery proof.",
    durationMs: 1_000,
    isrc: null,
    copyrightNotice: "",
    explicit: false,
    viewMode: "public",
    streamMode,
    downloadMode: "unavailable",
    originalMediaId: SOURCE_ID,
    streamingDerivativeId: DERIVATIVE_ID,
    downloadDerivativeId: null,
    tags: ["Fictional"],
    credits: [],
  };
}

let requestSequence = 0;
function mutationContext(idempotencyKey, actorUserId = "user_owner") {
  requestSequence += 1;
  return {
    actorUserId,
    idempotencyKey,
    requestId: `request_delivery_mutation_${requestSequence}`,
  };
}

function sourceRegistrationInput() {
  return {
    id: SOURCE_ID,
    objectKey: `originals/${SOURCE_ID}/v1`,
    kind: "audio",
    visibility: "protected",
    contentType: "audio/wav",
    byteLength: 48,
    etag: "source-etag",
    sourceVersion: 1,
    status: "ready",
    contentSha256: SHA256,
    durationMs: 1_000,
    channels: 2,
    sampleRate: 48_000,
  };
}

function derivativeRegistrationInput() {
  return {
    id: DERIVATIVE_ID,
    sourceMediaId: SOURCE_ID,
    kind: "streaming",
    processingProfile: "stream-main",
    processingVersion: "1",
    objectKey: DERIVATIVE_KEY,
    status: "ready",
    contentType: CONTENT_TYPE,
    format: "mp3",
    bitrateKbps: 192,
    durationMs: 1_000,
    channels: 2,
    sampleRate: 48_000,
    byteLength: AUDIO_BYTES.byteLength,
    contentSha256: SHA256,
  };
}

function identity(userId, roles) {
  return {
    userId,
    email: `${userId}@example.invalid`,
    displayName: userId,
    roles,
  };
}

function deliveryInput(binding, bucket, trackId, overrides = {}) {
  requestSequence += 1;
  return {
    binding,
    bucket,
    request: new Request("https://example.invalid/api/media/stream"),
    requestId: `request_delivery_${requestSequence}`,
    trackId,
    requestedRevisionId: null,
    identity: null,
    ...overrides,
  };
}

async function responseBytes(response) {
  return new Uint8Array(await response.arrayBuffer());
}

async function assertRuntimeCode(promise, expectedCode) {
  await assert.rejects(promise, (error) => {
    assert.equal(error?.name, "RuntimeError");
    assert.equal(error?.code, expectedCode);
    return true;
  });
}

test("approved in-memory track delivery returns 200, 206, and 416 without any R2 write", async (t) => {
  const memory = await createInMemoryD1();
  t.after(() => memory.close());
  seedAuthorityAndMedia(memory.database);
  const bucket = new ReadOnlyMemoryBucket();

  const draft = await saveTrackDraft(
    memory.binding,
    trackInput("public"),
    0,
    mutationContext("public-draft"),
  );
  await publishTrack(
    memory.binding,
    "delivery-track",
    1,
    mutationContext("public-publish"),
  );

  const publicTrack = await readPublicTrack(memory.binding, "delivery-track");
  assert.equal(
    publicTrack.tracks[0].track.streamUrl,
    `/api/media/tracks/${encodeURIComponent(draft.value.id)}/stream?revision=${encodeURIComponent(draft.value.revisionId)}`,
  );
  const publicJson = JSON.stringify(publicTrack);
  assert.equal(publicJson.includes(DERIVATIVE_KEY), false);
  assert.equal(publicJson.includes(DERIVATIVE_ID), false);
  assert.equal(publicJson.includes(SHA256), false);

  const fullInput = deliveryInput(memory.binding, bucket, draft.value.id);
  const full = await deliverTrackStream(fullInput);
  assert.equal(full.status, 200);
  assert.equal(full.headers.get("content-type"), CONTENT_TYPE);
  assert.equal(
    full.headers.get("content-length"),
    String(AUDIO_BYTES.byteLength),
  );
  assert.equal(full.headers.get("cache-control"), "no-store");
  assert.equal(full.headers.get("x-request-id"), fullInput.requestId);
  assert.equal(full.headers.get("x-aop-access-source"), "public");
  assert.deepEqual(await responseBytes(full), AUDIO_BYTES);
  assert.deepEqual(bucket.calls, [
    { method: "head", key: DERIVATIVE_KEY },
    { method: "get", key: DERIVATIVE_KEY, options: null },
  ]);

  bucket.clearCalls();
  const partialInput = deliveryInput(memory.binding, bucket, draft.value.id, {
    request: new Request("https://example.invalid/api/media/stream", {
      headers: { range: "bytes=2-5" },
    }),
  });
  const partial = await deliverTrackStream(partialInput);
  assert.equal(partial.status, 206);
  assert.equal(partial.headers.get("content-range"), "bytes 2-5/12");
  assert.equal(partial.headers.get("content-length"), "4");
  assert.deepEqual(await responseBytes(partial), AUDIO_BYTES.slice(2, 6));
  assert.deepEqual(bucket.calls, [
    { method: "head", key: DERIVATIVE_KEY },
    {
      method: "get",
      key: DERIVATIVE_KEY,
      options: { range: { offset: 2, length: 4 } },
    },
  ]);

  for (const range of ["bytes=99-100", "bytes=0-1,4-5"]) {
    bucket.clearCalls();
    const rejectedRange = await deliverTrackStream(
      deliveryInput(memory.binding, bucket, draft.value.id, {
        request: new Request("https://example.invalid/api/media/stream", {
          headers: { range },
        }),
      }),
    );
    assert.equal(rejectedRange.status, 416);
    assert.equal(rejectedRange.headers.get("content-range"), "bytes */12");
    assert.deepEqual(await responseBytes(rejectedRange), new Uint8Array());
    assert.deepEqual(bucket.calls, [], `R2 must not be read for ${range}.`);
  }

  assert.equal(
    bucket.calls.some(({ method }) => method === "put" || method === "delete"),
    false,
  );
});

test("media runtime failures write sanitized idempotent operational evidence", async (t) => {
  const memory = await createInMemoryD1();
  t.after(() => memory.close());
  seedAuthorityAndMedia(memory.database);

  const draft = await saveTrackDraft(
    memory.binding,
    trackInput("public"),
    0,
    mutationContext("failure-evidence-draft"),
  );
  await publishTrack(
    memory.binding,
    "delivery-track",
    1,
    mutationContext("failure-evidence-publish"),
  );

  const mismatchBucket = new ReadOnlyMemoryBucket();
  mismatchBucket.objects.set(DERIVATIVE_KEY, {
    bytes: new Uint8Array(AUDIO_BYTES),
    contentType: "audio/ogg",
  });
  const mismatchInput = deliveryInput(
    memory.binding,
    mismatchBucket,
    draft.value.id,
  );
  await assertRuntimeCode(
    deliverTrackStream(mismatchInput),
    "MEDIA_METADATA_MISMATCH",
  );
  await assertRuntimeCode(
    deliverTrackStream(mismatchInput),
    "MEDIA_METADATA_MISMATCH",
  );

  const mismatchRows = memory.database
    .prepare(
      `SELECT component, code, severity, request_id, subject_type, subject_id,
              occurrence_count
       FROM operational_failures
       WHERE request_id = ?`,
    )
    .all(mismatchInput.requestId)
    .map((row) => ({ ...row }));
  assert.deepEqual(mismatchRows, [
    {
      component: "media",
      code: "MEDIA_METADATA_MISMATCH",
      severity: "error",
      request_id: mismatchInput.requestId,
      subject_type: "media-derivative",
      subject_id: DERIVATIVE_ID,
      occurrence_count: 1,
    },
  ]);

  const missingBucket = new ReadOnlyMemoryBucket();
  missingBucket.objects.clear();
  const missingInput = deliveryInput(
    memory.binding,
    missingBucket,
    draft.value.id,
  );
  await assertRuntimeCode(deliverTrackStream(missingInput), "MEDIA_NOT_FOUND");

  const unreadableBucket = new ReadOnlyMemoryBucket();
  unreadableBucket.head = async () => {
    throw new Error("Fictional in-memory storage read failure.");
  };
  const unreadableInput = deliveryInput(
    memory.binding,
    unreadableBucket,
    draft.value.id,
  );
  await assert.rejects(
    deliverTrackStream(unreadableInput),
    /Fictional in-memory storage read failure/,
  );

  const rows = memory.database
    .prepare(
      `SELECT code, request_id, subject_type, subject_id
       FROM operational_failures
       ORDER BY code`,
    )
    .all()
    .map((row) => ({ ...row }));
  assert.deepEqual(rows, [
    {
      code: "MEDIA_METADATA_MISMATCH",
      request_id: mismatchInput.requestId,
      subject_type: "media-derivative",
      subject_id: DERIVATIVE_ID,
    },
    {
      code: "MEDIA_OBJECT_MISSING",
      request_id: missingInput.requestId,
      subject_type: "media-derivative",
      subject_id: DERIVATIVE_ID,
    },
    {
      code: "MEDIA_STORAGE_READ_FAILED",
      request_id: unreadableInput.requestId,
      subject_type: "media-derivative",
      subject_id: DERIVATIVE_ID,
    },
  ]);
  assert.doesNotMatch(
    JSON.stringify(rows),
    /derivatives\/|Fictional in-memory storage read failure/,
  );

  await assert.rejects(
    recordMediaOperationalFailure(memory.binding, {
      code: "UNSAFE_DYNAMIC_CODE",
      requestId: "request_delivery_invalid_code_0001",
      subjectType: "media-derivative",
      subjectId: DERIVATIVE_ID,
    }),
    /allowlisted operational-failure code/i,
  );
  await assert.rejects(
    recordMediaOperationalFailure(memory.binding, {
      code: "MEDIA_OBJECT_MISSING",
      requestId: "request_delivery_invalid_subject_0001",
      subjectType: "media-derivative",
      subjectId: "derivatives/private/object",
    }),
    /safe internal operational-failure subject/i,
  );
  await assert.rejects(
    recordMediaOperationalFailure(memory.binding, {
      code: "MEDIA_OBJECT_MISSING",
      requestId: "request_delivery_provider_subject_0001",
      subjectType: "media-derivative",
      subjectId: "cus_FictionalCustomerObject0005",
    }),
    /safe internal operational-failure subject/i,
  );
  await assert.rejects(
    recordMediaOperationalFailure(memory.binding, {
      code: "MEDIA_OBJECT_MISSING",
      requestId: "sk_test_FictionalBoundaryValue0001",
      subjectType: "media-derivative",
      subjectId: DERIVATIVE_ID,
    }),
    /safe server request ID/i,
  );
});

test("account and protected delivery denials make no R2 read while authorized identities stream", async (t) => {
  const memory = await createInMemoryD1();
  t.after(() => memory.close());
  seedAuthorityAndMedia(memory.database);
  const bucket = new ReadOnlyMemoryBucket();

  const publicDraft = await saveTrackDraft(
    memory.binding,
    trackInput("public"),
    0,
    mutationContext("access-public-draft"),
  );
  await publishTrack(
    memory.binding,
    "delivery-track",
    1,
    mutationContext("access-public-publish"),
  );

  await saveTrackDraft(
    memory.binding,
    trackInput("account"),
    2,
    mutationContext("access-account-draft"),
  );
  await publishTrack(
    memory.binding,
    "delivery-track",
    3,
    mutationContext("access-account-publish"),
  );

  bucket.clearCalls();
  await assertRuntimeCode(
    deliverTrackStream(
      deliveryInput(memory.binding, bucket, publicDraft.value.id),
    ),
    "ACCESS_DENIED",
  );
  assert.deepEqual(bucket.calls, []);

  bucket.clearCalls();
  await assertRuntimeCode(
    deliverTrackStream(
      deliveryInput(memory.binding, bucket, publicDraft.value.id, {
        requestedRevisionId: publicDraft.value.revisionId,
      }),
    ),
    "MEDIA_NOT_FOUND",
  );
  assert.deepEqual(bucket.calls, []);

  bucket.clearCalls();
  const account = await deliverTrackStream(
    deliveryInput(memory.binding, bucket, publicDraft.value.id, {
      identity: identity("user_customer", ["customer"]),
    }),
  );
  assert.equal(account.status, 200);
  assert.equal(account.headers.get("x-aop-access-source"), "account");
  assert.deepEqual(await responseBytes(account), AUDIO_BYTES);
  assert.deepEqual(
    bucket.calls.map(({ method }) => method),
    ["head", "get"],
  );

  await saveTrackDraft(
    memory.binding,
    trackInput("protected"),
    4,
    mutationContext("access-protected-draft"),
  );
  await publishTrack(
    memory.binding,
    "delivery-track",
    5,
    mutationContext("access-protected-publish"),
  );

  bucket.clearCalls();
  await assertRuntimeCode(
    deliverTrackStream(
      deliveryInput(memory.binding, bucket, publicDraft.value.id, {
        identity: identity("user_customer", ["customer"]),
      }),
    ),
    "ACCESS_DENIED",
  );
  assert.deepEqual(bucket.calls, []);

  bucket.clearCalls();
  const editor = await deliverTrackStream(
    deliveryInput(memory.binding, bucket, publicDraft.value.id, {
      identity: identity("user_editor", ["editor"]),
    }),
  );
  assert.equal(editor.status, 200);
  assert.equal(editor.headers.get("x-aop-access-source"), "role");
  assert.deepEqual(await responseBytes(editor), AUDIO_BYTES);
  assert.deepEqual(
    bucket.calls.map(({ method }) => method),
    ["head", "get"],
  );

  bucket.clearCalls();
  await assertRuntimeCode(
    deliverTrackStream(deliveryInput(memory.binding, bucket, "track_missing")),
    "MEDIA_NOT_FOUND",
  );
  assert.deepEqual(bucket.calls, []);
  assert.equal(
    bucket.calls.some(({ method }) => method === "put" || method === "delete"),
    false,
  );
});

test("revoked media editor cannot stream a protected track from source registration ownership", async (t) => {
  const memory = await createInMemoryD1();
  t.after(() => memory.close());
  seedAuthority(memory.database);
  const bucket = new ReadOnlyMemoryBucket();

  const source = await registerMediaSource(
    memory.binding,
    sourceRegistrationInput(),
    mutationContext("revoked-source-register", "user_editor"),
  );
  assert.equal(source.value.approvalState, "pending");
  assert.deepEqual(
    {
      ...memory.database
        .prepare(
          `SELECT owner_user_id, approval_state, revision
           FROM media_objects WHERE id = ?`,
        )
        .get(SOURCE_ID),
    },
    {
      owner_user_id: "user_editor",
      approval_state: "pending",
      revision: 1,
    },
  );

  await setMediaSourceApproval(
    memory.binding,
    SOURCE_ID,
    1,
    "approved",
    mutationContext("revoked-source-approve"),
  );
  await registerMediaDerivative(
    memory.binding,
    derivativeRegistrationInput(),
    mutationContext("revoked-derivative-register", "user_editor"),
  );
  await setMediaDerivativeApproval(
    memory.binding,
    DERIVATIVE_ID,
    1,
    "approved",
    mutationContext("revoked-derivative-approve", "user_editor"),
  );

  const draft = await saveTrackDraft(
    memory.binding,
    trackInput("protected"),
    0,
    mutationContext("revoked-track-draft"),
  );
  await publishTrack(
    memory.binding,
    "delivery-track",
    1,
    mutationContext("revoked-track-publish"),
  );

  memory.database
    .prepare(
      `UPDATE role_assignments
       SET revoked_at = CURRENT_TIMESTAMP
       WHERE user_id = 'user_editor' AND revoked_at IS NULL`,
    )
    .run();
  memory.database
    .prepare(
      `UPDATE editor_permissions
       SET revoked_at = CURRENT_TIMESTAMP
       WHERE user_id = 'user_editor' AND revoked_at IS NULL`,
    )
    .run();

  const formerEditor = await resolveApplicationIdentity(memory.binding, {
    email: "editor@example.invalid",
    fullName: "Former Media Editor",
    displayName: "Former Media Editor",
  });
  assert.deepEqual(formerEditor, {
    userId: "user_editor",
    email: "editor@example.invalid",
    displayName: "Former Media Editor",
    roles: [],
  });
  assert.deepEqual(
    {
      ...memory.database
        .prepare(
          `SELECT status,
                  (SELECT COUNT(*) FROM role_assignments
                   WHERE user_id = users.id AND revoked_at IS NULL) AS roles,
                  (SELECT COUNT(*) FROM editor_permissions
                   WHERE user_id = users.id AND revoked_at IS NULL) AS permissions
           FROM users WHERE id = 'user_editor'`,
        )
        .get(),
    },
    { status: "active", roles: 0, permissions: 0 },
  );

  bucket.clearCalls();
  await assertRuntimeCode(
    deliverTrackStream(
      deliveryInput(memory.binding, bucket, draft.value.id, {
        identity: formerEditor,
      }),
    ),
    "ACCESS_DENIED",
  );
  assert.deepEqual(bucket.calls, []);
});
