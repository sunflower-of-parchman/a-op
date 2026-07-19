import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";

import { createInMemoryD1 } from "./helpers/in-memory-d1.mjs";

register(
  new URL("./helpers/typescript-alias-loader.mjs", import.meta.url),
  import.meta.url,
);

const { deliverCourseLessonMedia } = await import("../lib/courses/delivery.ts");

const OWNER_ID = "user_course_delivery_owner";
const CUSTOMER_ID = "user_course_delivery_customer";
const OTHER_CUSTOMER_ID = "user_course_delivery_other";
const SOURCE_ID = "media_course_delivery_source";
const AUDIO_DERIVATIVE_ID = "derivative_course_delivery_audio";
const DOWNLOAD_DERIVATIVE_ID = "derivative_course_delivery_download";
const AUDIO_KEY = "derivatives/media_course_delivery_source/audio-v1";
const DOWNLOAD_KEY = "derivatives/media_course_delivery_source/download-v1";
const AUDIO_TYPE = "audio/mpeg";
const DOWNLOAD_TYPE = "text/plain";
const AUDIO_BYTES = Uint8Array.from([
  0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x41, 0x4f, 0x50, 0x2d, 0x30, 0x31,
]);
const DOWNLOAD_BYTES = new TextEncoder().encode("fictional course notes\n");
const SHA256 = "a".repeat(64);

function identity(userId) {
  return {
    userId,
    email: `${userId}@example.invalid`,
    displayName: userId,
    roles: ["customer"],
  };
}

function objectMetadata(key, object) {
  return {
    key,
    version: "memory-version",
    size: object.bytes.byteLength,
    etag: "memory-etag",
    httpEtag: '"memory-etag"',
    checksums: {},
    uploaded: new Date("2026-07-19T00:00:00.000Z"),
    httpMetadata: { contentType: object.contentType },
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
        AUDIO_KEY,
        { bytes: new Uint8Array(AUDIO_BYTES), contentType: AUDIO_TYPE },
      ],
      [
        DOWNLOAD_KEY,
        {
          bytes: new Uint8Array(DOWNLOAD_BYTES),
          contentType: DOWNLOAD_TYPE,
        },
      ],
    ]);
  }

  clearCalls() {
    this.calls.length = 0;
  }

  async head(key) {
    this.calls.push({ method: "head", key });
    const object = this.objects.get(key);
    return object ? objectMetadata(key, object) : null;
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
      ...objectMetadata(key, object),
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
    throw new Error("Course delivery verification forbids R2 writes.");
  }

  async delete(key) {
    this.calls.push({ method: "delete", key });
    throw new Error("Course delivery verification forbids R2 deletes.");
  }
}

function seedCourse(database, input) {
  const courseId = `course_${input.slug.replaceAll("-", "_")}`;
  const revisionId = `revision_${input.slug.replaceAll("-", "_")}`;
  const sectionId = `section_${input.slug.replaceAll("-", "_")}`;
  const lessonId = `lesson_${input.slug.replaceAll("-", "_")}`;
  const lessonSlug = `${input.slug}-lesson`;
  database
    .prepare(
      `INSERT INTO courses
         (id, slug, draft_revision_id, published_revision_id,
          publication_state, published_at)
       VALUES (?, ?, ?, ?, 'published', '2026-07-19T10:00:00.000Z')`,
    )
    .run(courseId, input.slug, revisionId, revisionId);
  database
    .prepare(
      `INSERT INTO course_revisions
         (id, course_id, revision, title, description, access_mode,
          access_plan_id, access_plan_revision, created_by_user_id)
       VALUES (?, ?, 1, ?, 'Fictional in-memory delivery proof.', ?, ?, ?, ?)`,
    )
    .run(
      revisionId,
      courseId,
      input.title,
      input.accessMode,
      input.accessMode === "protected" ? "plan_course_delivery" : null,
      input.accessMode === "protected" ? 1 : null,
      OWNER_ID,
    );
  database
    .prepare(
      `INSERT INTO course_sections
         (id, course_revision_id, section_key, position, title, description)
       VALUES (?, ?, 'begin', 1, 'Begin', 'Fictional section.')`,
    )
    .run(sectionId, revisionId);
  database
    .prepare(
      `INSERT INTO lessons
         (id, course_revision_id, course_section_id, lesson_key, slug,
          position, title, summary, access_mode)
       VALUES (?, ?, ?, 'delivery-lesson', ?, 1, 'Delivery lesson',
               'Fictional lesson.', 'inherit')`,
    )
    .run(lessonId, revisionId, sectionId, lessonSlug);
  database
    .prepare(
      `INSERT INTO lesson_items
         (id, lesson_id, item_key, position, item_type, content_json,
          media_derivative_id, transcript_text)
       VALUES (?, ?, 'audio', 1, 'audio',
               '{"text":"","caption":"Fictional audio","filename":null}',
               ?, 'A fictional audio transcript.')`,
    )
    .run(
      `item_${input.slug.replaceAll("-", "_")}_audio`,
      lessonId,
      AUDIO_DERIVATIVE_ID,
    );

  if (input.includeDownload) {
    database
      .prepare(
        `INSERT INTO lesson_items
           (id, lesson_id, item_key, position, item_type, content_json,
            media_derivative_id)
         VALUES (?, ?, 'worksheet', 2, 'download',
                 '{"text":"","caption":"Fictional notes","filename":"practice-notes.txt"}',
                 ?)`,
      )
      .run(
        `item_${input.slug.replaceAll("-", "_")}_download`,
        lessonId,
        DOWNLOAD_DERIVATIVE_ID,
      );
  }

  return { courseId, revisionId, lessonId, lessonSlug };
}

