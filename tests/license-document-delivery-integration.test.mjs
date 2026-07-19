import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";

import { createInMemoryD1, scalar } from "./helpers/in-memory-d1.mjs";

register(
  new URL("./helpers/typescript-alias-loader.mjs", import.meta.url),
  import.meta.url,
);

const [
  { generateLicenseDocument },
  { deliverLicenseDocument },
  workflow,
  licensing,
] = await Promise.all([
  import("../lib/licensing/document-generation.ts"),
  import("../lib/licensing/document-delivery.ts"),
  import("../db/license-document-workflow.ts"),
  import("../db/licensing-write.ts"),
]);

const {
  approveLicenseRequest,
  createLicenseOffer,
  createLicenseTerms,
  issueLicense,
  submitLicenseRequest,
} = licensing;

const OWNER_ID = "user_document_owner";
const CUSTOMER_ID = "user_document_customer";
const OTHER_CUSTOMER_ID = "user_document_other";
const TRACK_ID = "track_document_fictional";
const TRACK_REVISION_ID = "track_revision_document_fictional";
const PRODUCT_ID = "commerce_product_document_fictional";
const PRICE_ID = "commerce_price_document_fictional";

function context(actorUserId, key) {
  return {
    actorUserId,
    idempotencyKey: key,
    requestId: `request.${key}`,
  };
}

function identity(userId, roles = ["customer"]) {
  return {
    userId,
    email: `${userId}@example.invalid`,
    displayName: userId,
    roles,
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
    uploaded: new Date("2026-07-19T00:00:00.000Z"),
    httpMetadata: { contentType: value.contentType },
    customMetadata: {},
    storageClass: "Standard",
  };
}

class MemoryR2Bucket {
  constructor() {
    this.calls = [];
    this.objects = new Map();
    this.failedPutsRemaining = 0;
  }

  clearCalls() {
    this.calls.length = 0;
  }

