import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";

import { createInMemoryD1, scalar } from "./helpers/in-memory-d1.mjs";

register(
  new URL("./helpers/typescript-alias-loader.mjs", import.meta.url),
  import.meta.url,
);

const read = await import("../db/content-section-read.ts");
const write = await import("../db/content-section-write.ts");

const OWNER = "user_section_owner";
const EDITOR = "user_section_editor";

let requestSequence = 0;
function context(actorUserId, idempotencyKey) {
  requestSequence += 1;
  return {
    actorUserId,
    idempotencyKey,
    requestId: `request_content_section_${requestSequence}`,
  };
}

async function setup() {
  const memory = await createInMemoryD1();
  memory.database.exec(`
    INSERT INTO users (id, email, normalized_email, status)
    VALUES
      ('${OWNER}', 'section-owner@example.invalid',
       'section-owner@example.invalid', 'active'),
      ('${EDITOR}', 'section-editor@example.invalid',
       'section-editor@example.invalid', 'active');
    INSERT INTO role_assignments
      (id, user_id, role_key, assigned_by_user_id)
    VALUES
      ('role_section_owner', '${OWNER}', 'owner', '${OWNER}'),
      ('role_section_editor', '${EDITOR}', 'editor', '${OWNER}');
    INSERT INTO editor_permissions
      (id, user_id, permission_key, scope_id, assigned_by_user_id)
    VALUES
      ('permission_section_page', '${EDITOR}', 'pages.write',
       'artist-page', '${OWNER}');
  `);
  return memory;
}