function seed(database) {
  database.exec(`
    INSERT INTO users (id, email, normalized_email, status)
    VALUES
      ('${OWNER_ID}', 'course-owner@example.invalid',
       'course-owner@example.invalid', 'active'),
      ('${CUSTOMER_ID}', 'course-customer@example.invalid',
       'course-customer@example.invalid', 'active'),
      ('${OTHER_CUSTOMER_ID}', 'course-other@example.invalid',
       'course-other@example.invalid', 'active');

    INSERT INTO role_assignments
      (id, user_id, role_key, assigned_by_user_id)
    VALUES
      ('role_course_delivery_owner', '${OWNER_ID}', 'owner', '${OWNER_ID}'),
      ('role_course_delivery_customer', '${CUSTOMER_ID}', 'customer', '${OWNER_ID}'),
      ('role_course_delivery_other', '${OTHER_CUSTOMER_ID}', 'customer', '${OWNER_ID}');

    UPDATE artist_modules
    SET active = 1, activated_at = CURRENT_TIMESTAMP
    WHERE module_key = 'courses';

    INSERT INTO media_objects
      (id, object_key, kind, visibility, owner_user_id, content_type,
       byte_length, etag, source_version, status, approval_state,
       content_sha256, revision, approved_by_user_id, approved_at)
    VALUES
      ('${SOURCE_ID}', 'originals/${SOURCE_ID}/v1', 'audio', 'protected',
       '${OWNER_ID}', 'audio/wav', ${AUDIO_BYTES.byteLength}, 'source-etag', 1,
       'ready', 'approved', '${SHA256}', 1, '${OWNER_ID}',
       '2026-07-19T09:00:00.000Z');

    INSERT INTO media_derivatives
      (id, source_media_id, kind, processing_profile, processing_version,
       object_key, status, approval_state, content_type, format,
       byte_length, content_sha256, revision, approved_by_user_id, approved_at)
    VALUES
      ('${AUDIO_DERIVATIVE_ID}', '${SOURCE_ID}', 'streaming', 'course-audio',
       '1', '${AUDIO_KEY}', 'ready', 'approved', '${AUDIO_TYPE}', 'mp3',
       ${AUDIO_BYTES.byteLength}, '${SHA256}', 1, '${OWNER_ID}',
       '2026-07-19T09:05:00.000Z'),
      ('${DOWNLOAD_DERIVATIVE_ID}', '${SOURCE_ID}', 'download',
       'course-download', '1', '${DOWNLOAD_KEY}', 'ready', 'approved',
       '${DOWNLOAD_TYPE}', 'txt', ${DOWNLOAD_BYTES.byteLength}, '${SHA256}', 1,
       '${OWNER_ID}', '2026-07-19T09:05:00.000Z');

    INSERT INTO access_plans
      (id, slug, name, description, state, revision, created_by_user_id)
    VALUES
      ('plan_course_delivery', 'course-delivery-access',
       'Course delivery access', 'Fictional protected Course plan.',
       'active', 1, '${OWNER_ID}');
  `);

  const publicCourse = seedCourse(database, {
    slug: "public-course",
    title: "Public Course",
    accessMode: "public",
    includeDownload: true,
  });
  const accountCourse = seedCourse(database, {
    slug: "account-course",
    title: "Account Course",
    accessMode: "account",
    includeDownload: false,
  });
  const protectedCourse = seedCourse(database, {
    slug: "protected-course",
    title: "Protected Course",
    accessMode: "protected",
    includeDownload: false,
  });

  database
    .prepare(
      `INSERT INTO access_plan_items
         (id, access_plan_id, position, resource_type, resource_id,
          actions_json)
       VALUES ('plan_item_course_delivery', 'plan_course_delivery', 1,
               'course', ?, '["view","stream","download"]')`,
    )
    .run(protectedCourse.courseId);
  database
    .prepare(
      `INSERT INTO entitlements
         (id, user_id, source_type, source_id, resource_type, resource_id,
          actions_json, state)
       VALUES ('entitlement_course_delivery', ?, 'subscription',
               'subscription_course_delivery', 'course', ?,
               '["view","stream","download"]', 'active')`,
    )
    .run(CUSTOMER_ID, protectedCourse.courseId);

  return { publicCourse, accountCourse, protectedCourse };
}