  async put(key, value, options) {
    this.calls.push({ method: "put", key, options });
    if (this.failedPutsRemaining > 0) {
      this.failedPutsRemaining -= 1;
      throw new Error("Fictional in-memory R2 write failure.");
    }
    assert.ok(value instanceof Uint8Array);
    const stored = {
      bytes: new Uint8Array(value),
      contentType: options?.httpMetadata?.contentType,
    };
    this.objects.set(key, stored);
    return metadata(key, stored);
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

  async delete(key) {
    this.calls.push({ method: "delete", key });
    this.objects.delete(key);
  }
}

function licenseTermsInput() {
  return {
    slug: "document-sync-terms",
    state: "active",
    name: "Synchronization terms",
    title: "Artist synchronization license",
    introduction: "Fictional artist-authored introduction.",
    generalTerms: "Fictional artist-authored general terms.",
    disclaimer: "Fictional artist-authored disclaimer.",
    options: [
      {
        optionKey: "independent-film",
        label: "Independent film",
        description: "A fictional synchronization use.",
        usageCategory: "Synchronization",
        allowedMedia: ["Film", "Festival trailer"],
        audienceLabel: "Festival audiences",
        maxAudience: 100000,
        distributionLabel: "One finished production",
        maxCopies: 1,
        termMonths: 12,
        territory: "Worldwide",
        attributionRequired: true,
        attributionText: "Music by the artist",
        exclusive: false,
        requiresApproval: true,
        licenseCreditCost: 1,
        includesTrackDownload: true,
      },
    ],
  };
}

async function setup() {
  const memory = await createInMemoryD1();
  memory.database.exec(`
    INSERT INTO users (id, email, normalized_email, status)
    VALUES
      ('${OWNER_ID}', 'document-owner@example.invalid',
       'document-owner@example.invalid', 'active'),
      ('${CUSTOMER_ID}', 'document-customer@example.invalid',
       'document-customer@example.invalid', 'active'),
      ('${OTHER_CUSTOMER_ID}', 'document-other@example.invalid',
       'document-other@example.invalid', 'active');
    INSERT INTO role_assignments
      (id, user_id, role_key, assigned_by_user_id)
    VALUES
      ('role_document_owner', '${OWNER_ID}', 'owner', '${OWNER_ID}'),
      ('role_document_customer', '${CUSTOMER_ID}', 'customer', '${OWNER_ID}'),
      ('role_document_other', '${OTHER_CUSTOMER_ID}', 'customer', '${OWNER_ID}');

    INSERT INTO tracks
      (id, slug, draft_revision_id, published_revision_id,
       publication_state, published_at)
    VALUES
      ('${TRACK_ID}', 'fictional-document-track', '${TRACK_REVISION_ID}',
       '${TRACK_REVISION_ID}', 'published', '2026-07-19T10:00:00.000Z');
    INSERT INTO track_revisions
      (id, track_id, revision, title, view_mode, stream_mode,
       download_mode, tags_json)
    VALUES
      ('${TRACK_REVISION_ID}', '${TRACK_ID}', 1,
       'Fictional Document Track', 'protected', 'protected', 'protected', '[]');

    INSERT INTO commerce_products
      (id, slug, name, description, product_type, resource_type,
       resource_id, state, revision)
    VALUES
      ('${PRODUCT_ID}', 'fictional-document-license',
       'Fictional document license', 'Test-only fictional license product.',
       'license', 'track', '${TRACK_ID}', 'active', 1);
    INSERT INTO commerce_prices
      (id, commerce_product_id, amount_minor, currency, billing_interval,
       interval_count, stripe_price_id, active, stripe_environment,
       livemode, revision)
    VALUES
      ('${PRICE_ID}', '${PRODUCT_ID}', 2500, 'USD', 'one_time', 1,
       'price_test_aop_document_001', 1, 'test', 0, 1);
  `);

  const createdTerms = await createLicenseTerms(
    memory.binding,
    licenseTermsInput(),
    context(OWNER_ID, "document.terms.create"),
  );
  const createdOffer = await createLicenseOffer(
    memory.binding,
    {
      slug: "fictional-document-license",
      trackId: TRACK_ID,
      trackRevisionId: TRACK_REVISION_ID,
      licenseTermsId: createdTerms.value.licenseTermsId,
      licenseTermsVersion: 1,
      licenseOptionId: createdTerms.value.optionIds[0],
      commerceProductId: PRODUCT_ID,
      commercePriceId: PRICE_ID,
      state: "active",
    },
    context(OWNER_ID, "document.offer.create"),
  );
  const submitted = await submitLicenseRequest(
    memory.binding,
    {
      licenseOfferId: createdOffer.value.licenseOfferId,
      licenseeName: "Fictional Licensee",
      projectTitle: "Fictional Film",
      intendedUse: "Opening credits in a fictional production",
      projectDescription: "A fictional independent production for testing.",
    },
    context(CUSTOMER_ID, "document.request.submit"),
  );
  await approveLicenseRequest(
    memory.binding,
    submitted.value.licenseRequestId,
    {
      expectedRevision: 1,
      decidedAt: "2026-01-19T11:30:00.000Z",
      reason: "The fictional intended use matches the frozen terms.",
    },
    context(OWNER_ID, "document.request.approve"),
  );
  const issued = await issueLicense(
    memory.binding,
    {
      source: "owner_approval",
      licenseRequestId: submitted.value.licenseRequestId,
      expectedRevision: 2,
      issuedAt: "2026-01-19T12:00:00.000Z",
    },
    context(OWNER_ID, "document.license.issue"),
  );
  return { memory, issued: issued.value };
}

function assertRuntimeCode(expectedCode) {
  return (error) => {
    assert.equal(error?.name, "RuntimeError");
    assert.equal(error?.code, expectedCode);
    return true;
  };
}

test("owner generation renders the immutable snapshot to protected R2 and exact replay writes nothing", async (t) => {
  const { memory, issued } = await setup();
  t.after(() => memory.close());
  const bucket = new MemoryR2Bucket();
  const generationContext = context(OWNER_ID, "document.generate.ready");

  const generated = await generateLicenseDocument(
    memory.binding,
    bucket,
    { licenseDocumentId: issued.documentId, expectedRevision: 1 },
    generationContext,
  );
  assert.equal(generated.replayed, false);
  assert.equal(generated.value.state, "ready");
  assert.equal(generated.value.jobStatus, "complete");
  assert.equal(generated.value.attempts, 1);
  assert.equal(generated.value.stripeEnvironment, "test");
  assert.equal(generated.value.livemode, false);
  assert.equal(JSON.stringify(generated.value).includes("objectKey"), false);
  assert.equal(bucket.objects.size, 1);
  assert.equal(bucket.calls.filter(({ method }) => method === "put").length, 1);

  const storedText = new TextDecoder().decode(
    [...bucket.objects.values()][0].bytes,
  );
  assert.match(
    storedText,
    /^Stripe Test Mode\nNo real payment will be accepted\./,
  );
  assert.match(storedText, /Licensee: Fictional Licensee/);
  assert.match(storedText, /Project: Fictional Film/);
  assert.match(storedText, /Fictional artist-authored general terms\./);

  const row = memory.database
    .prepare(
      `SELECT document.state, document.media_object_id,
              document.content_digest, document.byte_length,
              document.revision, job.status AS job_status, job.attempts,
              media.kind, media.visibility, media.status AS media_status,
              media.approval_state, media.content_type,
              media.content_sha256, media.object_key
       FROM license_documents document
       JOIN license_document_jobs job ON job.license_document_id = document.id
       JOIN media_objects media ON media.id = document.media_object_id
       WHERE document.id = ?1`,
    )
    .get(issued.documentId);
  assert.deepEqual(
    {
      state: row.state,
      revision: row.revision,
      jobStatus: row.job_status,
      attempts: row.attempts,
      kind: row.kind,
      visibility: row.visibility,
      approvalState: row.approval_state,
      contentType: row.content_type,
    },
    {
      state: "ready",
      revision: 3,
      jobStatus: "complete",
      attempts: 1,
      kind: "document",
      visibility: "protected",
      approvalState: "approved",
      contentType: "text/plain; charset=utf-8",
    },
  );
  assert.equal(row.content_digest, row.content_sha256);
  assert.equal(row.byte_length, [...bucket.objects.values()][0].bytes.length);
  assert.match(
    row.object_key,
    /^originals\/license_document_media_[a-f0-9]{32}\/v1$/,
  );
  assert.equal(
    scalar(
      memory.database,
      `SELECT COUNT(*) FROM license_events
       WHERE issued_license_id = ?1 AND event_type = 'document_ready'`,
      issued.issuedLicenseId,
    ),
    1,
  );

  const replay = await generateLicenseDocument(
    memory.binding,
    bucket,
    { licenseDocumentId: issued.documentId, expectedRevision: 1 },
    generationContext,
  );
  assert.equal(replay.replayed, true);
  assert.deepEqual(replay.value, generated.value);
  assert.equal(bucket.calls.filter(({ method }) => method === "put").length, 1);

  const alreadyReady = await generateLicenseDocument(
    memory.binding,
    bucket,
    { licenseDocumentId: issued.documentId, expectedRevision: 3 },
    context(OWNER_ID, "document.generate.already-ready"),
  );
  assert.equal(alreadyReady.replayed, true);
  assert.equal(bucket.calls.filter(({ method }) => method === "put").length, 1);
  assert.deepEqual(
    memory.database.prepare("PRAGMA foreign_key_check").all(),
    [],
  );
});

test("protected document delivery decides central access before R2 and records redacted evidence", async (t) => {
  const { memory, issued } = await setup();
  t.after(() => memory.close());
  const bucket = new MemoryR2Bucket();
  await generateLicenseDocument(
    memory.binding,
    bucket,
    { licenseDocumentId: issued.documentId, expectedRevision: 1 },
    context(OWNER_ID, "document.generate.delivery"),
  );

  bucket.clearCalls();
  await assert.rejects(
    deliverLicenseDocument({
      binding: memory.binding,
      bucket,
      requestId: "request.document.delivery.denied",
      licenseDocumentId: issued.documentId,
      identity: identity(OTHER_CUSTOMER_ID),
    }),
    assertRuntimeCode("ACCESS_DENIED"),
  );
  assert.deepEqual(bucket.calls, []);

  const response = await deliverLicenseDocument({
    binding: memory.binding,
    bucket,
    requestId: "request.document.delivery.allowed",
    licenseDocumentId: issued.documentId,
    identity: identity(CUSTOMER_ID),
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-aop-access-source"), "license");
  assert.equal(response.headers.get("x-aop-commerce-environment"), "test");
  assert.match(
    response.headers.get("content-disposition"),
    /^attachment; filename="a-op-license-/,
  );
  assert.match(await response.text(), /No real payment will be accepted\./);
  assert.deepEqual(
    bucket.calls.map(({ method }) => method),
    ["head", "get"],
  );

  const audit = memory.database
    .prepare(
      `SELECT details_json, result_json FROM audit_events
       WHERE action = 'license.document.deliver' AND request_id = ?1`,
    )
    .get("request.document.delivery.allowed");
  assert.equal(typeof audit.details_json, "string");
  assert.equal(audit.details_json.includes("object_key"), false);
  assert.equal(audit.details_json.includes("originals/"), false);
  assert.equal(audit.details_json.includes("example.invalid"), false);
  assert.deepEqual(JSON.parse(audit.result_json), {
    delivered: true,
    documentId: issued.documentId,
  });

  memory.database
    .prepare(
      `UPDATE entitlements
       SET state = 'revoked', revision = revision + 1
       WHERE source_type = 'license' AND source_id = ?1
         AND resource_type = 'license-document'`,
    )
    .run(issued.issuedLicenseId);
  bucket.clearCalls();
  await assert.rejects(
    deliverLicenseDocument({
      binding: memory.binding,
      bucket,
      requestId: "request.document.delivery.revoked",
      licenseDocumentId: issued.documentId,
      identity: identity(CUSTOMER_ID),
    }),
    assertRuntimeCode("ACCESS_DENIED"),
  );
  assert.deepEqual(bucket.calls, []);
});

test("a failed R2 write leaves a durable retryable job and the same operation can finish safely", async (t) => {
  const { memory, issued } = await setup();
  t.after(() => memory.close());
  const bucket = new MemoryR2Bucket();
  bucket.failedPutsRemaining = 1;
  const generationContext = context(OWNER_ID, "document.generate.retry");

  await assert.rejects(
    generateLicenseDocument(
      memory.binding,
      bucket,
      { licenseDocumentId: issued.documentId, expectedRevision: 1 },
      generationContext,
    ),
    assertRuntimeCode("LICENSE_DOCUMENT_GENERATION_FAILED"),
  );
  const failed = memory.database
    .prepare(
      `SELECT document.state, document.revision,
              document.failure_category AS document_failure,
              job.status, job.attempts, job.failure_category AS job_failure,
              job.lease_token
       FROM license_documents document
       JOIN license_document_jobs job ON job.license_document_id = document.id
       WHERE document.id = ?1`,
    )
    .get(issued.documentId);
  assert.deepEqual(
    { ...failed },
    {
      state: "failed",
      revision: 3,
      document_failure: "storage_write_failed",
      status: "failed",
      attempts: 1,
      job_failure: "storage_write_failed",
      lease_token: null,
    },
  );
  assert.equal(bucket.objects.size, 0);

  const retried = await generateLicenseDocument(
    memory.binding,
    bucket,
    { licenseDocumentId: issued.documentId, expectedRevision: 3 },
    generationContext,
  );
  assert.equal(retried.replayed, false);
  assert.equal(retried.value.state, "ready");
  assert.equal(retried.value.revision, 5);
  assert.equal(retried.value.attempts, 2);
  assert.equal(bucket.objects.size, 1);
  assert.deepEqual(
    memory.database
      .prepare(
        `SELECT event_type FROM license_events
         WHERE issued_license_id = ?1
           AND event_type IN ('document_failed', 'document_ready')
         ORDER BY rowid`,
      )
      .all(issued.issuedLicenseId)
      .map((row) => ({ ...row })),
    [{ event_type: "document_failed" }, { event_type: "document_ready" }],
  );
});

test("a customer cannot claim a document job or touch R2", async (t) => {
  const { memory, issued } = await setup();
  t.after(() => memory.close());
  const bucket = new MemoryR2Bucket();
  await assert.rejects(
    generateLicenseDocument(
      memory.binding,
      bucket,
      { licenseDocumentId: issued.documentId, expectedRevision: 1 },
      context(CUSTOMER_ID, "document.generate.denied"),
    ),
    assertRuntimeCode("LICENSE_DOCUMENT_OWNER_REQUIRED"),
  );
  assert.deepEqual(bucket.calls, []);
  assert.equal(
    scalar(
      memory.database,
      `SELECT attempts FROM license_document_jobs
       WHERE license_document_id = ?1`,
      issued.documentId,
    ),
    0,
  );
});

test("an expired interrupted lease resumes from the durable processing state", async (t) => {
  const { memory, issued } = await setup();
  t.after(() => memory.close());
  const bucket = new MemoryR2Bucket();
  const record = await workflow.readLicenseDocumentWorkflowRecord(
    memory.binding,
    issued.documentId,
  );
  assert.ok(record);
  await workflow.claimLicenseDocumentJob(memory.binding, {
    record,
    expectedRevision: 1,
    actorUserId: OWNER_ID,
    operationKey: "license.document.generate:interrupted",
    workerId: "license_document_worker_interrupted",
    leaseToken: "license_document_lease_interrupted",
    claimedAt: "2026-01-19T12:05:00.000Z",
    leaseExpiresAt: "2026-01-19T12:10:00.000Z",
  });

  const resumed = await generateLicenseDocument(
    memory.binding,
    bucket,
    { licenseDocumentId: issued.documentId, expectedRevision: 2 },
    context(OWNER_ID, "document.generate.resume"),
  );
  assert.equal(resumed.value.state, "ready");
  assert.equal(resumed.value.attempts, 2);
  assert.equal(resumed.value.revision, 4);
  assert.equal(bucket.objects.size, 1);
});