function input(overrides = {}) {
  return {
    sectionKey: "artist-statement",
    kind: "prose",
    heading: "Artist statement",
    bodyText: "A fictional artist statement for an in-memory journey.",
    ...overrides,
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

function injectBeforeSqlExecution(binding, sqlFragment, injection) {
  let pending = true;
  return {
    prepare(sql) {
      const statement = binding.prepare(sql);
      return {
        bind(...values) {
          const bound = statement.bind(...values);
          const before = () => {
            if (pending && sql.includes(sqlFragment)) {
              pending = false;
              injection();
            }
          };
          return {
            all() {
              before();
              return bound.all();
            },
            first(columnName) {
              before();
              return bound.first(columnName);
            },
            raw() {
              before();
              return bound.raw();
            },
            run() {
              before();
              return bound.run();
            },
          };
        },
      };
    },
    batch(statements) {
      return binding.batch(statements);
    },
  };
}

function seedPublishedPage(database, section, suffix) {
  const pageId = `page_section_${suffix}`;
  const pageRevisionId = `page_revision_section_${suffix}`;
  database
    .prepare(
      `INSERT INTO pages
        (id, slug, draft_revision_id, published_revision_id,
         publication_state, version, published_at)
       VALUES (?, ?, ?, ?, 'published', 1, CURRENT_TIMESTAMP)`,
    )
    .run(pageId, `section-page-${suffix}`, pageRevisionId, pageRevisionId);
  database
    .prepare(
      `INSERT INTO page_revisions
        (id, page_id, revision, kind, title, introduction, body_text,
         created_by_user_id)
       VALUES (?, ?, 1, 'standard', 'Section page', '', '', ?)`,
    )
    .run(pageRevisionId, pageId, OWNER);
  database
    .prepare(
      `INSERT INTO page_revision_sections
        (id, page_revision_id, position, content_section_id,
         content_section_revision_id)
       VALUES (?, ?, 1, ?, ?)`,
    )
    .run(
      `page_revision_section_link_${suffix}`,
      pageRevisionId,
      section.sectionId,
      section.publishedRevisionId,
    );
}

async function runtimeCode(promise, code) {
  await assert.rejects(promise, (error) => {
    assert.equal(error?.name, "RuntimeError");
    assert.equal(error?.code, code);
    return true;
  });
}

test("content section revisions, publication options, replay, and archive remain exact", async (t) => {
  const memory = await setup();
  t.after(() => memory.close());

  const createContext = context(OWNER, "section-create");
  const created = await write.saveContentSectionDraft(
    memory.binding,
    input(),
    0,
    createContext,
  );
  assert.deepEqual(
    {
      created: created.value.created,
      revision: created.value.revision,
      version: created.value.version,
      state: created.value.publicationState,
    },
    { created: true, revision: 1, version: 1, state: "draft" },
  );
  const replay = await write.saveContentSectionDraft(
    memory.binding,
    input(),
    0,
    createContext,
  );
  assert.equal(replay.replayed, true);
  assert.deepEqual(replay.value, created.value);
  assert.equal(
    scalar(memory.database, "SELECT COUNT(*) FROM content_sections"),
    1,
  );
  assert.equal(
    scalar(memory.database, "SELECT COUNT(*) FROM content_section_revisions"),
    1,
  );

  const revised = await write.saveContentSectionDraft(
    memory.binding,
    input({
      kind: "quote",
      bodyText: "A revised fictional statement retained as a quote.",
    }),
    1,
    context(OWNER, "section-revise"),
  );
  assert.equal(revised.value.revision, 2);
  assert.equal(revised.value.version, 2);

  const firstPublication = await write.publishContentSection(
    memory.binding,
    "artist-statement",
    2,
    context(OWNER, "section-publish-two"),
  );
  assert.equal(firstPublication.value.publishedRevision, 2);
  assert.equal(firstPublication.value.version, 3);
  let options = await read.listPublishedContentSectionOptions(
    memory.binding,
    OWNER,
  );
  assert.deepEqual(
    options.map(({ sectionKey, revision, kind }) => ({
      sectionKey,
      revision,
      kind,
    })),
    [{ sectionKey: "artist-statement", revision: 2, kind: "quote" }],
  );

  const pending = await write.saveContentSectionDraft(
    memory.binding,
    input({
      kind: "callout",
      heading: "Current artist statement",
      bodyText: "A third fictional revision waiting for publication.",
    }),
    3,
    context(OWNER, "section-revise-published"),
  );
  assert.equal(pending.value.publicationState, "published");
  assert.equal(pending.value.revision, 3);
  options = await read.listPublishedContentSectionOptions(
    memory.binding,
    OWNER,
  );
  assert.equal(options[0].revision, 2);

  const admin = await read.readAdminContentSectionByKey(
    memory.binding,
    "artist-statement",
    OWNER,
  );
  assert.equal(admin.draft.revision, 3);
  assert.equal(admin.published.revision, 2);
  assert.equal(admin.publicationState, "published");

  const secondPublication = await write.publishContentSection(
    memory.binding,
    "artist-statement",
    4,
    context(OWNER, "section-publish-three"),
  );
  assert.equal(secondPublication.value.publishedRevision, 3);
  const archiveContext = context(OWNER, "section-archive");
  const archived = await write.archiveContentSection(
    memory.binding,
    "artist-statement",
    5,
    archiveContext,
  );
  assert.equal(archived.value.version, 6);
  assert.equal(archived.value.publicationState, "archived");
  const archiveReplay = await write.archiveContentSection(
    memory.binding,
    "artist-statement",
    5,
    archiveContext,
  );
  assert.equal(archiveReplay.replayed, true);
  assert.deepEqual(archiveReplay.value, archived.value);
  assert.deepEqual(
    await read.listPublishedContentSectionOptions(memory.binding, OWNER),
    [],
  );

  await runtimeCode(
    write.saveContentSectionDraft(
      memory.binding,
      input({ bodyText: "An edit that must remain rejected." }),
      6,
      context(OWNER, "section-archived-save"),
    ),
    "CONTENT_SECTION_ARCHIVED",
  );
  await runtimeCode(
    write.publishContentSection(
      memory.binding,
      "artist-statement",
      6,
      context(OWNER, "section-archived-publish"),
    ),
    "CONTENT_SECTION_ARCHIVED",
  );
  assert.deepEqual(
    memory.database
      .prepare(
        `SELECT revision, kind, body_text
         FROM content_section_revisions
         ORDER BY revision`,
      )
      .all()
      .map((row) => ({ ...row })),
    [
      {
        revision: 1,
        kind: "prose",
        body_text: "A fictional artist statement for an in-memory journey.",
      },
      {
        revision: 2,
        kind: "quote",
        body_text: "A revised fictional statement retained as a quote.",
      },
      {
        revision: 3,
        kind: "callout",
        body_text: "A third fictional revision waiting for publication.",
      },
    ],
  );
  assert.deepEqual(
    memory.database.prepare("PRAGMA foreign_key_check").all(),
    [],
  );
});

test("content section writes require a live owner and exact aggregate version", async (t) => {
  const memory = await setup();
  t.after(() => memory.close());

  await runtimeCode(
    write.saveContentSectionDraft(
      memory.binding,
      input(),
      0,
      context(EDITOR, "editor-section-create"),
    ),
    "STALE_STATE",
  );
  assert.equal(
    scalar(memory.database, "SELECT COUNT(*) FROM content_sections"),
    0,
  );

  await write.saveContentSectionDraft(
    memory.binding,
    input(),
    0,
    context(OWNER, "owner-section-create"),
  );
  const idempotencyKey = "section-stale-update";
  const boundary = injectBeforeBatch(memory.binding, () => {
    memory.database.exec(
      "UPDATE content_sections SET version = version + 1 WHERE section_key = 'artist-statement'",
    );
  });
  await runtimeCode(
    write.saveContentSectionDraft(
      boundary,
      input({ bodyText: "A stale boundary edit." }),
      1,
      context(OWNER, idempotencyKey),
    ),
    "STALE_STATE",
  );
  assert.equal(
    scalar(memory.database, "SELECT COUNT(*) FROM content_section_revisions"),
    1,
  );
  assert.equal(
    scalar(
      memory.database,
      "SELECT COUNT(*) FROM audit_events WHERE idempotency_key = ?",
      `content-section.draft.save:${OWNER}:${idempotencyKey}`,
    ),
    0,
  );
});

test("publish rejects a draft revision swapped at the batch boundary", async (t) => {
  const memory = await setup();
  t.after(() => memory.close());
  const created = await write.saveContentSectionDraft(
    memory.binding,
    input(),
    0,
    context(OWNER, "boundary-section-create"),
  );
  const operationKey = "boundary-section-publish";
  const boundaryRevisionId = "content_section_revision_boundary";
  const boundary = injectBeforeBatch(memory.binding, () => {
    memory.database
      .prepare(
        `INSERT INTO content_section_revisions
          (id, content_section_id, revision, kind, heading, body_text,
           created_by_user_id)
         VALUES (?, ?, 2, 'prose', 'Boundary revision',
                 'A boundary revision that was not selected for publication.', ?)`,
      )
      .run(boundaryRevisionId, created.value.sectionId, OWNER);
    memory.database
      .prepare(
        `UPDATE content_sections SET draft_revision_id = ?
         WHERE id = ?`,
      )
      .run(boundaryRevisionId, created.value.sectionId);
  });

  await runtimeCode(
    write.publishContentSection(
      boundary,
      "artist-statement",
      1,
      context(OWNER, operationKey),
    ),
    "STALE_STATE",
  );
  const root = memory.database
    .prepare(
      `SELECT publication_state, published_revision_id, version
       FROM content_sections WHERE id = ?`,
    )
    .get(created.value.sectionId);
  assert.deepEqual(
    { ...root },
    {
      publication_state: "draft",
      published_revision_id: null,
      version: 1,
    },
  );
  assert.equal(
    scalar(
      memory.database,
      "SELECT COUNT(*) FROM audit_events WHERE idempotency_key = ?",
      `content-section.publish:${OWNER}:${operationKey}`,
    ),
    0,
  );
});

test("owner revocation at the batch boundary leaves no new revision or audit receipt", async (t) => {
  const memory = await setup();
  t.after(() => memory.close());
  await write.saveContentSectionDraft(
    memory.binding,
    input(),
    0,
    context(OWNER, "revocation-section-create"),
  );
  const operationKey = "revocation-section-save";
  const boundary = injectBeforeBatch(memory.binding, () => {
    memory.database.exec(`
      UPDATE role_assignments
      SET revoked_at = '2026-07-19T12:00:00.000Z',
          revoked_by_user_id = '${OWNER}'
      WHERE user_id = '${OWNER}' AND role_key = 'owner'
        AND revoked_at IS NULL;
    `);
  });
  await runtimeCode(
    write.saveContentSectionDraft(
      boundary,
      input({ bodyText: "A revision attempted after owner revocation." }),
      1,
      context(OWNER, operationKey),
    ),
    "STALE_STATE",
  );
  assert.equal(
    scalar(memory.database, "SELECT COUNT(*) FROM content_section_revisions"),
    1,
  );
  assert.equal(
    scalar(
      memory.database,
      "SELECT COUNT(*) FROM audit_events WHERE idempotency_key = ?",
      `content-section.draft.save:${OWNER}:${operationKey}`,
    ),
    0,
  );
});

test("publication and archive each repeat live owner authority inside their batches", async (t) => {
  const memory = await setup();
  t.after(() => memory.close());
  await write.saveContentSectionDraft(
    memory.binding,
    input(),
    0,
    context(OWNER, "state-authority-section-create"),
  );

  const publishKey = "state-authority-section-publish-denied";
  const publishBoundary = injectBeforeBatch(memory.binding, () => {
    memory.database.exec(`
      UPDATE role_assignments
      SET revoked_at = '2026-07-19T12:10:00.000Z',
          revoked_by_user_id = '${OWNER}'
      WHERE user_id = '${OWNER}' AND role_key = 'owner'
        AND revoked_at IS NULL;
    `);
  });
  await runtimeCode(
    write.publishContentSection(
      publishBoundary,
      "artist-statement",
      1,
      context(OWNER, publishKey),
    ),
    "STALE_STATE",
  );
  assert.equal(
    scalar(
      memory.database,
      "SELECT publication_state FROM content_sections WHERE section_key = 'artist-statement'",
    ),
    "draft",
  );
  assert.equal(
    scalar(
      memory.database,
      "SELECT COUNT(*) FROM audit_events WHERE idempotency_key = ?",
      `content-section.publish:${OWNER}:${publishKey}`,
    ),
    0,
  );

  memory.database.exec(`
    UPDATE role_assignments
    SET revoked_at = NULL, revoked_by_user_id = NULL
    WHERE user_id = '${OWNER}' AND role_key = 'owner';
  `);
  await write.publishContentSection(
    memory.binding,
    "artist-statement",
    1,
    context(OWNER, "state-authority-section-publish"),
  );

  const archiveKey = "state-authority-section-archive-denied";
  const archiveBoundary = injectBeforeBatch(memory.binding, () => {
    memory.database.exec(`
      UPDATE role_assignments
      SET revoked_at = '2026-07-19T12:11:00.000Z',
          revoked_by_user_id = '${OWNER}'
      WHERE user_id = '${OWNER}' AND role_key = 'owner'
        AND revoked_at IS NULL;
    `);
  });
  await runtimeCode(
    write.archiveContentSection(
      archiveBoundary,
      "artist-statement",
      2,
      context(OWNER, archiveKey),
    ),
    "STALE_STATE",
  );
  assert.equal(
    scalar(
      memory.database,
      "SELECT publication_state FROM content_sections WHERE section_key = 'artist-statement'",
    ),
    "published",
  );
  assert.equal(
    scalar(
      memory.database,
      "SELECT COUNT(*) FROM audit_events WHERE idempotency_key = ?",
      `content-section.archive:${OWNER}:${archiveKey}`,
    ),
    0,
  );
});

test("private admin reads repeat owner authority and apply a final workspace barrier", async (t) => {
  const memory = await setup();
  t.after(() => memory.close());
  await write.saveContentSectionDraft(
    memory.binding,
    input(),
    0,
    context(OWNER, "read-boundary-section-create"),
  );
  await write.publishContentSection(
    memory.binding,
    "artist-statement",
    1,
    context(OWNER, "read-boundary-section-publish"),
  );

  const editorOptions = await read.listPageCompositionContentSectionOptions(
    memory.binding,
    EDITOR,
    "artist-page",
  );
  assert.equal(editorOptions.length, 1);

  const finalBarrier = injectBeforeSqlExecution(
    memory.binding,
    "SELECT 1 AS allowed WHERE",
    () => {
      memory.database.exec(`
        UPDATE role_assignments
        SET revoked_at = '2026-07-19T13:00:00.000Z',
            revoked_by_user_id = '${OWNER}'
        WHERE user_id = '${OWNER}' AND role_key = 'owner'
          AND revoked_at IS NULL;
      `);
    },
  );
  await runtimeCode(
    read.readContentSectionAdminWorkspace(finalBarrier, OWNER),
    "CONTENT_SECTION_OWNER_REQUIRED",
  );

  memory.database.exec(`
    UPDATE role_assignments
    SET revoked_at = NULL, revoked_by_user_id = NULL
    WHERE user_id = '${OWNER}' AND role_key = 'owner';
  `);
  const detailBoundary = injectBeforeSqlExecution(
    memory.binding,
    "section.section_key = ?1",
    () => {
      memory.database.exec(`
        UPDATE role_assignments
        SET revoked_at = '2026-07-19T13:01:00.000Z',
            revoked_by_user_id = '${OWNER}'
        WHERE user_id = '${OWNER}' AND role_key = 'owner'
          AND revoked_at IS NULL;
      `);
    },
  );
  assert.equal(
    await read.readAdminContentSectionByKey(
      detailBoundary,
      "artist-statement",
      OWNER,
    ),
    null,
  );
});

test("a section used by a published page cannot be archived", async (t) => {
  const memory = await setup();
  t.after(() => memory.close());
  const draft = await write.saveContentSectionDraft(
    memory.binding,
    input(),
    0,
    context(OWNER, "linked-section-create"),
  );
  const publication = await write.publishContentSection(
    memory.binding,
    "artist-statement",
    1,
    context(OWNER, "linked-section-publish"),
  );
  seedPublishedPage(
    memory.database,
    {
      sectionId: draft.value.sectionId,
      publishedRevisionId: publication.value.publishedRevisionId,
    },
    "existing",
  );

  await runtimeCode(
    write.archiveContentSection(
      memory.binding,
      "artist-statement",
      2,
      context(OWNER, "linked-section-archive"),
    ),
    "CONTENT_SECTION_IN_USE",
  );
  assert.equal(
    scalar(
      memory.database,
      "SELECT publication_state FROM content_sections WHERE section_key = 'artist-statement'",
    ),
    "published",
  );
});

test("archive rejects a published page link added at the batch boundary", async (t) => {
  const memory = await setup();
  t.after(() => memory.close());
  const draft = await write.saveContentSectionDraft(
    memory.binding,
    input(),
    0,
    context(OWNER, "boundary-linked-section-create"),
  );
  const publication = await write.publishContentSection(
    memory.binding,
    "artist-statement",
    1,
    context(OWNER, "boundary-linked-section-publish"),
  );
  const operationKey = "boundary-linked-section-archive";
  const boundary = injectBeforeBatch(memory.binding, () => {
    seedPublishedPage(
      memory.database,
      {
        sectionId: draft.value.sectionId,
        publishedRevisionId: publication.value.publishedRevisionId,
      },
      "boundary",
    );
  });

  await runtimeCode(
    write.archiveContentSection(
      boundary,
      "artist-statement",
      2,
      context(OWNER, operationKey),
    ),
    "STALE_STATE",
  );
  assert.equal(
    scalar(
      memory.database,
      "SELECT publication_state FROM content_sections WHERE section_key = 'artist-statement'",
    ),
    "published",
  );
  assert.equal(
    scalar(
      memory.database,
      "SELECT COUNT(*) FROM audit_events WHERE idempotency_key = ?",
      `content-section.archive:${OWNER}:${operationKey}`,
    ),
    0,
  );
});
