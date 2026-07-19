import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";

import { createInMemoryD1, scalar } from "./helpers/in-memory-d1.mjs";

register(
  new URL("./helpers/typescript-alias-loader.mjs", import.meta.url),
  import.meta.url,
);

const [contentWrite, pageWrite, siteRead] = await Promise.all([
  import("../db/content-section-write.ts"),
  import("../db/page-write.ts"),
  import("../db/site-read.ts"),
]);

const OWNER = "user_structured_page_owner";
let requestSequence = 0;
function context(label, actorUserId = OWNER) {
  requestSequence += 1;
  return {
    actorUserId,
    idempotencyKey: `${label}-${requestSequence}`,
    requestId: `request-${label}-${requestSequence}`,
  };
}

function sectionInput(bodyText) {
  return {
    sectionKey: "artist-story",
    kind: "prose",
    heading: "Artist story",
    bodyText,
  };
}

function pageInput(sectionRevisionIds) {
  return {
    slug: "story",
    title: "Story",
    introduction: "A fictional structured page.",
    bodyText: "",
    sectionRevisionIds,
    moduleKey: null,
    kind: "standard",
  };
}

async function runtimeCode(promise, code) {
  await assert.rejects(promise, (error) => {
    assert.equal(error?.name, "RuntimeError");
    assert.equal(error?.code, code);
    return true;
  });
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

test("page publications freeze ordered reusable section revisions and advance deliberately", async (t) => {
  const memory = await createInMemoryD1();
  t.after(() => memory.close());
  memory.database.exec(`
    INSERT INTO users (id, email, normalized_email, status)
    VALUES ('${OWNER}', 'structured-owner@example.invalid',
            'structured-owner@example.invalid', 'active');
    INSERT INTO role_assignments
      (id, user_id, role_key, assigned_by_user_id)
    VALUES ('role_structured_page_owner', '${OWNER}', 'owner', '${OWNER}');
  `);

  const sectionOne = await contentWrite.saveContentSectionDraft(
    memory.binding,
    sectionInput("The first frozen fictional artist story."),
    0,
    context("section-one-draft"),
  );
  await contentWrite.publishContentSection(
    memory.binding,
    "artist-story",
    1,
    context("section-one-publish"),
  );
  const firstPageDraft = await pageWrite.savePageDraft(
    memory.binding,
    pageInput([sectionOne.value.revisionId]),
    0,
    context("page-one-draft"),
  );
  await pageWrite.publishPage(
    memory.binding,
    "story",
    firstPageDraft.value.version,
    context("page-one-publish"),
  );

  const firstPublic = await siteRead.readPublishedPageBySlug(
    memory.binding,
    "story",
  );
  assert.equal(firstPublic.revision.sections.length, 1);
  assert.equal(
    firstPublic.revision.sections[0].bodyText,
    "The first frozen fictional artist story.",
  );
  assert.equal(
    firstPublic.revision.sections[0].revisionId,
    sectionOne.value.revisionId,
  );

  const sectionTwo = await contentWrite.saveContentSectionDraft(
    memory.binding,
    sectionInput("The second frozen fictional artist story."),
    2,
    context("section-two-draft"),
  );
  await contentWrite.publishContentSection(
    memory.binding,
    "artist-story",
    3,
    context("section-two-publish"),
  );
  assert.equal(
    (await siteRead.readPublishedPageBySlug(memory.binding, "story")).revision
      .sections[0].revisionId,
    sectionOne.value.revisionId,
  );

  const secondPageDraft = await pageWrite.savePageDraft(
    memory.binding,
    pageInput([sectionTwo.value.revisionId]),
    2,
    context("page-two-draft"),
  );
  assert.equal(
    (await siteRead.readPublishedPageBySlug(memory.binding, "story")).revision
      .sections[0].revisionId,
    sectionOne.value.revisionId,
  );
  await pageWrite.publishPage(
    memory.binding,
    "story",
    secondPageDraft.value.version,
    context("page-two-publish"),
  );
  const secondPublic = await siteRead.readPublishedPageBySlug(
    memory.binding,
    "story",
  );
  assert.equal(
    secondPublic.revision.sections[0].bodyText,
    "The second frozen fictional artist story.",
  );
  assert.equal(
    secondPublic.revision.sections[0].revisionId,
    sectionTwo.value.revisionId,
  );

  await runtimeCode(
    contentWrite.archiveContentSection(
      memory.binding,
      "artist-story",
      4,
      context("section-in-use-archive"),
    ),
    "CONTENT_SECTION_IN_USE",
  );

  const pageVersionBeforeRejectedDraft = memory.database
    .prepare("SELECT version FROM pages WHERE slug = 'story'")
    .get().version;
  const pageRevisionCountBeforeRejectedDraft = scalar(
    memory.database,
    "SELECT COUNT(*) FROM page_revisions WHERE page_id = ?",
    secondPageDraft.value.pageId,
  );
  await runtimeCode(
    pageWrite.savePageDraft(
      memory.binding,
      pageInput(["content_section_revision_unavailable"]),
      pageVersionBeforeRejectedDraft,
      context("page-unavailable-section"),
    ),
    "STALE_STATE",
  );
  assert.equal(
    memory.database
      .prepare("SELECT version FROM pages WHERE slug = 'story'")
      .get().version,
    pageVersionBeforeRejectedDraft,
  );
  assert.equal(
    scalar(
      memory.database,
      "SELECT COUNT(*) FROM page_revisions WHERE page_id = ?",
      secondPageDraft.value.pageId,
    ),
    pageRevisionCountBeforeRejectedDraft,
  );
  assert.deepEqual(
    memory.database.prepare("PRAGMA foreign_key_check").all(),
    [],
  );
});

test("page editors compose owner-published reusable sections within their page scope", async (t) => {
  const memory = await createInMemoryD1();
  t.after(() => memory.close());
  memory.database.exec(`
    INSERT INTO users (id, email, normalized_email, status)
    VALUES
      ('${OWNER}', 'structured-owner@example.invalid',
       'structured-owner@example.invalid', 'active'),
      ('user_structured_page_editor', 'structured-editor@example.invalid',
       'structured-editor@example.invalid', 'active');
    INSERT INTO role_assignments
      (id, user_id, role_key, assigned_by_user_id)
    VALUES
      ('role_structured_page_owner', '${OWNER}', 'owner', '${OWNER}'),
      ('role_structured_page_editor', 'user_structured_page_editor', 'editor',
       '${OWNER}');
    INSERT INTO editor_permissions
      (id, user_id, permission_key, scope_id, assigned_by_user_id)
    VALUES
      ('permission_structured_page_editor', 'user_structured_page_editor',
       'pages.write', 'story', '${OWNER}');
  `);

  const section = await contentWrite.saveContentSectionDraft(
    memory.binding,
    sectionInput("A reusable section controlled by the owner."),
    0,
    context("editor-boundary-section-draft"),
  );
  await contentWrite.publishContentSection(
    memory.binding,
    "artist-story",
    1,
    context("editor-boundary-section-publish"),
  );
  const ownerPage = await pageWrite.savePageDraft(
    memory.binding,
    pageInput([section.value.revisionId]),
    0,
    context("editor-boundary-page-draft"),
  );
  const editorDraft = await pageWrite.savePageDraft(
    memory.binding,
    {
      ...pageInput([section.value.revisionId]),
      introduction: "A fictional introduction revised by the editor.",
    },
    ownerPage.value.version,
    context("editor-content-save", "user_structured_page_editor"),
  );
  assert.equal(editorDraft.value.version, 2);
  const editorComposition = await pageWrite.savePageDraft(
    memory.binding,
    pageInput([]),
    editorDraft.value.version,
    context("editor-composition-save", "user_structured_page_editor"),
  );
  assert.equal(editorComposition.value.version, 3);
  assert.equal(
    memory.database
      .prepare("SELECT version FROM pages WHERE slug = 'story'")
      .get().version,
    3,
  );
  assert.equal(
    scalar(
      memory.database,
      `SELECT COUNT(*)
       FROM page_revision_sections
       JOIN pages ON pages.draft_revision_id =
                     page_revision_sections.page_revision_id
       WHERE pages.slug = 'story'`,
    ),
    0,
  );
  await runtimeCode(
    pageWrite.savePageDraft(
      memory.binding,
      { ...pageInput([]), kind: "legal" },
      editorComposition.value.version,
      context("editor-kind-save", "user_structured_page_editor"),
    ),
    "STALE_STATE",
  );
  assert.equal(
    memory.database
      .prepare("SELECT version FROM pages WHERE slug = 'story'")
      .get().version,
    3,
  );
  const revokedRead = injectBeforeQuery(
    memory.binding,
    "LEFT JOIN page_revision_sections",
    () => {
      memory.database.exec(`
        UPDATE editor_permissions
        SET revoked_at = '2026-07-19T09:45:00.000Z',
            revoked_by_user_id = '${OWNER}'
        WHERE id = 'permission_structured_page_editor'
          AND revoked_at IS NULL
      `);
    },
  );
  assert.equal(
    await siteRead.readAdminPageDraftBySlug(
      revokedRead,
      "story",
      "user_structured_page_editor",
    ),
    null,
  );
});