let requestSequence = 0;
function deliveryInput(binding, bucket, course, overrides = {}) {
  requestSequence += 1;
  return {
    binding,
    bucket,
    request: new Request(
      `https://example.invalid/api/courses/${course.courseId}/media`,
    ),
    requestId: `request_course_delivery_${requestSequence}`,
    courseSlug: course.courseId.replace(/^course_/, "").replaceAll("_", "-"),
    lessonSlug: course.lessonSlug,
    itemKey: "audio",
    courseRevisionId: course.revisionId,
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

async function assertFullAndRangeDelivery(
  memory,
  bucket,
  course,
  identityValue,
  expectedSource,
) {
  const fullInput = deliveryInput(memory.binding, bucket, course, {
    identity: identityValue,
  });
  const full = await deliverCourseLessonMedia(fullInput);
  assert.equal(full.status, 200);
  assert.equal(full.headers.get("content-type"), AUDIO_TYPE);
  assert.equal(full.headers.get("content-length"), String(AUDIO_BYTES.length));
  assert.equal(full.headers.get("cache-control"), "no-store");
  assert.equal(full.headers.get("x-request-id"), fullInput.requestId);
  assert.equal(full.headers.get("x-aop-access-source"), expectedSource);
  assert.deepEqual(await responseBytes(full), AUDIO_BYTES);
  assert.deepEqual(bucket.calls, [
    { method: "head", key: AUDIO_KEY },
    { method: "get", key: AUDIO_KEY, options: null },
  ]);

  bucket.clearCalls();
  const rangeInput = deliveryInput(memory.binding, bucket, course, {
    identity: identityValue,
    request: new Request("https://example.invalid/course-media", {
      headers: { range: "bytes=3-7" },
    }),
  });
  const partial = await deliverCourseLessonMedia(rangeInput);
  assert.equal(partial.status, 206);
  assert.equal(partial.headers.get("content-range"), "bytes 3-7/12");
  assert.equal(partial.headers.get("content-length"), "5");
  assert.equal(partial.headers.get("x-aop-access-source"), expectedSource);
  assert.deepEqual(await responseBytes(partial), AUDIO_BYTES.slice(3, 8));
  assert.deepEqual(bucket.calls, [
    { method: "head", key: AUDIO_KEY },
    {
      method: "get",
      key: AUDIO_KEY,
      options: { range: { offset: 3, length: 5 } },
    },
  ]);
  bucket.clearCalls();
}

test("public, account, and protected Course media return full and range responses only after access", async (t) => {
  const memory = await createInMemoryD1();
  t.after(() => memory.close());
  const courses = seed(memory.database);
  const bucket = new ReadOnlyMemoryBucket();

  await assertFullAndRangeDelivery(
    memory,
    bucket,
    courses.publicCourse,
    null,
    "public",
  );
  await assertFullAndRangeDelivery(
    memory,
    bucket,
    courses.accountCourse,
    identity(CUSTOMER_ID),
    "account",
  );
  await assertFullAndRangeDelivery(
    memory,
    bucket,
    courses.protectedCourse,
    identity(CUSTOMER_ID),
    "subscription",
  );

  assert.equal(
    bucket.calls.some(({ method }) => method === "put" || method === "delete"),
    false,
  );
});

test("denied Course media requests never read R2 and invalid ranges return 416 without body reads", async (t) => {
  const memory = await createInMemoryD1();
  t.after(() => memory.close());
  const courses = seed(memory.database);
  const bucket = new ReadOnlyMemoryBucket();

  await assertRuntimeCode(
    deliverCourseLessonMedia(
      deliveryInput(memory.binding, bucket, courses.accountCourse),
    ),
    "COURSE_MEDIA_ACCESS_DENIED",
  );
  assert.deepEqual(bucket.calls, []);

  await assertRuntimeCode(
    deliverCourseLessonMedia(
      deliveryInput(memory.binding, bucket, courses.protectedCourse, {
        identity: identity(OTHER_CUSTOMER_ID),
      }),
    ),
    "COURSE_MEDIA_ACCESS_DENIED",
  );
  assert.deepEqual(bucket.calls, []);

  for (const range of ["bytes=99-100", "bytes=0-1,4-5"]) {
    bucket.clearCalls();
    const response = await deliverCourseLessonMedia(
      deliveryInput(memory.binding, bucket, courses.publicCourse, {
        request: new Request("https://example.invalid/course-media", {
          headers: { range },
        }),
      }),
    );
    assert.equal(response.status, 416);
    assert.equal(response.headers.get("content-range"), "bytes */12");
    assert.equal(response.headers.get("content-length"), "0");
    assert.deepEqual(await responseBytes(response), new Uint8Array());
    assert.deepEqual(bucket.calls, [{ method: "head", key: AUDIO_KEY }]);
  }
});

test("Course downloads use attachment disposition and module deactivation or entitlement revocation stops R2 access", async (t) => {
  const memory = await createInMemoryD1();
  t.after(() => memory.close());
  const courses = seed(memory.database);
  const bucket = new ReadOnlyMemoryBucket();

  const download = await deliverCourseLessonMedia(
    deliveryInput(memory.binding, bucket, courses.publicCourse, {
      itemKey: "worksheet",
    }),
  );
  assert.equal(download.status, 200);
  assert.equal(download.headers.get("content-type"), DOWNLOAD_TYPE);
  assert.equal(
    download.headers.get("content-disposition"),
    'attachment; filename="practice-notes.txt"',
  );
  assert.deepEqual(await responseBytes(download), DOWNLOAD_BYTES);
  assert.deepEqual(bucket.calls, [
    { method: "head", key: DOWNLOAD_KEY },
    { method: "get", key: DOWNLOAD_KEY, options: null },
  ]);

  memory.database
    .prepare(
      `UPDATE artist_modules
       SET active = 0, deactivated_at = CURRENT_TIMESTAMP
       WHERE module_key = 'courses'`,
    )
    .run();
  bucket.clearCalls();
  await assertRuntimeCode(
    deliverCourseLessonMedia(
      deliveryInput(memory.binding, bucket, courses.publicCourse),
    ),
    "MODULE_INACTIVE",
  );
  assert.deepEqual(bucket.calls, []);

  memory.database
    .prepare(
      `UPDATE artist_modules
       SET active = 1, activated_at = CURRENT_TIMESTAMP,
           deactivated_at = NULL
       WHERE module_key = 'courses'`,
    )
    .run();
  memory.database
    .prepare(
      `UPDATE entitlements
       SET state = 'revoked', revision = revision + 1
       WHERE id = 'entitlement_course_delivery'`,
    )
    .run();
  bucket.clearCalls();
  await assertRuntimeCode(
    deliverCourseLessonMedia(
      deliveryInput(memory.binding, bucket, courses.protectedCourse, {
        identity: identity(CUSTOMER_ID),
      }),
    ),
    "COURSE_MEDIA_ACCESS_DENIED",
  );
  assert.deepEqual(bucket.calls, []);
  assert.equal(
    bucket.calls.some(({ method }) => method === "put" || method === "delete"),
    false,
  );
});
