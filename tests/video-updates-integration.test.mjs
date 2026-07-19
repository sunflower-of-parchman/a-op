import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";

import { createInMemoryD1, scalar } from "./helpers/in-memory-d1.mjs";

register(
  new URL("./helpers/typescript-alias-loader.mjs", import.meta.url),
  import.meta.url,
);

const [
  videoWrite,
  videoRead,
  updatesWrite,
  updatesRead,
  editorialWrite,
  editorialRead,
] = await Promise.all([
  import("../db/video-write.ts"),
  import("../db/video-read.ts"),
  import("../db/updates-write.ts"),
  import("../db/updates-read.ts"),
  import("../db/editorial-write.ts"),
  import("../db/editorial-read.ts"),
]);

function seed(database) {
  const users = [
    ["user_owner", "owner@example.invalid"],
    ["user_editor", "editor@example.invalid"],
    ["user_customer", "customer@example.invalid"],
  ];
  const insertUser = database.prepare(
    `INSERT INTO users (id, email, normalized_email, status)
     VALUES (?, ?, ?, 'active')`,
  );
  for (const [id, email] of users) insertUser.run(id, email, email);
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
       VALUES ('permission_pages', 'user_editor', 'pages.write', '*', 'user_owner')`,
    )
    .run();
  database
    .prepare(
      `UPDATE artist_modules
       SET active = 1, activated_at = CURRENT_TIMESTAMP
       WHERE module_key IN ('video', 'whats-new')`,
    )
    .run();
}

let sequence = 0;
function context(actorUserId, idempotencyKey) {
  sequence += 1;
  return {
    actorUserId,
    idempotencyKey,
    requestId: `request_video_updates_${sequence}`,
  };
}

function injectBeforeBatch(binding, injection) {
  let pending = true;
  return {
    prepare(sql) {
      return binding.prepare(sql);
    },
    batch(statements) {
      if (pending) {
        pending = false;
        injection();
      }
      return binding.batch(statements);
    },
  };
}

function injectBeforeQuery(binding, sqlFragment, injection) {
  let pending = true;
  return {
    prepare(sql) {
      if (pending && sql.includes(sqlFragment)) {
        pending = false;
        injection();
      }
      return binding.prepare(sql);
    },
    batch(statements) {
      return binding.batch(statements);
    },
  };
}

function videoInput(title = "Fictional session") {
  return {
    slug: "fictional-session",
    title,
    summary: "A fictional video record without media bytes.",
    artistContext: "A fictional artist describes the recording context.",
    credits: [{ name: "Fictional Musician", role: "Performer", details: "" }],
    deliveryKind: "external",
    posterDerivativeId: null,
    hostedDerivativeId: null,
    externalProvider: "youtube",
    externalEmbedUrl:
      "https://www.youtube-nocookie.com/embed/fictional-identifier",
    transcripts: [
      {
        language: "en",
        transcriptText: "A fictional transcript for an in-memory journey.",
        captionsDerivativeId: null,
      },
    ],
  };
}

function updateInput(slug, audience, resource = null) {
  return {
    slug,
    title: slug === "account-note" ? "Account note" : "Public note",
    summary: "A fictional update summary.",
    body: [{ type: "paragraph", text: "Fictional update text." }],
    audience,
    resource,
  };
}

async function runtimeCode(promise, code) {
  await assert.rejects(promise, (error) => {
    assert.equal(error?.name, "RuntimeError");
    assert.equal(error?.code, code);
    return true;
  });
}

test("video revisions, publication, replay, and frozen public reads remain durable", async (t) => {
  const memory = await createInMemoryD1();
  t.after(() => memory.close());
  seed(memory.database);

  const draft = await videoWrite.saveVideoDraft(
    memory.binding,
    videoInput(),
    0,
    context("user_editor", "video-draft-one"),
  );
  assert.equal(draft.value.draftRevision, 1);
  assert.equal(draft.value.revision, 1);
  assert.equal(
    scalar(memory.database, "SELECT COUNT(*) FROM video_transcripts"),
    1,
  );

  await runtimeCode(
    videoWrite.publishVideo(
      memory.binding,
      "fictional-session",
      1,
      context("user_editor", "editor-publish-denied"),
    ),
    "STALE_STATE",
  );
  const publishContext = context("user_owner", "video-publish-one");
  const publication = await videoWrite.publishVideo(
    memory.binding,
    "fictional-session",
    1,
    publishContext,
  );
  assert.equal(publication.value.revision, 2);

  const replay = await videoWrite.publishVideo(
    memory.binding,
    "fictional-session",
    1,
    publishContext,
  );
  assert.equal(replay.replayed, true);
  assert.deepEqual(replay.value, publication.value);

  const firstPublic = await videoRead.readPublishedVideoBySlug(
    memory.binding,
    "fictional-session",
  );
  assert.equal(firstPublic.title, "Fictional session");
  assert.equal(firstPublic.delivery.kind, "external");
  assert.equal(firstPublic.transcripts.length, 1);

  const secondDraft = await videoWrite.saveVideoDraft(
    memory.binding,
    videoInput("Fictional session, revised"),
    2,
    context("user_editor", "video-draft-two"),
  );
  assert.equal(secondDraft.value.draftRevision, 2);
  assert.equal(secondDraft.value.revision, 3);
  assert.equal(
    (
      await videoRead.readPublishedVideoBySlug(
        memory.binding,
        "fictional-session",
      )
    ).title,
    "Fictional session",
  );

  await videoWrite.publishVideo(
    memory.binding,
    "fictional-session",
    3,
    context("user_owner", "video-publish-two"),
  );
  assert.equal(
    (
      await videoRead.readPublishedVideoBySlug(
        memory.binding,
        "fictional-session",
      )
    ).title,
    "Fictional session, revised",
  );
  assert.equal(
    scalar(memory.database, "SELECT COUNT(*) FROM video_revisions"),
    2,
  );
  assert.equal(
    scalar(memory.database, "SELECT COUNT(*) FROM video_transcripts"),
    2,
  );
});

test("video publish rejects transcript readiness withdrawn at the batch boundary", async (t) => {
  const memory = await createInMemoryD1();
  t.after(() => memory.close());
  seed(memory.database);
  const draft = await videoWrite.saveVideoDraft(
    memory.binding,
    videoInput(),
    0,
    context("user_editor", "boundary-video-draft"),
  );
  const idempotencyKey = "boundary-video-publish";
  const boundaryBinding = injectBeforeBatch(memory.binding, () => {
    memory.database
      .prepare("DELETE FROM video_transcripts WHERE video_revision_id = ?")
      .run(draft.value.revisionId);
  });

  await runtimeCode(
    videoWrite.publishVideo(
      boundaryBinding,
      "fictional-session",
      1,
      context("user_owner", idempotencyKey),
    ),
    "STALE_STATE",
  );
  const video = memory.database
    .prepare(
      `SELECT publication_state, published_revision_id, revision
       FROM videos WHERE id = ?`,
    )
    .get(draft.value.id);
  assert.equal(video.publication_state, "draft");
  assert.equal(video.published_revision_id, null);
  assert.equal(video.revision, 1);
  assert.equal(
    scalar(
      memory.database,
      "SELECT COUNT(*) FROM audit_events WHERE idempotency_key = ?",
      `video.publish:user_owner:${idempotencyKey}`,
    ),
    0,
  );
});

test("video publish audit rejects forged success after boundary readiness withdrawal", async (t) => {
  const memory = await createInMemoryD1();
  t.after(() => memory.close());
  seed(memory.database);
  const draft = await videoWrite.saveVideoDraft(
    memory.binding,
    videoInput(),
    0,
    context("user_editor", "audit-boundary-video-draft"),
  );
  const idempotencyKey = "audit-boundary-video-publish";
  const operationKey = `video.publish:user_owner:${idempotencyKey}`;
  const boundaryBinding = injectBeforeBatch(memory.binding, () => {
    memory.database
      .prepare("DELETE FROM video_transcripts WHERE video_revision_id = ?")
      .run(draft.value.revisionId);
    memory.database
      .prepare(
        `UPDATE videos
         SET publication_state = 'published',
             published_revision_id = draft_revision_id,
             published_at = CURRENT_TIMESTAMP,
             revision = 2,
             last_operation_key = ?
         WHERE id = ?`,
      )
      .run(operationKey, draft.value.id);
  });

  await runtimeCode(
    videoWrite.publishVideo(
      boundaryBinding,
      "fictional-session",
      1,
      context("user_owner", idempotencyKey),
    ),
    "STALE_STATE",
  );
  assert.equal(
    scalar(
      memory.database,
      "SELECT COUNT(*) FROM audit_events WHERE idempotency_key = ?",
      operationKey,
    ),
    0,
  );
});

test("public and account updates enforce audience, resource publication, unread state, and idempotent reads", async (t) => {
  const memory = await createInMemoryD1();
  t.after(() => memory.close());
  seed(memory.database);

  const videoDraft = await videoWrite.saveVideoDraft(
    memory.binding,
    videoInput(),
    0,
    context("user_editor", "linked-video-draft"),
  );
  await videoWrite.publishVideo(
    memory.binding,
    "fictional-session",
    1,
    context("user_owner", "linked-video-publish"),
  );

  const publicDraft = await updatesWrite.saveUpdateDraft(
    memory.binding,
    updateInput("public-note", "public", {
      type: "video",
      id: videoDraft.value.id,
    }),
    0,
    context("user_editor", "public-update-draft"),
  );
  await updatesWrite.publishUpdate(
    memory.binding,
    "public-note",
    publicDraft.value.revision,
    context("user_owner", "public-update-publish"),
  );
  const accountDraft = await updatesWrite.saveUpdateDraft(
    memory.binding,
    updateInput("account-note", "account"),
    0,
    context("user_editor", "account-update-draft"),
  );
  await updatesWrite.publishUpdate(
    memory.binding,
    "account-note",
    accountDraft.value.revision,
    context("user_owner", "account-update-publish"),
  );

  const anonymous = await updatesRead.listPublishedUpdates(
    memory.binding,
    null,
  );
  assert.deepEqual(
    anonymous.map(({ slug }) => slug),
    ["public-note"],
  );
  assert.equal(
    await updatesRead.readPublishedUpdateBySlug(
      memory.binding,
      "account-note",
      null,
    ),
    null,
  );

  const customer = await updatesRead.listPublishedUpdates(
    memory.binding,
    "user_customer",
  );
  assert.deepEqual(
    new Set(customer.map(({ slug }) => slug)),
    new Set(["public-note", "account-note"]),
  );
  const linked = customer.find(({ slug }) => slug === "public-note");
  assert.equal(linked.resource.href, "/videos/fictional-session");
  assert.equal(
    await updatesRead.countUnreadUpdates(memory.binding, "user_customer"),
    2,
  );

  const readContext = context("user_customer", "read-public-update");
  const firstRead = await updatesWrite.markUpdateRead(
    memory.binding,
    publicDraft.value.id,
    readContext,
  );
  assert.equal(firstRead.replayed, false);
  const replay = await updatesWrite.markUpdateRead(
    memory.binding,
    publicDraft.value.id,
    readContext,
  );
  assert.equal(replay.replayed, true);
  const semanticReplay = await updatesWrite.markUpdateRead(
    memory.binding,
    publicDraft.value.id,
    context("user_customer", "read-public-update-again"),
  );
  assert.equal(semanticReplay.replayed, true);
  assert.equal(scalar(memory.database, "SELECT COUNT(*) FROM update_reads"), 1);
  assert.equal(
    await updatesRead.countUnreadUpdates(memory.binding, "user_customer"),
    1,
  );

  await runtimeCode(
    updatesWrite.saveUpdateDraft(
      memory.binding,
      updateInput("public-note", "public"),
      2,
      context("user_editor", "published-update-edit"),
    ),
    "UPDATE_PUBLISHED_IMMUTABLE",
  );
});

test("update publish rejects linked-resource withdrawal at the batch boundary", async (t) => {
  const memory = await createInMemoryD1();
  t.after(() => memory.close());
  seed(memory.database);
  const videoDraft = await videoWrite.saveVideoDraft(
    memory.binding,
    videoInput(),
    0,
    context("user_editor", "withdrawal-linked-video-draft"),
  );
  await videoWrite.publishVideo(
    memory.binding,
    "fictional-session",
    1,
    context("user_owner", "withdrawal-linked-video-publish"),
  );
  const updateDraft = await updatesWrite.saveUpdateDraft(
    memory.binding,
    updateInput("public-note", "public", {
      type: "video",
      id: videoDraft.value.id,
    }),
    0,
    context("user_editor", "withdrawal-update-draft"),
  );
  const idempotencyKey = "withdrawal-update-publish";
  const boundaryBinding = injectBeforeBatch(memory.binding, () => {
    memory.database
      .prepare(
        `UPDATE videos
         SET publication_state = 'draft'
         WHERE id = ?`,
      )
      .run(videoDraft.value.id);
  });

  await runtimeCode(
    updatesWrite.publishUpdate(
      boundaryBinding,
      "public-note",
      updateDraft.value.revision,
      context("user_owner", idempotencyKey),
    ),
    "STALE_STATE",
  );
  const update = memory.database
    .prepare("SELECT state, revision FROM updates WHERE id = ?")
    .get(updateDraft.value.id);
  assert.equal(update.state, "draft");
  assert.equal(update.revision, 1);
  assert.equal(
    scalar(
      memory.database,
      "SELECT COUNT(*) FROM audit_events WHERE idempotency_key = ?",
      `update.publish:user_owner:${idempotencyKey}`,
    ),
    0,
  );
});

test("update publish audit rejects a boundary replacement with another published resource", async (t) => {
  const memory = await createInMemoryD1();
  t.after(() => memory.close());
  seed(memory.database);
  const original = await videoWrite.saveVideoDraft(
    memory.binding,
    videoInput(),
    0,
    context("user_editor", "replacement-original-draft"),
  );
  await videoWrite.publishVideo(
    memory.binding,
    "fictional-session",
    1,
    context("user_owner", "replacement-original-publish"),
  );
  const replacement = await videoWrite.saveVideoDraft(
    memory.binding,
    {
      ...videoInput("Replacement session"),
      slug: "replacement-session",
    },
    0,
    context("user_editor", "replacement-video-draft"),
  );
  await videoWrite.publishVideo(
    memory.binding,
    "replacement-session",
    1,
    context("user_owner", "replacement-video-publish"),
  );
  const updateDraft = await updatesWrite.saveUpdateDraft(
    memory.binding,
    updateInput("public-note", "public", {
      type: "video",
      id: original.value.id,
    }),
    0,
    context("user_editor", "replacement-update-draft"),
  );
  const idempotencyKey = "replacement-update-publish";
  const operationKey = `update.publish:user_owner:${idempotencyKey}`;
  const boundaryBinding = injectBeforeBatch(memory.binding, () => {
    memory.database
      .prepare(
        `UPDATE updates
         SET resource_id = ?, state = 'published',
             published_at = CURRENT_TIMESTAMP, revision = 2,
             last_operation_key = ?
         WHERE id = ?`,
      )
      .run(replacement.value.id, operationKey, updateDraft.value.id);
  });

  await runtimeCode(
    updatesWrite.publishUpdate(
      boundaryBinding,
      "public-note",
      updateDraft.value.revision,
      context("user_owner", idempotencyKey),
    ),
    "STALE_STATE",
  );
  assert.equal(
    scalar(
      memory.database,
      "SELECT COUNT(*) FROM audit_events WHERE idempotency_key = ?",
      operationKey,
    ),
    0,
  );
});

test("revoked customers cannot read account updates or create read receipts while anonymous public updates remain available", async (t) => {
  const memory = await createInMemoryD1();
  t.after(() => memory.close());
  seed(memory.database);
  const publicDraft = await updatesWrite.saveUpdateDraft(
    memory.binding,
    updateInput("public-note", "public"),
    0,
    context("user_editor", "revoked-public-draft"),
  );
  await updatesWrite.publishUpdate(
    memory.binding,
    "public-note",
    publicDraft.value.revision,
    context("user_owner", "revoked-public-publish"),
  );
  const accountDraft = await updatesWrite.saveUpdateDraft(
    memory.binding,
    updateInput("account-note", "account"),
    0,
    context("user_editor", "revoked-account-draft"),
  );
  await updatesWrite.publishUpdate(
    memory.binding,
    "account-note",
    accountDraft.value.revision,
    context("user_owner", "revoked-account-publish"),
  );

  memory.database
    .prepare(
      `UPDATE role_assignments
       SET revoked_at = CURRENT_TIMESTAMP
       WHERE id = 'role_customer'`,
    )
    .run();

  await runtimeCode(
    updatesRead.listPublishedUpdates(memory.binding, "user_customer"),
    "UPDATE_CUSTOMER_REQUIRED",
  );
  await runtimeCode(
    updatesRead.readPublishedUpdateBySlug(
      memory.binding,
      "account-note",
      "user_customer",
    ),
    "UPDATE_CUSTOMER_REQUIRED",
  );
  await runtimeCode(
    updatesRead.countUnreadUpdates(memory.binding, "user_customer"),
    "UPDATE_CUSTOMER_REQUIRED",
  );
  await runtimeCode(
    updatesWrite.markUpdateRead(
      memory.binding,
      publicDraft.value.id,
      context("user_customer", "revoked-read-receipt"),
    ),
    "UPDATE_NOT_AVAILABLE",
  );
  assert.equal(scalar(memory.database, "SELECT COUNT(*) FROM update_reads"), 0);
  const anonymous = await updatesRead.listPublishedUpdates(
    memory.binding,
    null,
  );
  assert.deepEqual(
    anonymous.map(({ slug }) => slug),
    ["public-note"],
  );
});

test("account feed, detail, and unread queries recheck customer authority after preflight", async (t) => {
  const memory = await createInMemoryD1();
  t.after(() => memory.close());
  seed(memory.database);
  const publicDraft = await updatesWrite.saveUpdateDraft(
    memory.binding,
    updateInput("public-note", "public"),
    0,
    context("user_editor", "authority-race-public-draft"),
  );
  await updatesWrite.publishUpdate(
    memory.binding,
    "public-note",
    publicDraft.value.revision,
    context("user_owner", "authority-race-public-publish"),
  );
  const accountDraft = await updatesWrite.saveUpdateDraft(
    memory.binding,
    updateInput("account-note", "account"),
    0,
    context("user_editor", "authority-race-account-draft"),
  );
  await updatesWrite.publishUpdate(
    memory.binding,
    "account-note",
    accountDraft.value.revision,
    context("user_owner", "authority-race-account-publish"),
  );
  const revoke = () =>
    memory.database
      .prepare(
        `UPDATE role_assignments
         SET revoked_at = CURRENT_TIMESTAMP
         WHERE id = 'role_customer'`,
      )
      .run();
  const restore = () =>
    memory.database
      .prepare(
        `UPDATE role_assignments
         SET revoked_at = NULL
         WHERE id = 'role_customer'`,
      )
      .run();

  const feed = await updatesRead.listPublishedUpdates(
    injectBeforeQuery(memory.binding, "FROM updates AS update_record", revoke),
    "user_customer",
  );
  assert.deepEqual(
    feed.map(({ slug }) => slug),
    ["public-note"],
  );

  restore();
  const detail = await updatesRead.readPublishedUpdateBySlug(
    injectBeforeQuery(memory.binding, "WHERE update_record.slug = ?2", revoke),
    "account-note",
    "user_customer",
  );
  assert.equal(detail, null);

  restore();
  const unread = await updatesRead.countUnreadUpdates(
    injectBeforeQuery(
      memory.binding,
      "SELECT COUNT(*) AS count\n       FROM updates AS update_record",
      revoke,
    ),
    "user_customer",
  );
  assert.equal(unread, 0);
});

test("editorial drafts retain snapshots and freeze after owner publication", async (t) => {
  const memory = await createInMemoryD1();
  t.after(() => memory.close());
  seed(memory.database);
  const input = {
    slug: "fictional-notes",
    title: "Fictional notes",
    excerpt: "A fictional editorial excerpt.",
    body: [{ type: "paragraph", text: "Fictional editorial body." }],
  };
  const draft = await editorialWrite.saveEditorialDraft(
    memory.binding,
    input,
    0,
    context("user_editor", "editorial-draft"),
  );
  await editorialWrite.publishEditorialPost(
    memory.binding,
    input.slug,
    draft.value.revision,
    context("user_owner", "editorial-publish"),
  );
  const published = await editorialRead.readPublishedEditorialPostBySlug(
    memory.binding,
    input.slug,
  );
  assert.equal(published.title, input.title);
  assert.equal(published.body[0].text, "Fictional editorial body.");
  await runtimeCode(
    editorialWrite.saveEditorialDraft(
      memory.binding,
      { ...input, title: "Changed after publication" },
      2,
      context("user_editor", "editorial-edit-after-publish"),
    ),
    "EDITORIAL_PUBLISHED_IMMUTABLE",
  );
  const audit = memory.database
    .prepare(
      `SELECT details_json FROM audit_events
       WHERE idempotency_key = 'editorial.draft.save:user_editor:editorial-draft'`,
    )
    .get();
  assert.equal(JSON.parse(audit.details_json).draftSnapshot.title, input.title);
});
